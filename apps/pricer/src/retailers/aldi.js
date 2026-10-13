import { BlockedError, detectBlock, fetchPage } from '../headlessx.js';
import { decodeHtml } from '../core/text.js';

// ALDI US online shopping runs on Instacart's storefront. The store is picked
// from the requesting IP (for this server: ALDI - MTJ 43, Bowling Green).
const money = (s) => (s ? Number(s.replace(/[$,]/g, '')) : null);

export function parseAldiSearch(html) {
  const storeMatch = html.match(/Shopping at ([^<"]{3,80})/);
  const cards = html.split('data-item-card="true"').slice(1);
  const products = cards.map((card) => {
    const name = card.match(/<h3[^>]*>([^<]+)<\/h3>/)?.[1];
    if (!name) return null;
    const current = card.match(/Current price: \$([\d,.]+)/)?.[1];
    const original = card.match(/Original Price: \$([\d,.]+)/)?.[1];
    const afterName = card.slice(card.indexOf('</h3>'));
    const size = afterName.match(/<div[^>]*>\s*([\d./ ]+\s*(?:fl oz|oz|lb|lbs|ct|count|gal|each|pk|qt|l|ml|g|kg)[^<]{0,20})<\/div>/i)?.[1] ?? null;
    const href = card.match(/href="(\/store\/aldi\/products\/[^"]+)"/)?.[1];
    const price = money(current ?? original);
    const regular = money(original ?? current);
    return {
      name: decodeHtml(name).trim(),
      size: size ? decodeHtml(size).trim() : null,
      price,
      regularPrice: regular,
      onSale: price != null && regular != null && price < regular,
      url: href ? `https://www.aldi.us${href}` : null,
    };
  }).filter(Boolean);
  return { products, store: storeMatch ? decodeHtml(storeMatch[1]).trim() : null };
}

export const aldi = {
  id: 'aldi',
  label: 'ALDI',
  needsStore: false,

  async search(term) {
    const url = `https://www.aldi.us/store/aldi/s?k=${encodeURIComponent(term)}`;
    const { html, timedOut } = await fetchPage('aldi', url, { waitForSelector: '[data-item-card="true"]' });
    const parsed = parseAldiSearch(html);
    if (!parsed.products.length) {
      const reason = detectBlock(html);
      if (reason) throw new BlockedError('aldi', reason);
      if (timedOut) return { products: [], store: null };
    }
    return parsed;
  },
};
