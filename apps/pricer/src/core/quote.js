import { RETAILER_POLICY } from '../config.js';
import { RETAILERS } from '../retailers/index.js';
import { pickBest } from './match.js';
import { searchTerm } from './text.js';
import { unitPrice } from './units.js';
import { getCachedQuote, logEvent, putCachedQuote, quoteKey } from './store.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randomBetween = ([min, max]) => min + Math.random() * (max - min);

function buildQuote({ item, term, retailer, storeId, storeName, product }) {
  const base = {
    item: item.name,
    query: term,
    retailer,
    storeId: storeId ?? null,
    store: storeName ?? null,
    fetchedAt: new Date().toISOString(),
  };
  if (!product) return { ...base, status: 'no_match' };
  const unit = product.unitPriceText
    ? { label: product.unitPriceText }
    : unitPrice(product.price, product.size ?? product.name);
  return {
    ...base,
    status: 'ok',
    product: product.name,
    size: product.size ?? null,
    price: product.price,
    regularPrice: product.regularPrice ?? product.price,
    onSale: !!product.onSale,
    saleEnds: product.saleEnds ?? null,
    unitPrice: unit?.label ?? null,
    matchScore: product.matchScore,
    url: product.url ?? null,
  };
}

function withAge(quote, cacheDays) {
  const ageMs = Date.now() - new Date(quote.fetchedAt).getTime();
  return { ...quote, cached: true, stale: ageMs > cacheDays * DAY_MS };
}

/**
 * Price a list of items at one retailer.
 *
 * live: whether this call may contact the retailer at all. Otherwise each item
 * gets its cached price with its fetchedAt timestamp.
 */
export async function quoteRetailer({ retailer, items, storeId, storeName, live, force = false, limit, onProgress }) {
  const adapter = RETAILERS[retailer];
  const policy = RETAILER_POLICY[retailer];
  if (!adapter) throw new Error(`Unknown retailer "${retailer}"`);
  if (adapter.needsStore && !storeId) {
    return items.map((item) => ({ item: item.name, retailer, status: 'no_store', fetchedAt: null }));
  }

  const maxLive = Math.min(limit ?? Infinity, policy.maxPerRun);
  let liveCount = 0;
  let consecutiveErrors = 0;
  let detectedStore = storeName ?? null;
  const results = [];

  for (const item of items) {
    const term = searchTerm(item.name);
    const key = quoteKey(retailer, storeId, term);
    const cached = getCachedQuote(key);
    const fresh = cached && Date.now() - new Date(cached.fetchedAt) < policy.cacheDays * DAY_MS && !force;

    const mayFetch = live && liveCount < maxLive && consecutiveErrors < 3;
    if (fresh || !mayFetch) {
      if (cached) results.push(withAge(cached, policy.cacheDays));
      else results.push({ item: item.name, query: term, retailer, status: 'not_fetched', fetchedAt: null });
      continue;
    }

    // Pace every live request after the first, at random intervals.
    if (liveCount > 0) await sleep(randomBetween(policy.gapSec) * 1000);
    liveCount++;
    onProgress?.({ retailer, item: item.name, n: liveCount });

    try {
      const { products, store } = await adapter.search(term, storeId);
      if (store) detectedStore = store;
      const quote = buildQuote({ item, term, retailer, storeId, storeName: detectedStore, product: pickBest(term, products) });
      putCachedQuote(key, quote);
      results.push({ ...quote, cached: false, stale: false });
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors++;
      logEvent({ type: 'error', retailer, item: item.name, message: err.message });
      results.push(cached ? withAge(cached, policy.cacheDays) : { item: item.name, query: term, retailer, status: 'error', message: err.message, fetchedAt: null });
    }
  }

  if (live && liveCount > 0) {
    logEvent({ type: 'run', retailer, fetched: liveCount, items: items.length });
  }
  return results;
}

export async function quoteItems({ items, retailers, stores = {}, live = {}, force = false, limit, onProgress }) {
  const out = {};
  for (const retailer of retailers) {
    const s = stores[retailer] ?? {};
    out[retailer] = await quoteRetailer({
      retailer,
      items,
      storeId: s.id ?? null,
      storeName: s.name ?? null,
      live: live[retailer] ?? false,
      force,
      limit,
      onProgress,
    });
  }
  return out;
}
