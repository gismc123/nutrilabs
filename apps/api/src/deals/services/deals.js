// Deals, search, and budget bundles. Pricing rules:
//  * base price = sale (promo) price when one is active, else the regular price
//  * a high-confidence coupon is applied on top of the base price
//  * a medium-confidence coupon is shown as "might also apply" and never counted
//  * coupon savings need the coupon's minimum quantity, so that is the buy quantity
import { prisma } from '../db.js';
import { applyCoupon } from './couponParser.js';
import { groupFor, isFood, GROUP_LABELS, GROUP_ORDER } from '../lib/categories.js';
import { unitPrice, round2 } from '../lib/units.js';
import { stems, singular, tokens } from '../lib/text.js';
import { searchIngredient, loadProducts } from './catalog.js';

const STALE_PRICE_MS = 8 * 86_400_000;

function activePromo(sp, now = new Date()) {
  if (sp?.promo == null) return null;
  if (sp.promoEnds && new Date(sp.promoEnds) < now) return null;
  if (sp.regular != null && sp.promo >= sp.regular) return null;
  return sp.promo;
}

function couponView(c, confidence) {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    type: c.discountType,
    confidence,
    clipped: c.clipped,
    needsClip: !c.clipped,
    pickupDeliveryOnly: c.pickupDeliveryOnly,
    minQuantity: c.minQuantity,
    usageLimit: c.usageLimit,
    expiryDate: c.expiryDate,
    weeklyDigitalDeal: c.weeklyDigitalDeal,
    // Fixed-price deals cover specific sizes: say so next to the price.
    sizeNote: c.discountType === 'FIXED_PRICE' ? 'Deal price is for select sizes. Check the size on the coupon.' : null,
  };
}

// Price one product at one store. Returns null when there is no usable price.
export function priceProduct(product, sp, now = new Date()) {
  if (!sp || sp.regular == null && sp.promo == null) return null;
  const promo = activePromo(sp, now);
  const regular = sp.regular ?? promo;
  const base = promo ?? regular;
  const links = (product.coupons || []).filter((l) => l.coupon?.status === 'active' && (!l.coupon.expiryDate || new Date(l.coupon.expiryDate) > now));

  let best = null;
  let possible = null;
  for (const l of links) {
    const applied = applyCoupon(l.coupon, base, { soldBy: product.soldBy, regular });
    if (!applied) continue;
    const cand = { link: l, applied };
    // A size-uncertain fixed price is never counted, only shown.
    if (l.confidence === 'high' && !applied.sizeUncertain) {
      if (!best || applied.savingsEach > best.applied.savingsEach) best = cand;
    } else if (!possible || applied.savingsEach > possible.applied.savingsEach) {
      possible = cand;
    }
  }
  if (best && possible && possible.applied.savingsEach <= best.applied.savingsEach) possible = null;

  const effectiveEach = best ? best.applied.each : base;
  const buyQuantity = best ? best.applied.quantity : 1;
  const savingsEach = round2(Math.max(0, regular - effectiveEach));
  const group = groupFor(product.categories);
  return {
    upc: product.upc,
    name: product.name,
    brand: product.brand,
    size: product.size,
    soldBy: product.soldBy,
    imageUrl: product.imageUrl,
    aisle: product.aisle,
    categories: product.categories,
    group,
    groupLabel: GROUP_LABELS[group],
    food: isFood(product.categories),
    url: product.productId ? `https://www.kroger.com/p/item/${product.productId}` : null,
    regular,
    promo,
    promoEnds: promo ? sp.promoEnds : null,
    onSale: promo != null,
    effectiveEach: round2(effectiveEach),
    buyQuantity,
    savingsEach,
    savingsPct: regular ? Math.round((savingsEach / regular) * 100) : 0,
    unitPrice: unitPrice(effectiveEach, product.size)?.label ?? null,
    coupon: best ? { ...couponView(best.link.coupon, 'high'), savingsEach: best.applied.savingsEach } : null,
    possibleCoupon: possible ? { ...couponView(possible.link.coupon, 'medium'), savingsEach: possible.applied.savingsEach, sizeUncertain: !!possible.applied.sizeUncertain } : null,
    priceCapturedAt: sp.capturedAt,
    isDeal: promo != null || !!best,
  };
}

