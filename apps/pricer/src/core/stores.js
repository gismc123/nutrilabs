import { RETAILERS } from '../retailers/index.js';
import { load, save } from './store.js';

const STORE_CACHE_DAYS = 30;
const zipPoints = new Map();

// Free ZIP → lat/lng lookup, used to show distances from the user's ZIP.
async function zipCentroid(zip) {
  if (zipPoints.has(zip)) return zipPoints.get(zip);
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`, { signal: AbortSignal.timeout(8000) });
    const place = res.ok ? (await res.json()).places?.[0] : null;
    const point = place ? { lat: Number(place.latitude), lng: Number(place.longitude) } : null;
    zipPoints.set(zip, point);
    return point;
  } catch {
    return null;
  }
}

function miles(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** Stores near a ZIP, nearest first, cached for 30 days (Meijer lookups use the browser). */
export async function findStores(retailer, zip, radiusMiles) {
  const adapter = RETAILERS[retailer];
  if (!adapter?.stores) throw new Error(`${retailer} has no store lookup`);
  const radius = Math.min(Math.max(parseInt(radiusMiles) || 25, 1), 100);
  const key = `${retailer}|${zip}|${radius}`;
  const cache = load('stores', {});
  const hit = cache[key];
  if (hit && Date.now() - new Date(hit.at) < STORE_CACHE_DAYS * 86_400_000) return hit.stores;

  const origin = await zipCentroid(zip);
  const stores = (await adapter.stores(zip, radius)).map((s) => ({
    ...s,
    distanceMiles: origin && s.lat != null ? Math.round(miles(origin, { lat: s.lat, lng: s.lng }) * 10) / 10 : null,
  }));
  if (stores.every((s) => s.distanceMiles != null)) stores.sort((a, b) => a.distanceMiles - b.distanceMiles);

  cache[key] = { at: new Date().toISOString(), stores };
  save('stores', cache);
  return stores;
}

/**
 * Turn a profile's store preference into { id, name }: an explicitly chosen
 * store, otherwise (Kroger only) the nearest store within the radius.
 */
export async function resolveStore(retailer, pref) {
  if (!pref) return null;
  if (pref.id) return { id: pref.id, name: pref.name ?? null };
  if (retailer === 'kroger' && pref.zip) {
    const [nearest] = await findStores('kroger', pref.zip, pref.radius ?? 25);
    return nearest ? { id: nearest.id, name: nearest.name } : null;
  }
  return null;
}
