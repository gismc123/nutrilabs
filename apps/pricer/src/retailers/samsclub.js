import { BlockedError, detectBlock, fetchPage } from '../headlessx.js';

// Sam's Club search pages embed their results in __NEXT_DATA__. Even when a
// bot challenge overlays the page, the server-rendered results are usually
// present; when they aren't, the page is treated as a block.
const money = (s) => {
  const m = String(s ?? '').match(/\$([\d,]+\.\d{2})/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
};

export function parseSamsSearch(html) {
  const next = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!next) return [];
  let data;
  try {
    data = JSON.parse(next[1]);
  } catch {
    return [];
  }
  const stacks = data?.props?.pageProps?.initialData?.searchResult?.itemStacks ?? [];
  return stacks.flatMap((s) => s.items ?? []).filter((i) => i.name && i.priceInfo).map((i) => {
    const price = money(i.priceInfo.linePrice) ?? money(i.priceInfo.itemPrice);
    const was = money(i.priceInfo.wasPrice);
    return {
      name: i.name,
      size: null,
      price,
      regularPrice: was ?? price,
      onSale: was != null && price != null && price < was,
      unitPriceText: i.priceInfo.unitPrice || null,
      url: i.canonicalUrl ? `https://www.samsclub.com${i.canonicalUrl.split('?')[0]}` : null,
    };
  });
}

export const samsclub = {
  id: 'samsclub',
  label: "Sam's Club",
  needsStore: false,

  async search(term) {
    const { html } = await fetchPage('samsclub', `https://www.samsclub.com/s/${encodeURIComponent(term)}`);
    const products = parseSamsSearch(html);
    if (!products.some((p) => p.price != null)) {
      const reason = detectBlock(html);
      if (reason) throw new BlockedError('samsclub', reason);
    }
    return { products, store: null };
  },
};
