import { createServer } from 'node:http';
import { RETAILER_POLICY, UPDATE_NOTE, config } from './config.js';
import { headlessxHealth } from './headlessx.js';
import { quoteItems, retailerPause } from './core/quote.js';
import { findStores, resolveStore } from './core/stores.js';
import { getState } from './core/store.js';
import { ACTIVE_IDS, DISABLED, RETAILERS } from './retailers/index.js';
import { scheduleStatus, startScheduler } from './scheduler.js';

function send(res, status, data, error = null) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data, error }));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request body too large');
  }
  return body ? JSON.parse(body) : {};
}

function retailerSummary() {
  const state = getState();
  return {
    active: ACTIVE_IDS.map((id) => ({
      id,
      label: RETAILERS[id].label,
      method: RETAILER_POLICY[id].method,
      cacheDays: RETAILER_POLICY[id].cacheDays,
      pausedUntil: retailerPause(id),
      lastBlockReason: state.retailers[id]?.lastBlockReason ?? null,
    })),
    disabled: Object.values(DISABLED).map((d) => ({ id: d.id, label: d.label, reason: d.reason })),
  };
}

const routes = {
  'GET /health': async () => [200, { ok: true, headlessx: await headlessxHealth(), retailers: retailerSummary() }],

  'GET /status': async () => [200, { retailers: retailerSummary(), schedule: scheduleStatus(), log: getState().log.slice(-50) }],

  // Store picker for NutriLabs' Connections tab.
  'GET /stores': async (url) => {
    const retailer = url.searchParams.get('retailer');
    const zip = url.searchParams.get('zip') ?? '';
    if (!/^\d{5}$/.test(zip)) return [400, null, 'zip must be 5 digits'];
    if (!RETAILERS[retailer]?.stores) return [400, null, `No store lookup for "${retailer}"`];
    return [200, { retailer, zip, stores: await findStores(retailer, zip, url.searchParams.get('radius')) }];
  },

  // Price items: API retailers are queried live; scraped retailers return
  // cached prices only (they are fetched by the weekly schedule).
  'POST /quotes': async (url, req) => {
    const body = await readJson(req);
    const items = (body.items ?? []).filter((i) => i?.name).slice(0, 200);
    if (!items.length) return [400, null, 'items[] with a name is required'];
    const retailers = (body.retailers ?? ACTIVE_IDS).filter((r) => RETAILERS[r]);
    const stores = {};
    for (const r of retailers) stores[r] = await resolveStore(r, body.stores?.[r]).catch(() => null);
    const live = Object.fromEntries(retailers.map((r) => [r, RETAILER_POLICY[r].method === 'api']));
    const quotes = await quoteItems({ items, retailers, stores, live, force: !!body.refresh });
    const info = retailers.map((r) => ({
      id: r,
      label: RETAILERS[r].label,
      method: RETAILER_POLICY[r].method,
      store: stores[r]?.name ?? quotes[r].find((q) => q.store)?.store ?? null,
      note: UPDATE_NOTE[r],
      pausedUntil: retailerPause(r),
    }));
    return [200, { retailers: info, quotes }];
  },
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://pricer');
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) return send(res, 404, null, 'Not found');
  if (url.pathname !== '/health' && config.token && req.headers['x-pricer-token'] !== config.token) {
    return send(res, 401, null, 'Invalid pricer token');
  }
  try {
    const [status, data, error] = await handler(url, req);
    send(res, status, data, error ?? null);
  } catch (err) {
    console.error(err);
    send(res, 500, null, err.message);
  }
});

server.listen(config.port, () => {
  console.log(`NutriLabs pricer listening on ${config.port} (scheduler ${config.schedulerEnabled ? 'on' : 'off'}, TZ ${config.timeZone})`);
  startScheduler();
});
