// Link coupons to products. Kroger's coupon data names products only in words, so
// each link carries a confidence:
//   high    brand matches and most of the coupon's product words appear in the name
//   medium  brand matches and the department matches, or the coupon is brand-wide
// Anything weaker is not linked, and the coupon is flagged unmatched instead.
import { prisma } from '../db.js';
import { stems, brandKey, fold, DESCRIPTORS } from '../lib/text.js';
import { cachedSearch } from './catalog.js';
import { productBudgetLeft } from './kroger.js';
import { isFood } from '../lib/categories.js';

export const isGroceryCoupon = (c) => (isFood(c.categories || []) || (c.categories || []).includes('General'))
  && !['POINTS', 'SERVICE', 'UNKNOWN'].includes(c.discountType) && !c.minSpend;

// Abbreviations Kroger uses in coupon copy for its own brands.
const BRAND_ALIASES = {
  ps: 'privateselection',
  st: 'simpletruth',
  sto: 'simpletruthorganic',
  kroger: 'kroger',
};

// Coupon copy without the offer prefix: "Save $3.00 on 2 Colgate" -> "Colgate".
export function productPhrase(description) {
  return String(description)
    .replace(/^\s*(save|get)\s+/i, '')
    .replace(/^\s*(\$\s?\d+(\.\d+)?|\d+(\.\d+)?\s?¢|\d+\.\d{2}|\d+\s?%)\s*(off)?\s*(\/?\s?lb\.?)?\s*/i, '')
    .replace(/^\s*on\s+(any\s+)?(\d+\s+)?/i, '')
    .replace(/^\s*(buy\s+\d+,?\s*(save\s+\$?[\d.]+\s*)?(on\s+)?)/i, '')
    .replace(/\b(pickup or delivery only|valid in .*$|limit \d+.*$)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function brandWords(brand) {
  return new Set(stems(brand || ''));
}

export function couponKeywords(coupon) {
  const bw = brandWords(coupon.brand);
  return [...new Set(stems(productPhrase(coupon.description)).filter((w) => !bw.has(w) && w.length > 2))];
}

function productBrandKeys(p) {
  const keys = new Set();
  if (p.brand) keys.add(brandKey(p.brand));
  return keys;
}

// Does this product carry the coupon's brand, or a brand the coupon names?
function brandHit(coupon, product, phraseFolded) {
  const cb = brandKey(coupon.brand || '');
  const pb = brandKey(product.brand || '');
  const nameKey = brandKey(product.name);
  if (cb && (pb === cb || (cb.length >= 4 && (pb.startsWith(cb) || cb.startsWith(pb) && pb.length >= 4)))) return true;
  if (cb && cb.length >= 4 && nameKey.includes(cb)) return true;
  // Multi-brand coupons: "$2.99 Ruffles, Tostitos or Smartfood".
  if (pb.length >= 4 && phraseFolded.replace(/[^a-z0-9]+/g, '').includes(pb)) return true;
  // Kroger abbreviations: "PS Sliced Italian Meats" means Private Selection.
  for (const w of phraseFolded.split(/[^a-z]+/)) {
    if (BRAND_ALIASES[w] && pb.startsWith(BRAND_ALIASES[w])) return true;
  }
  return false;
}

// Nouns that name a kind of product, not a product.
const GENERIC = new Set(['cereal', 'cheese', 'chip', 'cracker', 'snack', 'juice', 'drink', 'beverage', 'sauce', 'soup',
  'bread', 'coffee', 'water', 'cookie', 'candy', 'dessert', 'meal', 'dinner', 'food', 'pie', 'cake', 'vegetable', 'fruit']);

export function scoreLink(coupon, product, keywords = couponKeywords(coupon)) {
  const phrase = fold(productPhrase(coupon.description));
  if (!brandHit(coupon, product, phrase)) return null;
  const nameStems = new Set([...stems(product.name), ...(product.categories || []).flatMap((c) => stems(c))]);
  // Only product nouns count ("turkey", "cheese"), never descriptors ("frozen", "large").
  const strong = keywords.filter((k) => !DESCRIPTORS.has(k));
  const overlap = strong.filter((k) => nameStems.has(k));
  const catHit = !coupon.categories?.length || coupon.categories.includes('General') || (product.categories || []).some((c) => coupon.categories.includes(c));
  if (!catHit) return null;
  // Multi-product coupons ("Ruffles, Tostitos or Smartfood", "Axe or Dove") list
  // alternatives, so one named product is enough there.
  const alternatives = /,| or /i.test(productPhrase(coupon.description));
  const ratio = strong.length ? overlap.length / strong.length : 0;
  // "Size" words: "Large Eggs" does not certainly cover Jumbo or Extra Large.
  const sizeOf = (t) => (/extra large|\bxl\b/.test(t) ? 'xl' : /\bjumbo\b/.test(t) ? 'jumbo' : /\blarge\b/.test(t) ? 'large' : /\bmedium\b/.test(t) ? 'medium' : /\bsmall\b/.test(t) ? 'small' : null);
  const cSize = sizeOf(phrase);
  const pSize = sizeOf(fold(product.name));
  const sizeClash = cSize && pSize && cSize !== pSize;
  // Specific names ("Chex", "turkey") must appear on the product. Generic nouns
  // ("cereal") only decide a link when they are all the coupon says.
  const specific = strong.filter((k) => !GENERIC.has(k));
  const specOverlap = specific.filter((k) => nameStems.has(k));
  const high = (why) => ({ confidence: 'high', score: Math.round((0.6 + 0.4 * ratio) * 100) / 100, reason: why });
  const medium = (why) => ({ confidence: 'medium', score: Math.round((0.3 + 0.3 * ratio) * 100) / 100, reason: why });
  if (specific.length) {
    if (!specOverlap.length) return null;
    if (!sizeClash && (specOverlap.length === specific.length || alternatives)) return high(`brand and ${overlap.join(', ')}`);
    return medium(`brand and ${overlap.join(', ')}`);
  }
  if (!strong.length) return medium('brand-wide coupon');
  if (!overlap.length) return null;
  return sizeClash ? medium(`brand and ${overlap.join(', ')}`) : high(`brand and ${overlap.join(', ')}`);
}

async function candidatesFor(coupon, allBrands, keywords) {
  const phrase = fold(productPhrase(coupon.description)).replace(/[^a-z0-9]+/g, '');
  const brands = new Set();
  if (coupon.brand) brands.add(coupon.brand);
  for (const b of allBrands) {
    const k = brandKey(b);
    if (k.length >= 4 && phrase.includes(k)) brands.add(b);
  }
  for (const w of fold(coupon.description).split(/[^a-z]+/)) {
    if (BRAND_ALIASES[w]) for (const b of allBrands) if (brandKey(b).startsWith(BRAND_ALIASES[w])) brands.add(b);
  }
  if (!brands.size) return [];
  const brandWhere = {
    OR: [...brands].flatMap((b) => [
      { brand: { equals: b, mode: 'insensitive' } },
      ...(b.length >= 4 ? [{ name: { contains: b, mode: 'insensitive' } }] : []),
    ]),
  };
  // Broad brands (Kroger has thousands of items): require a product word too.
  const strong = keywords.filter((k) => !DESCRIPTORS.has(k));
  const where = strong.length
    ? { AND: [brandWhere, { OR: strong.map((k) => ({ name: { contains: k, mode: 'insensitive' } })) }] }
    : brandWhere;
  return prisma.dealProduct.findMany({
    where,
    select: { upc: true, name: true, brand: true, categories: true, soldBy: true },
    take: 400,
  });
}

// For grocery coupons never searched before, pull matching products into the
// catalog with one targeted search each ("Sabra Hummus"), within the API budget.
export async function targetedSearches(locationId, log = () => {}) {
  const coupons = await prisma.dealCoupon.findMany({
    where: { status: 'active', matchStatus: { not: 'not_grocery' }, searchedAt: null },
    orderBy: { lastSeenAt: 'desc' },
    take: 300,
  });
  let calls = 0;
  for (const c of coupons) {
    if ((await productBudgetLeft()) < 200) { log('Stopping targeted coupon searches: saving API budget for lookups'); break; }
    const segments = productPhrase(c.description).split(/,| or | and |&/i).map((s) => s.trim()).filter((s) => s.length > 2).slice(0, 2);
    const queries = segments.length ? segments.map((s) => (c.brand && !fold(s).includes(fold(c.brand)) && segments.length === 1 ? `${c.brand} ${s}` : s)) : [c.brand].filter(Boolean);
    let failed = false;
    for (const q of queries) {
      try {
        await cachedSearch(q, locationId, { limit: 25 });
        calls++;
      } catch (e) {
        failed = true;
        log(`Targeted search "${q}" failed: ${e.message}`);
        if (e.code === 'KROGER_LIMIT') return calls;
      }
    }
    // Retry next run when Kroger had a hiccup.
    if (!failed) await prisma.dealCoupon.update({ where: { id: c.id }, data: { searchedAt: new Date() } });
  }
  return calls;
}

// Rebuild every link for active coupons. Cheap: runs against the local catalog only.
export async function relinkAll(log = () => {}) {
  const coupons = await prisma.dealCoupon.findMany({ where: { status: 'active' } });
  const brandRows = await prisma.dealProduct.findMany({ where: { brand: { not: null } }, select: { brand: true }, distinct: ['brand'] });
  const allBrands = brandRows.map((r) => r.brand).filter(Boolean);
  let links = 0;
  let matched = 0;
  for (const c of coupons) {
    const grocery = isGroceryCoupon(c);
    const keywords = couponKeywords(c);
    const found = [];
    if (grocery) {
      for (const p of await candidatesFor(c, allBrands, keywords)) {
        // "$0.58/lb" can only mean something for items sold by weight.
        if (c.perLb && p.soldBy !== 'WEIGHT') continue;
        const s = scoreLink(c, p, keywords);
        if (s) found.push({ couponId: c.id, upc: p.upc, ...s });
      }
    }
    found.sort((a, b) => b.score - a.score);
    // Keep high links, and medium only when nothing scored high.
    const highs = found.filter((f) => f.confidence === 'high');
    const keep = (highs.length ? highs : found).slice(0, 40);
    // Fixed-price deals: remember the regular price of the smallest matched size.
    let sizeRefPrice = null;
    if (c.discountType === 'FIXED_PRICE' && c.fixedPrice && keep.length) {
      const prices = await prisma.dealStorePrice.findMany({ where: { upc: { in: keep.filter((k) => k.confidence === 'high').map((k) => k.upc) }, regular: { gt: c.fixedPrice } }, select: { regular: true } });
      if (prices.length) sizeRefPrice = Math.min(...prices.map((p) => p.regular));
    }
    await prisma.$transaction([
      prisma.dealCouponProduct.deleteMany({ where: { couponId: c.id } }),
      ...(keep.length ? [prisma.dealCouponProduct.createMany({ data: keep, skipDuplicates: true })] : []),
      prisma.dealCoupon.update({ where: { id: c.id }, data: { sizeRefPrice, matchStatus: !grocery ? 'not_grocery' : keep.length ? 'matched' : 'unmatched' } }),
    ]);
    links += keep.length;
    if (keep.length) matched++;
  }
  await prisma.dealCouponProduct.deleteMany({ where: { coupon: { status: { not: 'active' } } } });
  log(`Linked ${matched} of ${coupons.length} active coupons to ${links} products`);
  return { coupons: coupons.length, matched, links };
}
