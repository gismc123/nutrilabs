import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler, HttpError, ok } from '../lib/http.js';
import { storeForUser, searchIngredient, loadProducts } from '../services/catalog.js';
import { findStores, usageToday, krogerConfigured } from '../services/kroger.js';
import { searchDeals, priceProduct, listDeals, clearDealCache } from '../services/deals.js';
import { freshness, startPriceSync, priceSyncRunning } from '../services/priceSync.js';
import { relinkAll } from '../services/matcher.js';
import { refreshStatus, scheduleRefresh, cancelRefresh } from '../services/refresh.js';
import { groceryItemsForUser } from '../services/nutrilabs.js';
import { productPhrase } from '../services/matcher.js';
import { tokens, singular, stems } from '../lib/text.js';

export const api = Router();

async function requireStore(req) {
  const store = await storeForUser(req.user.userId);
  if (!store) throw new HttpError(409, 'Choose your Kroger store first.', 'NO_STORE');
  return store;
}

// ---- deals and search -------------------------------------------------------

const searchBody = z.object({
  budget: z.coerce.number().positive().max(5000).nullish(),
  people: z.coerce.number().int().min(1).max(20).nullish(),
  ingredients: z.array(z.string().trim().min(2).max(80)).max(25).default([]),
  includeNonFood: z.boolean().default(false),
});

api.post('/deals/search', asyncHandler(async (req, res) => {
  const body = searchBody.parse(req.body ?? {});
  const store = await requireStore(req);
  const result = await searchDeals({ ...body, budget: body.budget ?? null, people: body.people ?? null }, store.locationId);
  // Remember wanted items so the nightly run keeps their prices fresh.
  if (body.ingredients.length) {
    await prisma.dealWatchTerm.createMany({ data: body.ingredients.map((t) => ({ term: t.toLowerCase(), source: 'wanted' })), skipDuplicates: true });
  }
  ok(res, { ...result, store: { name: store.name, locationId: store.locationId }, freshness: await freshness() });
}));

// Quick aisle lookup: always asks Kroger for a fresh price (one hour cache).
api.get('/lookup', asyncHandler(async (req, res) => {
  const q = z.string().trim().min(2).max(80).parse(req.query.q);
  const store = await requireStore(req);
  const found = await searchIngredient(q, store.locationId, { maxAgeMs: 3_600_000, limit: 20 });
  const products = await loadProducts(found.upcs.slice(0, 20), store.locationId);
  // What you typed first, then Kroger's own relevance order. Deals carry badges.
  const words = [...new Set(tokens(found.query || q).map(singular))];
  const items = products.map((p) => priceProduct(p, p.current[0])).filter(Boolean)
    .map((item, i) => ({ item, i, rel: words.every((w) => new Set(stems(item.name)).has(w)) }))
    .sort((a, b) => Number(b.rel) - Number(a.rel) || a.i - b.i)
    .map((x) => ({ ...x.item, relevant: x.rel }));
  ok(res, { query: found.query, tried: found.variants, limited: !!found.limited, items, store: { name: store.name }, freshness: await freshness() });
}));

// ---- coupons ------------------------------------------------------------------

api.get('/coupons', asyncHandler(async (req, res) => {
  const q = z.object({
    q: z.string().trim().max(80).optional(),
    category: z.string().max(60).optional(),
    match: z.enum(['all', 'matched', 'unmatched', 'grocery']).default('grocery'),
    sort: z.enum(['value', 'expiry', 'new']).default('expiry'),
  }).parse(req.query);
  const where = { status: 'active' };
  if (q.category) where.categories = { has: q.category };
  if (q.match === 'matched') where.matchStatus = 'matched';
  if (q.match === 'unmatched') where.matchStatus = 'unmatched';
  if (q.match === 'grocery') where.matchStatus = { in: ['matched', 'unmatched', 'pending'] };
  if (q.q) where.OR = [{ description: { contains: q.q, mode: 'insensitive' } }, { brand: { contains: q.q, mode: 'insensitive' } }, { title: { contains: q.q, mode: 'insensitive' } }];
  const orderBy = q.sort === 'value' ? [{ amountOff: { sort: 'desc', nulls: 'last' } }] : q.sort === 'new' ? [{ firstSeenAt: 'desc' }] : [{ expiryDate: 'asc' }];
  const rows = await prisma.dealCoupon.findMany({ where, orderBy, take: 300, include: { _count: { select: { products: true } } } });
  const categories = await prisma.$queryRaw`SELECT c AS name, COUNT(*)::int AS count FROM deal_coupons, unnest(categories) AS c WHERE status = 'active' GROUP BY c ORDER BY count DESC`;
  ok(res, {
    coupons: rows.map(({ raw, terms, _count, ...c }) => ({ ...c, productCount: _count.products, productPhrase: productPhrase(c.description) })),
    categories,
    freshness: await freshness(),
  });
}));

