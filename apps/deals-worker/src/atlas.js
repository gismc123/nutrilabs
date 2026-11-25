// Read-only calls to Kroger's internal coupon API, made from inside the page so
// they carry the browser's real identity. There is deliberately no clip or
// unclip call anywhere in this project: the tool plans, it does not clip.
// Observed 2026-11-25: the coupon page calls v2 with the compact projection;
// the v1 path used by the reference tool now returns 403 Access Denied.
export const BASE = '/atlas/v1/savings-coupons/v2';
export const PROJECTION = 'projections=coupons.compact';
const PAGE_SIZE = 24; // same page size the site itself requests
const PACE_MS = 1200; // gentle: about one request a second

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function inPageGet(page, headers, url, attempts = 3) {
  let last = { status: 0, body: '' };
  for (let i = 0; i < attempts; i++) {
    try {
      last = await page.evaluate(async ({ u, h }) => {
        const r = await fetch(u, { headers: { Accept: 'application/json, text/plain, */*', ...h } });
        return { status: r.status, body: await r.text() };
      }, { u: url, h: headers });
      if (last.status === 200) return { ok: true, status: 200, json: JSON.parse(last.body) };
    } catch (e) {
      last = { status: 0, body: String(e?.message || e) };
    }
    // A 4xx is a decision by Kroger's edge, not a blip: one slow retry, then stop.
    if (last.status >= 400 && last.status < 500 && i >= 1) break;
    await sleep(last.status >= 400 && last.status < 500 ? 6000 : 2500);
  }
  return { ok: false, status: last.status, body: String(last.body).slice(0, 500) };
}

// The coupon list sits under data.<something> in observed responses; take the
// first array found so a renamed key does not break the run.
export function batchOf(json) {
  const d = json?.data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') {
    for (const v of Object.values(d)) if (Array.isArray(v)) return v;
  }
  return [];
}

export function categoryOptions(json) {
  const opts = json?.meta?.coupons?.filterSummaryByType?.categories?.options;
  return Array.isArray(opts) ? opts : [];
}

// Every active coupon, paginated. Returns { coupons, meta, pages, error }.
export async function listAll(page, headers, filter = 'filter.status=active', log = () => {}) {
  const coupons = [];
  let meta = null;
  let pages = 0;
  for (let offset = 0; offset < 20_000; offset += PAGE_SIZE) {
    const url = `${BASE}/coupons?${PROJECTION}&${filter}&page.size=${PAGE_SIZE}&page.offset=${offset}`;
    const res = await inPageGet(page, headers, url);
    pages++;
    if (!res.ok) return { coupons, meta, pages, error: `HTTP ${res.status} at offset ${offset}: ${res.body}` };
    if (!meta && res.json.meta) meta = res.json.meta;
    const batch = batchOf(res.json);
    coupons.push(...batch);
    log(`  page ${pages}: ${batch.length} coupons (total ${coupons.length})`);
    const hasMore = res.json.meta?.coupons?.page?.hasMore;
    if (hasMore === false || (hasMore == null && batch.length < PAGE_SIZE) || batch.length === 0) break;
    await sleep(PACE_MS);
  }
  return { coupons, meta, pages, error: null };
}
