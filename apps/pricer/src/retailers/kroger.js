import { config } from '../config.js';

// Kroger's official, free developer API (client-credentials OAuth).
const API = 'https://api.kroger.com/v1';
let token = { value: null, expiresAt: 0 };

async function accessToken() {
  if (token.value && Date.now() < token.expiresAt) return token.value;
  const { clientId, clientSecret } = config.kroger;
  if (!clientId || !clientSecret) throw new Error('KROGER_CLIENT_ID / KROGER_CLIENT_SECRET are not set');
  const res = await fetch(`${API}/connect/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=product.compact',
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Kroger token request failed (HTTP ${res.status})`);
  token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return token.value;
}

async function get(path, params) {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}`, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Kroger ${path} HTTP ${res.status}`);
  return res.json();
}

export const kroger = {
  id: 'kroger',
  label: 'Kroger',
  needsStore: true,

  async stores(zip, radiusMiles = 25) {
    const data = await get('/locations', {
      'filter.zipCode.near': zip,
      'filter.radiusInMiles': Math.min(Math.max(radiusMiles, 1), 100),
      'filter.limit': 200,
    });
    return (data.data ?? [])
      .filter((l) => !/fuel center|pharmacy|clinic/i.test(l.name) && (l.departments ?? []).length >= 5)
      .map((l) => ({
        id: l.locationId,
        name: l.name,
        address: [l.address?.addressLine1, l.address?.city, l.address?.state].filter(Boolean).join(', '),
        lat: l.geolocation?.latitude ?? null,
        lng: l.geolocation?.longitude ?? null,
      }));
  },

  async search(term, storeId) {
    const data = await get('/products', { 'filter.term': term, 'filter.locationId': storeId, 'filter.limit': 10 });
    const products = (data.data ?? []).map((p) => {
      const item = p.items?.[0] ?? {};
      const regular = item.price?.regular || null;
      const promo = item.price?.promo || null;
      const onSale = !!(promo && regular && promo < regular);
      return {
        name: p.description,
        size: item.size ?? null,
        price: onSale ? promo : regular,
        regularPrice: regular,
        onSale,
        url: p.productId ? `https://www.kroger.com/p/item/${p.productId}` : null,
      };
    });
    return { products, store: null };
  },
};
