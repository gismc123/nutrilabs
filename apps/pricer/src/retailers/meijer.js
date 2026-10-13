import { fetchJsonViaBrowser } from '../headlessx.js';

// Meijer's site search is served by Constructor.io, which returns JSON with
// per-store pricing when filtered by store. Store lookups go through Meijer's
// own store API, which is behind bot protection, so they use HeadlessX (and are
// cached by the caller — they're only needed when picking a store).
const SEARCH_URL = 'https://ac.cnstrc.com/search';
// Public key embedded in meijer.com's pages; override if Meijer rotates it.
const SEARCH_KEY = process.env.MEIJER_SEARCH_KEY ?? 'key_GdYuTcnduTUtsZd6';

// Sizes are embedded in names: "Meijer Black Beans, 15.25 oz", "Bush's Black Beans 15 oz".
function sizeFromName(name) {
  const tail = name.split(',').slice(1).join(',').trim();
  if (/\d/.test(tail)) return tail;
  return name.match(/(\d[\d./ ]*\s*(?:fl oz|oz|lbs?|ct|count|gal(?:lon)?|pk|qt|ml|l|g|kg)\.?)\s*$/i)?.[1] ?? null;
}

export function parseMeijerSearch(json) {
  return (json.response?.results ?? []).map((r) => {
    const d = r.data ?? {};
    const regular = typeof d.price === 'number' ? d.price : null;
    const sale = typeof d.discountSalePriceValue === 'number' ? d.discountSalePriceValue : null;
    const onSale = !!(d.sale && sale != null && regular != null && sale < regular);
    return {
      name: r.value,
      size: sizeFromName(r.value ?? ''),
      price: onSale ? sale : regular,
      regularPrice: regular,
      onSale,
      saleEnds: onSale && d.priceGoodThrough && !d.priceGoodThrough.startsWith('2099') ? d.priceGoodThrough : null,
      priceByWeight: !!d.priceByWeight,
      url: d.url ? `https://www.meijer.com${d.url}` : null,
    };
  });
}

export function parseMeijerStores(json) {
  return (json.pointsOfService ?? []).map((s) => ({
    id: s.name ?? s.mfcStoreId,
    name: `Meijer - ${s.displayName}`,
    address: [s.address?.line1, s.address?.town, s.address?.region?.isocode?.replace('US-', '')].filter(Boolean).join(', '),
    lat: s.geoPoint?.latitude ?? null,
    lng: s.geoPoint?.longitude ?? null,
  }));
}

export const meijer = {
  id: 'meijer',
  label: 'Meijer',
  needsStore: true,

  async stores(zip, radiusMiles = 25) {
    const radius = Math.min(Math.max(radiusMiles, 1), 100);
    const json = await fetchJsonViaBrowser('meijer', `https://www.meijer.com/bin/meijer/store/search?locationQuery=${encodeURIComponent(zip)}&radius=${radius}`);
    return parseMeijerStores(json);
  },

  async search(term, storeId) {
    const url = new URL(`${SEARCH_URL}/${encodeURIComponent(term)}`);
    url.searchParams.set('key', SEARCH_KEY);
    url.searchParams.set('i', 'nutrilabs-pricer');
    url.searchParams.set('s', '1');
    url.searchParams.set('us', 'web');
    url.searchParams.set('num_results_per_page', '12');
    url.searchParams.set('filters[availableInStores]', storeId);
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Meijer search HTTP ${res.status}`);
    return { products: parseMeijerSearch(await res.json()), store: null };
  },
};