// Per store: users can pick different Kroger stores.
const dealCache = new Map();
export const clearDealCache = () => dealCache.clear();

// Every product at the store with a live sale price or a linked coupon.
export async function listDeals(locationId) {
  const hit = dealCache.get(locationId);
  if (hit && Date.now() - hit.at < 120_000) return hit.deals;
  const since = new Date(Date.now() - STALE_PRICE_MS);
  const rows = await prisma.dealStorePrice.findMany({
    where: {
      locationId,
      capturedAt: { gte: since },
      OR: [{ promo: { not: null } }, { product: { coupons: { some: { coupon: { status: 'active' } } } } }],
    },
    include: { product: { include: { coupons: { where: { coupon: { status: 'active' } }, include: { coupon: true } } } } },
  });
  const now = new Date();
  const deals = rows
    .map((sp) => priceProduct(sp.product, sp, now))
    .filter((d) => d && (d.isDeal || d.possibleCoupon))
    .sort((a, b) => b.savingsEach * b.buyQuantity - a.savingsEach * a.buyQuantity);
  dealCache.set(locationId, { at: Date.now(), deals });
  return deals;
}

const matchesWord = (name, words) => {
  const s = new Set(stems(name));
  return words.some((w) => s.has(w));
};

// Choose the best value among the relevant search results for one ingredient.
function pickBest(options, words) {
  const relevant = options.filter((o) => matchesWord(o.name, words));
  const pool = (relevant.length ? relevant : options).slice(0, 12);
  if (!pool.length) return null;
  // Compare per unit when most options have a parseable size in the same unit.
  const units = pool.map((o) => unitPrice(o.effectiveEach, o.size));
  const unit = units.find(Boolean)?.unit;
  const comparable = units.filter((u) => u && u.unit === unit).length >= Math.ceil(pool.length / 2);
  // Value, nudged by Kroger's relevance so "bananas" means the usual bunch,
  // not the cheapest banana-adjacent item.
  const weight = (i) => 1 + 0.1 * i;
  const score = (o, i) => (comparable && units[i]?.unit === unit ? units[i].value * weight(i) : Number.POSITIVE_INFINITY);
  const ranked = pool.map((o, i) => ({ o, i, s: score(o, i) }));
  ranked.sort((a, b) => (comparable ? a.s - b.s : 0) || a.o.effectiveEach * weight(a.i) - b.o.effectiveEach * weight(b.i) || a.i - b.i);
  // Prefer a deal when it is within 10% of the best value.
  const top = ranked[0];
  const deal = ranked.find((r) => r.o.isDeal && (comparable ? r.s <= top.s * 1.1 : r.o.effectiveEach <= top.o.effectiveEach * 1.1));
  return (deal || top).o;
}

export async function wantedItem(text, locationId) {
  const found = await searchIngredient(text, locationId);
  const words = [...new Set(tokens(found.query || text).map(singular))];
  const products = await loadProducts(found.upcs.slice(0, 25), locationId);
  const options = products.map((p) => priceProduct(p, p.current[0])).filter(Boolean);
  const best = pickBest(options, words);
  const ordered = [...options].sort((a, b) => Number(b.isDeal) - Number(a.isDeal) || a.effectiveEach - b.effectiveEach);
  return {
    ingredient: text,
    query: found.query,
    status: best ? 'found' : found.limited ? 'limited' : 'not_found',
    best,
    options: ordered.filter((o) => o.upc !== best?.upc).slice(0, 4),
  };
}

// ---- bundles --------------------------------------------------------------

function qtyFor(item, people) {
  const p = people || 2;
  const factor = { protein: 0.5, produce: 0.5, dairy: 0.34 }[item.group] ?? 0.25;
  let q = Math.min(4, Math.max(1, Math.round(p * factor)));
  const min = item.buyQuantity || 1;
  if (min > 1) q = Math.max(min, Math.ceil(q / min) * min);
  return q;
}

function targetsFor(people) {
  const half = Math.ceil((people || 2) / 2);
  return { produce: 2 + half, protein: 1 + half, dairy: 2, pantry: 3, frozen: 1, bakery: 1, drinks: 1 };
}

function similar(a, b) {
  const x = new Set(stems(a.name));
  const y = new Set(stems(b.name));
  const inter = [...x].filter((w) => y.has(w)).length;
  return inter / Math.max(1, Math.min(x.size, y.size)) >= 0.6;
}

