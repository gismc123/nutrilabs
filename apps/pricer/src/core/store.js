import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';

// Tiny JSON-file persistence. The data is small (a few hundred quotes), and a
// plain file keeps the pricer dependency-free and easy to inspect.
function file(name) {
  mkdirSync(config.dataDir, { recursive: true });
  return join(config.dataDir, `${name}.json`);
}

export function load(name, fallback) {
  try {
    return JSON.parse(readFileSync(file(name), 'utf8'));
  } catch {
    return fallback;
  }
}

export function save(name, value) {
  const path = file(name);
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2));
  renameSync(`${path}.tmp`, path);
}

// ── Quote cache: key = retailer|store|query ───────────────────────────────────

export function quoteKey(retailer, storeId, query) {
  return `${retailer}|${storeId ?? ''}|${query.toLowerCase()}`;
}

export function getCachedQuote(key) {
  return load('quotes', {})[key] ?? null;
}

export function putCachedQuote(key, quote) {
  const all = load('quotes', {});
  all[key] = quote;
  save('quotes', all);
}

// ── Retailer state: pauses after blocks, last runs, event log ─────────────────

export function getState() {
  return load('state', { retailers: {}, jobs: {}, log: [] });
}

export function updateState(fn) {
  const state = getState();
  fn(state);
  state.log = state.log.slice(-200);
  save('state', state);
  return state;
}

export function logEvent(event) {
  updateState((s) => s.log.push({ at: new Date().toISOString(), ...event }));
}
