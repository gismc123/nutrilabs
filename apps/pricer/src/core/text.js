export function singular(word) {
  if (word.length <= 3 || /(ss|us|is)$/.test(word)) return word;
  if (/ies$/.test(word)) return word.slice(0, -3) + 'y';
  if (/oes$/.test(word)) return word.slice(0, -2);
  if (/(ch|sh|x|z)es$/.test(word)) return word.slice(0, -2);
  if (/s$/.test(word)) return word.slice(0, -1);
  return word;
}

export function words(text) {
  return String(text)
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9%&' ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular);
}

// Cooking-state words describe the recipe, not the product on the shelf.
const COOKING_STATE = new Set(['cooked', 'uncooked', 'leftover', 'day', 'old', 'day-old', 'raw', 'fresh', 'chopped', 'minced', 'sliced', 'diced']);

/** What to type into a store's search box for a grocery-list item. */
export function searchTerm(itemName) {
  const kept = String(itemName)
    .replace(/\(.*?\)/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !COOKING_STATE.has(w.toLowerCase()));
  // "diced tomatoes" is a canned product; keep it when nothing else is left.
  return (kept.length ? kept : String(itemName).split(/\s+/)).join(' ').trim();
}

export function decodeHtml(text) {
  return String(text)
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}