function line(item, qty, wanted = null) {
  return {
    upc: item.upc,
    name: item.name,
    brand: item.brand,
    size: item.size,
    imageUrl: item.imageUrl,
    aisle: item.aisle,
    group: item.group,
    groupLabel: item.groupLabel,
    quantity: qty,
    each: item.effectiveEach,
    regular: item.regular,
    lineTotal: round2(item.effectiveEach * qty),
    regularTotal: round2(item.regular * qty),
    savings: round2((item.regular - item.effectiveEach) * qty),
    onSale: item.onSale,
    promoEnds: item.promoEnds,
    coupon: item.coupon,
    possibleCoupon: item.possibleCoupon,
    wantedFor: wanted,
    perLb: item.soldBy === 'WEIGHT',
    url: item.url,
  };
}

function summarize(name, description, lines, budget) {
  const total = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const regularTotal = round2(lines.reduce((s, l) => s + l.regularTotal, 0));
  const clip = lines.filter((l) => l.coupon?.needsClip).map((l) => ({ couponId: l.coupon.id, title: l.coupon.title, description: l.coupon.description, forItem: l.name, quantity: l.quantity, pickupDeliveryOnly: l.coupon.pickupDeliveryOnly }));
  const byGroup = GROUP_ORDER.concat('other')
    .map((g) => ({ group: g, label: GROUP_LABELS[g], subtotal: round2(lines.filter((l) => l.group === g).reduce((s, l) => s + l.lineTotal, 0)), count: lines.filter((l) => l.group === g).length }))
    .filter((g) => g.count);
  return {
    name, description, items: lines, total, regularTotal, savings: round2(regularTotal - total),
    budget: budget ?? null,
    budgetLeft: budget != null ? round2(budget - total) : null,
    overBudget: budget != null && total > budget + 0.001,
    clipList: clip,
    byGroup,
  };
}

function fill(strategy, pool, { budget, people, wantedLines }) {
  const cap = budget ?? Number.POSITIVE_INFINITY;
  const lines = [...wantedLines];
  let total = lines.reduce((s, l) => s + l.lineTotal, 0);
  const picked = [...lines.map((l) => ({ name: l.name, upc: l.upc }))];
  const perGroup = {};
  const perDept = {};
  for (const l of lines) perGroup[l.group] = (perGroup[l.group] || 0) + 1;
  const targets = targetsFor(people);
  const maxItems = budget == null ? Object.values(targets).reduce((a, b) => a + b, 0) : 40;
  const itemCap = budget != null ? Math.max(8, budget * 0.2) : 15;

  const tryAdd = (item, groupCap) => {
    if (lines.length >= maxItems) return false;
    if (picked.some((p) => p.upc === item.upc || similar(p, item))) return false;
    if ((perGroup[item.group] || 0) >= groupCap) return false;
    // At most two from one Kroger department (no basket of four cereals).
    const dept = item.categories.find((c) => c !== 'Natural & Organic') || item.group;
    if ((perDept[dept] || 0) >= 2) return false;
    const qty = qtyFor(item, people);
    const cost = item.effectiveEach * qty;
    if (total + cost > cap + 0.001) return false;
    // No single deal should swallow the budget (a $45 jug of oil is not a week of food).
    if (cost > itemCap) return false;
    lines.push(line(item, qty));
    picked.push(item);
    perDept[dept] = (perDept[dept] || 0) + 1;
    perGroup[item.group] = (perGroup[item.group] || 0) + 1;
    total += cost;
    return true;
  };

  if (strategy === 'balanced') {
    const byGroup = Object.fromEntries(GROUP_ORDER.map((g) => [g, pool.filter((d) => d.group === g).sort((a, b) => b.savingsPct - a.savingsPct)]));
    // Round-robin through the groups up to each group's target, then keep filling.
    for (let pass = 0; pass < 2; pass++) {
      let progress = true;
      while (progress) {
        progress = false;
        for (const g of GROUP_ORDER) {
          const capForPass = pass === 0 ? targets[g] : targets[g] + 2;
          if ((perGroup[g] || 0) >= capForPass) continue;
          const next = byGroup[g].find((d) => tryAdd(d, capForPass));
          if (next) progress = true;
        }
      }
      if (budget == null) break;
    }
  } else if (strategy === 'savings') {
    for (const d of [...pool].sort((a, b) => b.savingsEach * qtyFor(b, people) - a.savingsEach * qtyFor(a, people))) tryAdd(d, 4);
  } else {
    // Stretch the budget: the cheapest items that are still at least 20% off.
    for (const d of pool.filter((x) => x.savingsPct >= 20).sort((a, b) => a.effectiveEach - b.effectiveEach)) tryAdd(d, 4);
  }
  return lines;
}

