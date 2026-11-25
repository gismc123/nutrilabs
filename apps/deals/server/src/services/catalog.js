// Product catalog: stores search results from the Kroger Products API with price
// history, and answers searches from cache when the data is fresh enough.
import { prisma } from '../db.js';
import { searchProducts, productBudgetLeft } from './kroger.js';
import { queryVariants } from '../lib/ingredients.js';
import { fold } from '../lib/text.js';

const SEARCH_TTL_MS = 12 * 3_600_000; // prices change weekly; half a day is plenty

export async function currentStore() {
  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  if (!cfg?.locationId) return null;
  return prisma.store.findUnique({ where: { locationId: cfg.locationId } });
}

// Upsert products and record prices. Only adds a history row when the price changed
// or the last capture is older than 20 hours, so history stays small.
export async function saveResults(results, locationId) {
  const now = new Date();
  for (const r of results) {
    const { product, price } = r;
    await prisma.product.upsert({
      where: { upc: product.upc },
      create: { ...product, raw: r.raw },
      update: { ...product, raw: r.raw },
    });
    const prev = await prisma.storePrice.findUnique({ where: { upc_locationId: { upc: product.upc, locationId } } });
    const changed = !prev || prev.regular !== price.regular || prev.promo !== price.promo;
    if (changed || now - prev.capturedAt > 20 * 3_600_000) {
      await prisma.price.create({ data: { upc: product.upc, locationId, ...price, capturedAt: now, raw: r.raw.items?.[0]?.price ?? null } });
    }
    await prisma.storePrice.upsert({
      where: { upc_locationId: { upc: product.upc, locationId } },
      create: { upc: product.upc, locationId, ...price, capturedAt: now },
      update: { ...price, capturedAt: now },
    });
  }
}

// One query against the API (or the cache). Returns upcs in Kroger's relevance order.
export async function cachedSearch(query, locationId, { maxAgeMs = SEARCH_TTL_MS, limit = 50 } = {}) {
  const q = fold(query).trim();
  const key = `${locationId}|${q}`;
  const hit = await prisma.productSearch.findUnique({ where: { key } });
  if (hit && Date.now() - hit.at.getTime() < maxAgeMs) return { upcs: hit.upcs, cached: true };
  if ((await productBudgetLeft()) <= 0) {
    if (hit) return { upcs: hit.upcs, cached: true, stale: true };
    return { upcs: [], cached: false, limited: true };
  }
  const results = await searchProducts(q, locationId, limit);
  await saveResults(results, locationId);
  const upcs = results.map((r) => r.product.upc);
  await prisma.productSearch.upsert({ where: { key }, create: { key, query: q, upcs, at: new Date() }, update: { upcs, at: new Date() } });
  return { upcs, cached: false };
}

// Ingredient search: try shelf-style variants until one returns products.
export async function searchIngredient(text, locationId, opts = {}) {
  const variants = queryVariants(text);
  for (const v of variants) {
    const r = await cachedSearch(v, locationId, opts);
    if (r.upcs.length) return { ...r, query: v, variants };
    if (r.limited) return { ...r, query: v, variants };
  }
  return { upcs: [], query: variants[0] ?? text, variants };
}

export async function loadProducts(upcs, locationId) {
  if (!upcs.length) return [];
  const rows = await prisma.product.findMany({
    where: { upc: { in: upcs } },
    include: {
      current: { where: { locationId } },
      coupons: { include: { coupon: true }, where: { coupon: { status: 'active' } } },
    },
  });
  const byUpc = new Map(rows.map((r) => [r.upc, r]));
  return upcs.map((u) => byUpc.get(u)).filter(Boolean);
}
