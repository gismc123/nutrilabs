import fetch from 'node-fetch';

const KROGER_API = 'https://api.kroger.com/v1';

// In-memory token cache
let tokenCache = { token: null, expiresAt: 0 };

// In-memory caches: store lists keyed by zip+radius, ZIP centroids, credential check
const storeListCache = new Map();
const zipCache = new Map();
let credentialCheck = { ok: null, checkedAt: 0 };

export async function getAccessToken(clientId, clientSecret) {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${KROGER_API}/connect/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=product.compact',
  });

  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to obtain Kroger access token');

  // Cache with a 30-second buffer before actual expiry
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 30) * 1000,
  };
  return data.access_token;
}

export const DEFAULT_RADIUS_MILES = 25;
const STORE_LIST_TTL_MS = 6 * 60 * 60 * 1000;

/** Are the configured credentials able to get a token? Cached so /health stays cheap. */
export async function checkCredentials() {
  const clientId = process.env.KROGER_CLIENT_ID;
  const clientSecret = process.env.KROGER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return false;
  if (credentialCheck.ok !== null && Date.now() - credentialCheck.checkedAt < 10 * 60 * 1000) return credentialCheck.ok;
  try {
    credentialCheck = { ok: !!(await getAccessToken(clientId, clientSecret)), checkedAt: Date.now() };
  } catch {
    credentialCheck = { ok: false, checkedAt: Date.now() };
  }
  return credentialCheck.ok;
}

// Free ZIP → lat/lng lookup, used only to show distances to stores.
async function zipCentroid(zip) {
  if (zipCache.has(zip)) return zipCache.get(zip);
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`);
    const place = res.ok ? (await res.json()).places?.[0] : null;
    const point = place ? { lat: Number(place.latitude), lng: Number(place.longitude) } : null;
    zipCache.set(zip, point);
    return point;
  } catch {
    return null;
  }
}

function milesBetween(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

// The locations API also returns fuel centers, pharmacy clinics and pickup
// points; keep only locations that look like grocery stores.
function isGroceryStore(loc) {
  if (/fuel center|pharmacy|clinic/i.test(loc.name ?? '')) return false;
  return (loc.departments ?? []).length >= 5;
}

/** Kroger-family grocery stores within `radiusMiles` of `zip`, nearest first. */
export async function listStores(zip, radiusMiles, accessToken) {
  const radius = Math.min(Math.max(parseInt(radiusMiles) || DEFAULT_RADIUS_MILES, 1), 100);
  const key = `${zip}|${radius}`;
  const cached = storeListCache.get(key);
  if (cached && Date.now() - cached.at < STORE_LIST_TTL_MS) return cached.stores;

  const url = new URL(`${KROGER_API}/locations`);
  url.searchParams.set('filter.zipCode.near', zip);
  url.searchParams.set('filter.radiusInMiles', String(radius));
  url.searchParams.set('filter.limit', '200');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Kroger locations HTTP ${res.status}`);
  const data = await res.json();
  const origin = await zipCentroid(zip);

  const stores = (data.data ?? []).filter(isGroceryStore).map((loc) => {
    const point = loc.geolocation ? { lat: loc.geolocation.latitude, lng: loc.geolocation.longitude } : null;
    return {
      locationId: loc.locationId,
      name: loc.name,
      chain: loc.chain,
      address: [loc.address?.addressLine1, loc.address?.city, loc.address?.state].filter(Boolean).join(', '),
      city: loc.address?.city ?? null,
      zipCode: loc.address?.zipCode ?? null,
      distanceMiles: origin && point ? Math.round(milesBetween(origin, point) * 10) / 10 : null,
    };
  });
  if (stores.every((st) => st.distanceMiles != null)) stores.sort((a, b) => a.distanceMiles - b.distanceMiles);

  storeListCache.set(key, { at: Date.now(), stores });
  return stores;
}

/**
 * The store prices come from: the one picked in Settings, otherwise the nearest
 * Kroger-family grocery store within the configured radius.
 */