api.get('/coupons/:id', asyncHandler(async (req, res) => {
  const store = await storeForUser(req.user.userId);
  const c = await prisma.dealCoupon.findUnique({
    where: { id: String(req.params.id) },
    include: { products: { include: { product: { include: { current: store ? { where: { locationId: store.locationId } } : true, coupons: { include: { coupon: true } } } } } } },
  });
  if (!c) throw new HttpError(404, 'Coupon not found', 'NOT_FOUND');
  const { raw, products, ...coupon } = c;
  ok(res, {
    coupon,
    products: products
      .sort((a, b) => b.score - a.score)
      .map((l) => ({ confidence: l.confidence, reason: l.reason, item: store ? priceProduct(l.product, l.product.current[0]) : null, name: l.product.name, upc: l.upc })),
  });
}));

// ---- store, settings, sync ----------------------------------------------------

api.get('/stores', asyncHandler(async (req, res) => {
  const zip = z.string().regex(/^\d{5}$/, 'a 5-digit zip').parse(req.query.zip);
  ok(res, await findStores(zip, 25));
}));

api.get('/settings', asyncHandler(async (req, res) => {
  const cfg = await prisma.appSettings.findUnique({ where: { userId: req.user.userId }, select: { krogerZip: true } });
  ok(res, {
    zip: cfg?.krogerZip ?? null,
    store: await storeForUser(req.user.userId),
    isAdmin: !!req.user.isAdmin,
    krogerApi: { configured: krogerConfigured(), usage: await usageToday() },
  });
}));

// Saves to the user's NutriLabs settings, so NutriLabs grocery pricing uses the same store.
api.put('/settings/store', asyncHandler(async (req, res) => {
  const body = z.object({
    zip: z.string().regex(/^\d{5}$/),
    store: z.object({ locationId: z.string().min(4).max(20), name: z.string().max(120), address: z.string().max(200).nullish(), zip: z.string().max(10).nullish(), lat: z.number().nullish(), lng: z.number().nullish() }),
  }).parse(req.body);
  const s = body.store;
  await prisma.dealStore.upsert({ where: { locationId: s.locationId }, create: { ...s, address: s.address ?? null, zip: s.zip ?? null }, update: { name: s.name, address: s.address ?? null, zip: s.zip ?? null, lat: s.lat ?? null, lng: s.lng ?? null } });
  const fields = { krogerZip: body.zip, krogerLocationId: s.locationId, krogerStoreName: s.name.slice(0, 100) };
  await prisma.appSettings.upsert({ where: { userId: req.user.userId }, create: { userId: req.user.userId, ...fields }, update: fields });
  // A store with no recent prices: start filling them right away.
  const priced = await prisma.dealStorePrice.count({ where: { locationId: s.locationId, capturedAt: { gte: new Date(Date.now() - 2 * 86_400_000) } } });
  if (priced < 200 && krogerConfigured()) startPriceSync('store picked', [s.locationId]).then(clearDealCache);
  ok(res, await storeForUser(req.user.userId));
}));

api.get('/sync/status', asyncHandler(async (req, res) => {
  const store = await storeForUser(req.user.userId);
  const [runs, couponCounts, products] = await Promise.all([
    prisma.dealSyncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 20 }),
    prisma.dealCoupon.groupBy({ by: ['status', 'matchStatus'], _count: true }),
    store ? prisma.dealStorePrice.count({ where: { locationId: store.locationId } }) : 0,
  ]);
  const deals = store ? await listDeals(store.locationId) : [];
  ok(res, {
    freshness: await freshness(),
    runs: req.user.isAdmin ? runs : runs.map(({ error, ...r }) => r),
    coupons: couponCounts.map((c) => ({ status: c.status, matchStatus: c.matchStatus, count: c._count })),
    products,
    deals: { onSale: deals.filter((d) => d.onSale).length, withCoupon: deals.filter((d) => d.coupon).length, possible: deals.filter((d) => d.possibleCoupon && !d.coupon).length },
    krogerApi: await usageToday(),
    priceSyncRunning: priceSyncRunning(),
  });
}));

