import { detectBlock, fetchPage, BlockedError } from '../headlessx.js';

// Retailers that blocked HeadlessX from this server on 2026-09-30. They stay
// registered so `pricer probe <id>` can re-test them later (e.g. after a
// HeadlessX update) — they are never used for quotes.
const DISABLED = {
  walmart: {
    label: 'Walmart',
    reason: 'PerimeterX: "Robot or human?" page, and prices withheld from flagged sessions',
    probeUrl: 'https://www.walmart.com/search?q=milk',
  },
  target: {
    label: 'Target',
    reason: 'PerimeterX: search results never load ("We couldn\'t find a match")',
    probeUrl: 'https://www.target.com/s?searchTerm=milk',
  },
  dollargeneral: {
    label: 'Dollar General',
    reason: 'Cloudflare challenge HeadlessX could not pass',
    probeUrl: 'https://www.dollargeneral.com/product-search?q=milk',
  },
};

export const disabledRetailers = Object.fromEntries(Object.entries(DISABLED).map(([id, d]) => [id, {
  id,
  label: d.label,
  disabled: true,
  reason: d.reason,
  async probe() {
    try {
      const { html } = await fetchPage(id, d.probeUrl);
      const blocked = detectBlock(html);
      const prices = (html.match(/\$\d+\.\d{2}/g) ?? []).length;
      return { ok: !blocked && prices > 0, blocked, pricesOnPage: prices, bytes: html.length };
    } catch (err) {
      return { ok: false, blocked: err instanceof BlockedError ? err.reason : null, error: err.message };
    }
  },
}]));