export async function resolveStore({ krogerZip, krogerRadiusMiles, krogerLocationId, krogerStoreName }, accessToken) {
  if (krogerLocationId) {
    return { locationId: krogerLocationId, name: krogerStoreName ?? `Kroger store ${krogerLocationId}`, selected: true };
  }
  const zip = krogerZip?.trim();
  if (!zip) return null;
  const [nearest] = await listStores(zip, krogerRadiusMiles ?? DEFAULT_RADIUS_MILES, accessToken);
  return nearest ? { ...nearest, selected: false } : null;
}

export async function searchProducts(query, locationId, accessToken) {
  const url = new URL(`${KROGER_API}/products`);
  url.searchParams.set('filter.term', query);
  url.searchParams.set('filter.locationId', locationId);
  url.searchParams.set('filter.limit', '10');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Kroger product search HTTP ${res.status}`);
  const data = await res.json();

  return (data.data ?? []).map((p) => {
    const item = p.items?.[0];
    const regular = item?.price?.regular || null;
    const promo = item?.price?.promo || null;
    return {
      productId: p.productId,
      description: p.description,
      price: promo && regular && promo < regular ? promo : regular,
      regularPrice: regular,
      onSale: !!(promo && regular && promo < regular),
      size: item?.size ?? null,
      upc: p.upc ?? null,
    };
  }).filter((p) => p.price != null);
}

// Product descriptors that signal a different product than the plain ingredient
// ("chicken breast" should not match lunchmeat or a frozen 8 lb bag).
const OFF_TARGET = ['lunchmeat', 'deli', 'sliced', 'seasoned', 'flavored', 'frozen', 'instant', 'microwave', '90 second', 'snack', 'kit', 'mix', 'sauce', 'dressing'];

function matchScore(query, description) {
  const q = query.toLowerCase().split(/\s+/).filter(Boolean);
  const d = description.toLowerCase();
  const overlap = q.filter((w) => d.includes(w.replace(/s$/, ''))).length / q.length;
  const penalty = OFF_TARGET.filter((t) => d.includes(t) && !query.toLowerCase().includes(t)).length * 0.25;
  return overlap - penalty;
}

export function pickBestProduct(query, products) {
  if (!products.length) return null;
  // Highest score wins; Kroger's own relevance order breaks ties.
  return products.reduce((best, p) => (matchScore(query, p.description) > matchScore(query, best.description) ? p : best));
}

async function mapWithLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

export async function getPricesForItems(items, settings) {
  const krogerClientId = process.env.KROGER_CLIENT_ID;
  const krogerClientSecret = process.env.KROGER_CLIENT_SECRET;
  const fail = (message) => ({ items, krogerPricesAvailable: false, pricedCount: 0, store: null, message });

  if (!krogerClientId || !krogerClientSecret) return fail('Kroger credentials are not set');
  if (!settings?.krogerLocationId && !settings?.krogerZip?.trim()) {
    return fail('Choose a Kroger store (or set your ZIP code) in Settings → Connections');
  }

  try {
    const accessToken = await getAccessToken(krogerClientId, krogerClientSecret);
    const store = await resolveStore(settings, accessToken);
    if (!store) {
      return fail(`No Kroger-family store within ${settings.krogerRadiusMiles ?? DEFAULT_RADIUS_MILES} miles of ${settings.krogerZip} — increase the search distance in Settings → Connections`);
    }

    const updatedItems = await mapWithLimit(items, 5, async (item) => {
      try {
        const best = pickBestProduct(item.name, await searchProducts(item.name, store.locationId, accessToken));
        if (!best) return item;
        return { ...item, estimatedPriceKroger: Math.round(best.price * 100), krogerProduct: best };
      } catch {
        return item;
      }
    });

    const pricedCount = updatedItems.filter((i) => i.krogerProduct).length;
    return { items: updatedItems, krogerPricesAvailable: pricedCount > 0, pricedCount, store, message: null };
  } catch (err) {
    return fail(err.message);
  }
}
