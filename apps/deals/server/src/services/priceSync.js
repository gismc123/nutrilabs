// Nightly price sync from the official API: staples, wanted items, and NutriLabs
// grocery list items, then targeted coupon searches and relinking.
import { prisma } from '../db.js';
import { STAPLES } from './staples.js';
import { cachedSearch, currentStore } from './catalog.js';
import { productBudgetLeft, krogerConfigured } from './kroger.js';
import { targetedSearches, relinkAll } from './matcher.js';
import { fetchNutrilabsItems } from './nutrilabs.js';

let running = null;

export const priceSyncRunning = () => !!running;

export async function ensureStaples() {
  await prisma.watchTerm.createMany({ data: STAPLES.map((term) => ({ term, source: 'staple' })), skipDuplicates: true });
}

export function startPriceSync(reason = 'manual') {
  if (running) return running;
  running = runPriceSync(reason).finally(() => { running = null; });
  return running;
}

async function runPriceSync(reason) {
  const log = (m) => console.log(`[price-sync] ${m}`);
  const run = await prisma.syncRun.create({ data: { kind: 'prices', startedAt: new Date(), status: 'running', note: reason } });
  const counts = { terms: 0, products: 0, couponSearches: 0, failures: 0 };
  try {
    if (!krogerConfigured()) throw new Error('Kroger API credentials are not set');
    const store = await currentStore();
    if (!store) throw new Error('No store selected. Choose one in Settings.');
    await ensureStaples();

    // Keep NutriLabs list items fresh too, when that link is set up.
    try {
      const items = await fetchNutrilabsItems();
      if (items?.length) {
        await prisma.watchTerm.createMany({ data: items.slice(0, 80).map((i) => ({ term: i.name.toLowerCase().slice(0, 80), source: 'nutrilabs' })), skipDuplicates: true });
      }
    } catch (e) { log(`NutriLabs list skipped: ${e.message}`); }

    const terms = await prisma.watchTerm.findMany({ orderBy: [{ lastSyncedAt: { sort: 'asc', nulls: 'first' } }], take: 500 });
    for (const t of terms) {
      if ((await productBudgetLeft()) < 300) { log('Stopping: keeping API budget for on-the-spot lookups'); break; }
      try {
        // maxAgeMs 1h: a nightly run always refreshes yesterday's prices.
        const r = await cachedSearch(t.term, store.locationId, { maxAgeMs: 3_600_000 });
        counts.terms++;
        counts.products += r.upcs.length;
        await prisma.watchTerm.update({ where: { term: t.term }, data: { lastSyncedAt: new Date() } });
      } catch (e) {
        counts.failures++;
        log(`"${t.term}": ${e.message}`);
        if (e.code === 'KROGER_LIMIT') break;
      }
      await new Promise((r) => setTimeout(r, 150)); // gentle pacing
    }

    counts.couponSearches = await targetedSearches(store.locationId, log);
    const link = await relinkAll(log);
    Object.assign(counts, { linkedCoupons: link.matched, links: link.links });

    const status = counts.failures > counts.terms / 2 ? 'partial' : 'ok';
    await prisma.syncRun.update({ where: { id: run.id }, data: { status, finishedAt: new Date(), counts } });
    log(`Done: ${JSON.stringify(counts)}`);
  } catch (e) {
    log(`Failed: ${e.message}`);
    await prisma.syncRun.update({ where: { id: run.id }, data: { status: 'failed', finishedAt: new Date(), counts, error: String(e.message).slice(0, 2000) } });
  }
}

// After a coupon run: search for new coupons' products and relink, without the full price pass.
export async function afterCouponRun() {
  const store = await currentStore();
  if (!store || !krogerConfigured()) return relinkAll();
  try {
    await targetedSearches(store.locationId, (m) => console.log(`[coupon-link] ${m}`));
  } catch (e) {
    console.log(`[coupon-link] targeted searches stopped: ${e.message}`);
  }
  return relinkAll((m) => console.log(`[coupon-link] ${m}`));
}

// Data freshness for every screen.
export async function freshness() {
  const [lastPrices, lastCoupons, lastCouponAttempt, lastPriceAttempt] = await Promise.all([
    prisma.syncRun.findFirst({ where: { kind: 'prices', status: { in: ['ok', 'partial'] } }, orderBy: { startedAt: 'desc' } }),
    prisma.syncRun.findFirst({ where: { kind: 'coupons', status: { in: ['ok', 'partial'] } }, orderBy: { startedAt: 'desc' } }),
    prisma.syncRun.findFirst({ where: { kind: 'coupons' }, orderBy: { startedAt: 'desc' } }),
    prisma.syncRun.findFirst({ where: { kind: 'prices' }, orderBy: { startedAt: 'desc' } }),
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
  if (!lastPrices) alerts.push({ kind: 'prices', message: 'Prices have not synced yet.' });
  return {
    pricesAt: lastPrices?.finishedAt ?? null,
    couponsAt: lastCoupons?.finishedAt ?? null,
    couponsSignedIn: lastCoupons?.signedIn ?? null,
    priceSyncRunning: priceSyncRunning(),
    alerts,
  };
}