function adminOnly(req) {
  if (!req.user.isAdmin) throw new HttpError(403, 'Only the NutriLabs admin can start a sync', 'FORBIDDEN');
}

api.post('/sync/prices', asyncHandler(async (req, res) => {
  adminOnly(req);
  if (!krogerConfigured()) throw new HttpError(503, 'Kroger API credentials are not set', 'NOT_CONFIGURED');
  const already = priceSyncRunning();
  startPriceSync('manual').then(clearDealCache);
  ok(res, { started: !already, running: true });
}));

// ---- coupon refresh schedule -----------------------------------------------------

api.get('/refresh', asyncHandler(async (req, res) => {
  ok(res, { ...(await refreshStatus()), isAdmin: Boolean(req.user.isAdmin) });
}));

const refreshBody = z.object({ runAt: z.string().datetime({ offset: true }).nullish() });

api.post('/refresh', asyncHandler(async (req, res) => {
  adminOnly(req);
  const { runAt } = refreshBody.parse(req.body || {});
  const r = await scheduleRefresh({ runAt, userId: req.user.userId });
  ok(res, { id: r.id, runAt: r.runAt });
}));

api.delete('/refresh/:id', asyncHandler(async (req, res) => {
  adminOnly(req);
  ok(res, await cancelRefresh(z.coerce.number().int().positive().parse(req.params.id)));
}));

api.post('/sync/relink', asyncHandler(async (req, res) => {
  adminOnly(req);
  const r = await relinkAll();
  clearDealCache();
  ok(res, r);
}));

// ---- NutriLabs ------------------------------------------------------------------

// This user's grocery items for this week and next, from their meal plans.
api.get('/nutrilabs/items', asyncHandler(async (req, res) => {
  ok(res, await groceryItemsForUser(req.user.userId));
}));

// ---- shopping list ----------------------------------------------------------------

const listItem = z.object({
  name: z.string().trim().min(1).max(200),
  upc: z.string().max(20).nullish(),
  couponId: z.string().max(40).nullish(),
  quantity: z.number().int().min(1).max(99).default(1),
  unitPrice: z.number().min(0).max(10000).nullish(),
  regular: z.number().min(0).max(10000).nullish(),
  needsClip: z.boolean().default(false),
  note: z.string().max(300).nullish(),
});

api.get('/list', asyncHandler(async (req, res) => {
  const items = await prisma.dealListItem.findMany({ where: { userId: req.user.userId }, orderBy: [{ checked: 'asc' }, { createdAt: 'asc' }] });
  ok(res, items);
}));

api.post('/list', asyncHandler(async (req, res) => {
  const body = z.union([listItem, z.array(listItem).max(60)]).parse(req.body);
  const items = Array.isArray(body) ? body : [body];
  if ((await prisma.dealListItem.count({ where: { userId: req.user.userId } })) + items.length > 300) throw new HttpError(400, 'The list is full (300 items). Clear some first.', 'LIST_FULL');
  await prisma.dealListItem.createMany({ data: items.map((i) => ({ ...i, userId: req.user.userId })) });
  ok(res, await prisma.dealListItem.findMany({ where: { userId: req.user.userId }, orderBy: [{ checked: 'asc' }, { createdAt: 'asc' }] }));
}));

api.patch('/list/:id', asyncHandler(async (req, res) => {
  const body = z.object({ checked: z.boolean().optional(), quantity: z.number().int().min(1).max(99).optional() }).parse(req.body);
  const r = await prisma.dealListItem.updateMany({ where: { id: Number(req.params.id), userId: req.user.userId }, data: body });
  if (!r.count) throw new HttpError(404, 'Not on your list', 'NOT_FOUND');
  ok(res, true);
}));

api.delete('/list/:id', asyncHandler(async (req, res) => {
  await prisma.dealListItem.deleteMany({ where: { id: Number(req.params.id), userId: req.user.userId } });
  ok(res, true);
}));

api.delete('/list', asyncHandler(async (req, res) => {
  const onlyChecked = req.query.checked === 'true';
  await prisma.dealListItem.deleteMany({ where: { userId: req.user.userId, ...(onlyChecked ? { checked: true } : {}) } });
  ok(res, true);
}));