const TREATS = new Set(['Candy', 'Snacks']);

export function buildBundles(deals, { budget = null, people = null, wanted = [], staples = null }) {
  // Weight-priced items show a per-lb price; outside produce the real cost is
  // unknown (a whole turkey is 12+ lb), so they stay out of bundle totals.
  const pool = deals.filter((d) => d.food && d.isDeal && d.effectiveEach > 0 && d.regular > 0 && d.group !== 'other'
    && (d.soldBy !== 'WEIGHT' || d.group === 'produce'));
  // Everyday groceries (found by the staple searches) for the balanced and stretch
  // bundles; treats only when nothing else fills a category.
  const everyday = pool.filter((d) => (staples ? staples.has(d.upc) : true) && !d.categories.some((c) => TREATS.has(c)));
  const core = everyday.length >= 15 ? everyday : pool;
  const wantedLines = wanted.filter((w) => w.best).map((w) => line(w.best, qtyFor(w.best, people), w.ingredient));
  const strategies = [
    ['balanced', 'Balanced week', 'Everyday groceries across produce, protein, dairy, pantry, and frozen, best discounts first.'],
    ['savings', 'Biggest savings', 'The deals that save the most dollars, up to four per category.'],
    ['stretch', 'Stretch the budget', 'The lowest-priced everyday items that are still at least 20% off.'],
  ];
  const seen = new Set();
  const out = [];
  for (const [key, name, desc] of strategies) {
    const lines = fill(key, key === 'savings' ? pool.filter((d) => !d.categories.includes('Candy')) : core, { budget, people, wantedLines });
    const sig = lines.map((l) => l.upc).sort().join(',');
    if (!lines.length || seen.has(sig)) continue;
    seen.add(sig);
    out.push({ key, ...summarize(name, desc, lines, budget) });
  }
  return out;
}

// Products that the everyday staple searches turn up (top 15 per staple term).
let stapleCache = { key: null, at: 0, set: null };
async function stapleSet(locationId) {
  if (stapleCache.key === locationId && Date.now() - stapleCache.at < 600_000) return stapleCache.set;
  const terms = await prisma.dealWatchTerm.findMany({ where: { source: { in: ['staple', 'nutrilabs', 'wanted'] } }, select: { term: true } });
  const rows = await prisma.dealProductSearch.findMany({ where: { key: { in: terms.map((t) => `${locationId}|${t.term}`) } }, select: { upcs: true } });
  const set = new Set(rows.flatMap((r) => r.upcs.slice(0, 15)));
  stapleCache = { key: locationId, at: Date.now(), set };
  return set;
}

// ---- the search endpoint ---------------------------------------------------

export async function searchDeals({ budget = null, people = null, ingredients = [], includeNonFood = false }, locationId) {
  const deals = await listDeals(locationId);
  const wanted = [];
  for (const text of ingredients.slice(0, 25)) wanted.push(await wantedItem(text, locationId));

  const words = [...new Set(ingredients.flatMap((t) => tokens(t).map(singular)))];
  const shown = deals.filter((d) => (includeNonFood || d.food) && d.isDeal);
  const related = words.length ? shown.filter((d) => matchesWord(d.name, words)) : [];
  const relatedSet = new Set(related.map((d) => d.upc));
  const rest = shown.filter((d) => !relatedSet.has(d.upc));

  const bundles = budget != null || people != null || wanted.length ? buildBundles(deals, { budget, people, wanted, staples: await stapleSet(locationId) }) : [];
  return {
    inputs: { budget, people, ingredients },
    wanted,
    relatedDeals: related.slice(0, 40),
    deals: rest.slice(0, 80),
    possibleCoupons: deals.filter((d) => !d.isDeal && d.possibleCoupon && (includeNonFood || d.food)).slice(0, 30),
    totalDeals: shown.length,
    bundles,
  };
}
