#!/usr/bin/env node
// KrogerDeals coupon worker.
//   login     open a visible window so the owner can sign in (once, or when the session expires)
//   discover  dump the page's own coupon API traffic to /samples for schema tuning
//   sync      read every active coupon and post it to the Deals server (read-only)
//
// Exit codes: 0 ok, 2 Kroger session missing or expired, 3 failure, 4 Deals server unreachable.
import fs from 'node:fs/promises';
import path from 'node:path';
import { openSession, runLogin, SessionError, DOMAIN, COUPONS_URL } from './browser.js';
import { listAll, batchOf, categoryOptions, inPageGet, BASE, PROJECTION } from './atlas.js';

const EXIT = { OK: 0, SESSION: 2, FAIL: 3, SERVER: 4 };
const SAMPLES_DIR = process.env.SAMPLES_DIR || '/samples';
const STATE_DIR = process.env.STATE_DIR || '/state';
const INGEST_URL = process.env.DEALS_INGEST_URL || 'http://deals:3102';
const TOKEN = process.env.DEALS_WORKER_TOKEN || '';
// Public coupons load without signing in. When allowed, an expired session still
// refreshes the public list instead of failing the night's run.
const ALLOW_SIGNED_OUT = /^(1|true|yes)$/i.test(process.env.DEALS_ALLOW_SIGNED_OUT || 'true');

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

async function post(pathname, body) {
  const res = await fetch(`${INGEST_URL}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-worker-token': TOKEN },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Deals server ${pathname} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function cmdLogin() {
  const ok = await runLogin(log);
  return ok ? EXIT.OK : EXIT.FAIL;
}

async function cmdDiscover() {
  await fs.mkdir(SAMPLES_DIR, { recursive: true });
  const { context, page, atlas, state } = await openSession();
  try {
    log(`Coupons page state: ${state}`);
    const sample = { at: new Date().toISOString(), domain: DOMAIN, url: COUPONS_URL, state, headerNames: Object.keys(atlas.headers || {}) };
    let probe = null;
    if (atlas.headers) {
      probe = await inPageGet(page, atlas.headers, `${BASE}/coupons?${PROJECTION}&filter.status=unclipped&filter.status=active&page.size=24&page.offset=0`);
    }
    sample.pageRequests = atlas.requests.slice(0, 40);
    const stamp = sample.at.replace(/[:.]/g, '-');
    await fs.writeFile(path.join(SAMPLES_DIR, `discover-${stamp}.json`), JSON.stringify({
      ...sample,
      probe: probe?.ok ? probe.json : probe,
      pageResponses: atlas.responses.map((r) => ({ url: r.url, status: r.status, body: safeJson(r.body) })),
    }, null, 2));
    log(`Wrote ${SAMPLES_DIR}/discover-${stamp}.json (${probe?.ok ? batchOf(probe.json).length : 0} coupons in probe)`);
    return EXIT.OK;
  } finally {
    await context.close().catch(() => {});
  }
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return String(text).slice(0, 2000); }
}

async function cmdSync() {
  const startedAt = new Date().toISOString();
  const report = { startedAt, domain: DOMAIN, signedIn: false, status: 'failed', error: null, pages: 0, coupons: [], categories: [] };
  let session;
  try {
    session = await openSession();
    const { page, atlas, state } = session;
    report.signedIn = state === 'signed_in';
    log(`Coupons page state: ${state}`);
    if (state !== 'signed_in' && !(ALLOW_SIGNED_OUT && state === 'signed_out')) {
      throw new SessionError(state === 'signed_out'
        ? 'The Kroger session has expired. Run the login step on the server.'
        : 'The coupons page did not load (Kroger may be blocking or changed the page).');
    }
    if (!atlas.headers) throw new Error('Could not capture the coupon app request headers. The page may have changed.');

    // The site lists available coupons with unclipped+active. Signed in, clipped
    // ones come from active alone; merge both by id so nothing is missed.
    const filters = ['filter.status=unclipped&filter.status=active'];
    if (report.signedIn) filters.push('filter.status=active');
    const byId = new Map();
    let all = null;
    for (const f of filters) {
      log(`Reading ${f}`);
      const r = await listAll(page, atlas.headers, f, log);
      report.pages += r.pages;
      for (const c of r.coupons) byId.set(String(c.id), c);
      if (!all) all = r;
      else if (r.error) all.error = all.error || r.error;
    }
    all.coupons = [...byId.values()];
    report.categories = categoryOptions({ meta: all.meta }).map((o) => o.displayName || o.name || o.id || o.value).filter(Boolean);
    if (all.error && all.coupons.length === 0) throw new Error(`Coupon API failed: ${all.error}`);
    report.coupons = all.coupons;
    report.meta = all.meta ? { coupons: { ...all.meta.coupons, filterSummaryByType: undefined } } : null;
    report.status = all.error ? 'partial' : 'ok';
    report.error = all.error;
    if (!report.signedIn) report.note = 'Signed out: public coupons only. Run login to include account-only offers.';
    log(`Read ${all.coupons.length} coupons in ${all.pages} pages${all.error ? ` (stopped early: ${all.error})` : ''}`);
  } catch (e) {
    report.status = e instanceof SessionError ? 'session_expired' : 'failed';
    report.error = String(e?.message || e);
    log(`Sync ${report.status}: ${report.error}`);
  } finally {
    await session?.context.close().catch(() => {});
  }
  report.finishedAt = new Date().toISOString();

  // Keep the last raw run next to the profile (outside the repo) so a parser fix
  // can be replayed without hitting Kroger again.
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    await fs.writeFile(path.join(STATE_DIR, 'last-sync.json'), JSON.stringify(report));
  } catch (e) { log(`Could not write local copy: ${e.message}`); }

  try {
    const res = await post('/internal/coupon-runs', report);
    log(`Deals server stored run ${res.data?.runId}: ${JSON.stringify(res.data?.counts ?? {})}`);
  } catch (e) {
    log(String(e.message || e));
    return EXIT.SERVER;
  }
  if (report.status === 'session_expired') return EXIT.SESSION;
  return report.status === 'failed' ? EXIT.FAIL : EXIT.OK;
}

const commands = { login: cmdLogin, discover: cmdDiscover, sync: cmdSync };
const cmd = process.argv[2];
if (!commands[cmd]) {
  console.error('Usage: cli.js login | discover | sync');
  process.exit(1);
}
commands[cmd]().then((code) => process.exit(code), (e) => { log(e?.stack || e); process.exit(EXIT.FAIL); });
