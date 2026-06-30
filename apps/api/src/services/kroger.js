import fetch from 'node-fetch';

const KROGER_API = 'https://api.kroger.com/v1';

// In-memory token cache
let tokenCache = { token: null, expiresAt: 0 };

// In-memory location cache keyed by zip
const locationCache = new Map();

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

export async function findNearestLocation(zip, accessToken) {
  if (locationCache.has(zip)) return locationCache.get(zip);

  const res = await fetch(
    `${KROGER_API}/locations?filter.zipCode.near=${encodeURIComponent(zip)}&filter.limit=1`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
  );
  const data = await res.json();
  const locationId = data.data?.[0]?.locationId ?? null;
  if (locationId) locationCache.set(zip, locationId);
  return locationId;
}

export async function searchProducts(query, zip, accessToken) {
  const locationId = await findNearestLocation(zip, accessToken);
  if (!locationId) return [];

  const url = new URL(`${KROGER_API}/products`);
  url.searchParams.set('filter.term', query);
  url.searchParams.set('filter.locationId', locationId);
  url.searchParams.set('filter.limit', '5');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const data = await res.json();

  return (data.data ?? []).map((p) => {
    const item = p.items?.[0];
    return {
      productId: p.productId,
      description: p.description,
      price: item?.price?.regular ?? null,
      salePrice: item?.price?.promo ?? null,
      size: item?.size ?? null,
      upc: p.upc ?? null,
    };
  });
}

// Simple word-overlap score for name matching
function matchScore(query, description) {
  const q = query.toLowerCase().split(/\s+/);
  const d = description.toLowerCase();
  return q.filter((w) => d.includes(w)).length / q.length;
}

export async function getPricesForItems(items, krogerZip) {
  const krogerClientId = process.env.KROGER_CLIENT_ID;
  const krogerClientSecret = process.env.KROGER_CLIENT_SECRET;

  if (!krogerClientId || !krogerClientSecret) {
    return { items, krogerPricesAvailable: false };
  }

  try {
    const accessToken = await getAccessToken(krogerClientId, krogerClientSecret);
    const zip = krogerZip || '10001';

    const updatedItems = await Promise.all(
      items.map(async (item) => {
        try {
          const products = await searchProducts(item.name, zip, accessToken);
          if (!products.length) return item;
          const best = products.reduce((a, b) =>
            matchScore(item.name, b.description) > matchScore(item.name, a.description) ? b : a
          );
          const krogerPriceCents = best.price != null ? Math.round(best.price * 100) : null;
          return { ...item, estimatedPriceKroger: krogerPriceCents };
        } catch {
          return item;
        }
      })
    );

    return { items: updatedItems, krogerPricesAvailable: true };
  } catch {
    return { items, krogerPricesAvailable: false };
  }
}
