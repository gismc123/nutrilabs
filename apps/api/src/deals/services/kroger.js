// Official Kroger developer API (free tier, client credentials). Every call is
// counted per UTC day so syncs stop well before the daily limit.
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError } from '../lib/http.js';

const API = 'https://api.kroger.com/v1';
let token = { value: null, expiresAt: 0 };

const today = () => new Date().toISOString().slice(0, 10);

async function count(field) {
  const day = today();
  await prisma.dealApiUsage.upsert({ where: { day }, create: { day, [field]: 1 }, update: { [field]: { increment: 1 } } });
}

export async function usageToday() {
  const row = await prisma.dealApiUsage.findUnique({ where: { day: today() } });
  return { day: today(), products: row?.products ?? 0, locations: row?.locations ?? 0, budget: config.kroger.dailyProductBudget };
}

export async function productBudgetLeft() {
  const u = await usageToday();
  return Math.max(0, u.budget - u.products);
}

export const krogerConfigured = () => !!(config.kroger.clientId && config.kroger.clientSecret);

async function accessToken() {
  if (token.value && Date.now() < token.expiresAt) return token.value;
  if (!krogerConfigured()) throw new HttpError(503, 'Kroger API credentials are not set (KROGER_CLIENT_ID and KROGER_CLIENT_SECRET).', 'NOT_CONFIGURED');
  const res = await fetch(`${API}/connect/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.kroger.clientId}:${config.kroger.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=product.compact',
    signal: AbortSignal.timeout(15_000),
  });
  await count('tokens');
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) throw new HttpError(502, `Kroger sign-in for the API failed (HTTP ${res.status})`, 'KROGER_AUTH');
  token = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in || 1800) - 60) * 1000 };
  return token.value;
}

async function get(path, params, field) {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}`, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
    await count(field);
    if (res.status === 401 && attempt === 0) { token = { value: null, expiresAt: 0 }; continue; }
    // Kroger's API returns the odd 502/503; one slow retry clears most of them.
    if (res.status >= 500 && attempt === 0) { await new Promise((r) => setTimeout(r, 3000)); continue; }
    if (res.status === 429) throw new HttpError(429, 'Kroger API daily limit reached. Prices refresh tomorrow.', 'KROGER_LIMIT');
    if (!res.ok) throw new HttpError(502, `Kroger API ${path} returned HTTP ${res.status}`, 'KROGER_HTTP');
    return res.json();
  }
  throw new HttpError(502, 'Kroger API rejected the token', 'KROGER_AUTH');
}

export async function findStores(zip, radiusMiles = 25) {
  const data = await get('/locations', {
    'filter.zipCode.near': zip,
    'filter.radiusInMiles': Math.min(Math.max(radiusMiles, 1), 100),
    'filter.limit': 50,
  }, 'locations');
  return (data.data ?? [])
    .filter((l) => !/fuel|pharmacy|clinic/i.test(l.name || ''))
    .map((l) => ({
      locationId: l.locationId,
      name: l.name,
      chain: l.chain,
      address: [l.address?.addressLine1, l.address?.city, l.address?.state].filter(Boolean).join(', '),
      zip: l.address?.zipCode ?? null,
      lat: l.geolocation?.latitude ?? null,
      lng: l.geolocation?.longitude ?? null,
    }));
}

function bestImage(p) {
  const front = (p.images || []).find((i) => i.perspective === 'front') || p.images?.[0];
  const sizes = front?.sizes || [];
  return (sizes.find((s) => s.size === 'medium') || sizes.find((s) => s.size === 'small') || sizes[0])?.url || null;
}

// Normalize one Products API record into product + price fields.
export function normalizeProduct(p) {
  const item = p.items?.[0] ?? {};
  const regular = Number(item.price?.regular) || null;
  let promo = Number(item.price?.promo) || null;
  if (promo && regular && promo >= regular) promo = null;
  const ends = item.price?.expirationDate?.value;
  const promoEnds = promo && ends && !ends.startsWith('9999') ? new Date(ends) : null;
  return {
    product: {
      upc: p.upc,
      productId: p.productId ?? null,
      name: p.description || p.upc,
      brand: p.brand || null,
      size: item.size || null,
      soldBy: item.soldBy || null,
      category: p.categories?.[0] || null,
      categories: p.categories || [],
      imageUrl: bestImage(p),
      aisle: p.aisleLocations?.[0]?.description || null,
    },
    price: { regular, promo, promoEnds },
    stock: item.inventory?.stockLevel || null,
    raw: { items: p.items, categories: p.categories, brand: p.brand, upc: p.upc },
  };
}

export async function searchProducts(term, locationId, limit = 50) {
  const data = await get('/products', {
    // The API takes at most 8 words in a term.
    'filter.term': term.split(/\s+/).slice(0, 8).join(' ').slice(0, 80),
    'filter.locationId': locationId,
    'filter.limit': Math.min(Math.max(limit, 1), 50),
  }, 'products');
  return (data.data ?? []).filter((p) => p.upc).map(normalizeProduct);
}
