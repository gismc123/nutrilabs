// Nightly price sync from the official API: staples, wanted items, and NutriLabs
// grocery list items for every store a user chose, then targeted coupon searches
// and relinking.
import { prisma } from '../db.js';
import { config } from '../config.js';
import { STAPLES } from './staples.js';
import { cachedSearch, syncLocations } from './catalog.js';
import { productBudgetLeft, krogerConfigured } from './kroger.js';
import { targetedSearches, relinkAll } from './matcher.js';
import { groceryItemsForAllUsers } from './nutrilabs.js';

let running = null;
const queued = new Set(); // location ids, or '*' for every user's store

export const priceSyncRunning = () => !!running;

export async function ensureStaples() {
  await prisma.dealWatchTerm.createMany({ data: STAPLES.map((term) => ({ term, source: 'staple' })), skipDuplicates: true });
}

// locationIds: just these stores (a user picked a new one). Omitted: all users' stores.
// A request that arrives mid-run is queued and runs right after.
export function startPriceSync(reason = 'manual', locationIds = null) {
  if (locationIds) locationIds.forEach((l) => queued.add(l));
  else queued.add('*');
  if (running) return running;
  running = (async () => {
    while (queued.size) {
      const batch = [...queued];
      queued.clear();
      const ids = batch.includes('*') ? [...new Set([...(await syncLocations(config.maxSyncStores)), ...batch.filter((b) => b !== '*')])] : batch;
      await runPriceSync(reason, ids);
    }
  })().finally(() => { running = null; });
  return running;
}

async function runPriceSync(reason, locationIds) {
  const log = (m) => console.log(`[deals price-sync] ${m}`);
  const run = await prisma.dealSyncRun.create({ data: { kind: 'prices', startedAt: new Date(), status: 'running', note: `${reason}: ${locationIds.join(', ') || 'no stores'}` } });
  const counts = { stores: locationIds.length, terms: 0, products: 0, couponSearches: 0, failures: 0 };
  try {
    if (!krogerConfigured()) throw new Error('Kroger API credentials are not set');
    if (!locationIds.length) throw new Error('No user has picked a Kroger store yet.');
    await ensureStaples();

    // Keep NutriLabs list items fresh too.
    try {
      const items = await groceryItemsForAllUsers();
      if (items.length) {
        await prisma.dealWatchTerm.createMany({ data: items.slice(0, 120).map((i) => ({ term: i.name.toLowerCase().slice(0, 80), source: 'nutrilabs' })), skipDuplicates: true });
      }
    } catch (e) { log(`NutriLabs list skipped: ${e.message}`); }

    const terms = await prisma.dealWatchTerm.findMany({ orderBy: [{ lastSyncedAt: { sort: 'asc', nulls: 'first' } }], take: 500 });
    let stop = false;
    for (const locationId of locationIds) {
      for (const t of terms) {
        if ((await productBudgetLeft()) < 300) { log('Stopping: keeping API budget for on-the-spot lookups'); stop = true; break; }
        try {
          // maxAgeMs 1h: a nightly run always refreshes yesterday's prices.
          const r = await cachedSearch(t.term, locationId, { maxAgeMs: 3_600_000 });
          counts.terms++;
          counts.products += r.upcs.length;
          await prisma.dealWatchTerm.update({ where: { term: t.term }, data: { lastSyncedAt: new Date() } });
        } catch (e) {
          counts.failures++;
          log(`"${t.term}" at ${locationId}: ${e.message}`);
          if (e.code === 'KROGER_LIMIT') { stop = true; break; }
        }
        await new Promise((r) => setTimeout(r, 150)); // gentle pacing
      }
      if (stop) break;
      counts.couponSearches += await targetedSearches(locationId, log);
    }
    const link = await relinkAll(log);
    Object.assign(counts, { linkedCoupons: link.matched, links: link.links });

    const status = counts.failures > counts.terms / 2 ? 'partial' : 'ok';
    await prisma.dealSyncRun.update({ where: { id: run.id }, data: { status, finishedAt: new Date(), counts } });
    log(`Done: ${JSON.stringify(counts)}`);
  } catch (e) {
    log(`Failed: ${e.message}`);
    await prisma.dealSyncRun.update({ where: { id: run.id }, data: { status: 'failed', finishedAt: new Date(), counts, error: String(e.message).slice(0, 2000) } });
  }
}

// After a coupon run: search for new coupons' products and relink, without the full price pass.
export async function afterCouponRun() {
  const log = (m) => console.log(`[deals coupon-link] ${m}`);
  if (krogerConfigured()) {
    for (const locationId of await syncLocations(config.maxSyncStores)) {
      try {
        await targetedSearches(locationId, log);
      } catch (e) {
        log(`targeted searches stopped: ${e.message}`);
        break;
      }
    }
  }
  return relinkAll(log);
}

// Data freshness for every screen.
export async function freshness() {
  const [lastPrices, lastCoupons, lastCouponAttempt, lastPriceAttempt] = await Promise.all([
    prisma.dealSyncRun.findFirst({ where: { kind: 'prices', status: { in: ['ok', 'partial'] } }, orderBy: { startedAt: 'desc' } }),
    prisma.dealSyncRun.findFirst({ where: { kind: 'coupons', status: { in: ['ok', 'partial'] } }, orderBy: { startedAt: 'desc' } }),
    prisma.dealSyncRun.findFirst({ where: { kind: 'coupons' }, orderBy: { startedAt: 'desc' } }),
    prisma.dealSyncRun.findFirst({ where: { kind: 'prices' }, orderBy: { startedAt: 'desc' } }),
  ]);
  const hours = (d) => (d ? (Date.now() - new Date(d).getTime()) / 3_600_000 : null);
  const alerts = [];
  if (lastCouponAttempt?.status === 'session_expired') {
    alerts.push({ kind: 'session', message: 'The Kroger login on the server has expired. Coupons still update from the public list, but run the login step to include account-only offers.' });
  } else if (lastCouponAttempt && lastCouponAttempt.status === 'failed') {
    alerts.push({ kind: 'coupons', message: `The last coupon sync failed: ${lastCouponAttempt.error || 'unknown error'}. Showing the last good data.` });
  }
  if (!lastCoupons) alerts.push({ kind: 'coupons', message: 'No coupons synced yet. Run the coupon worker on the server.' });
  else if (hours(lastCoupons.finishedAt) > 48) alerts.push({ kind: 'coupons', message: 'Coupons are more than 2 days old.' });
  if (lastPriceAttempt?.status === 'failed') alerts.push({ kind: 'prices', message: `The last price sync failed: ${lastPriceAttempt.error}` });
  if (!lastPrices) {
    alerts.push(priceSyncRunning()
      ? { kind: 'info', message: 'The first price sync is running now. Deals fill in over the next few minutes.' }
      : { kind: 'prices', message: 'Prices have not synced yet.' });
  }
  return {
    pricesAt: lastPrices?.finishedAt ?? null,
    couponsAt: lastCoupons?.finishedAt ?? null,
    couponsSignedIn: lastCoupons?.signedIn ?? null,
    priceSyncRunning: priceSyncRunning(),
    alerts,
  };
}
