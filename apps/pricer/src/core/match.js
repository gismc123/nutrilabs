import { words } from './text.js';

// Descriptors that mean "a different product" unless the item asks for them:
// "chicken breast" should not match lunchmeat or breaded strips.
const OFF_TARGET = [
  'lunchmeat', 'deli', 'breaded', 'nugget', 'strip', 'seasoned', 'flavored', 'marinated',
  'instant', 'microwave', 'snack', 'kit', 'mix', 'sauce', 'dressing', 'soup', 'chip',
  'cracker', 'bar', 'candy', 'pouch', 'frozen', 'refried', 'baby food', 'cereal', 'cheerio', 'pop',
];

/**
 * Score a product name against the item searched for. The item's last word is
 * its head noun ("berries" in "frozen mixed berries"), so a product without it
 * is almost certainly the wrong thing.
 */
export function matchScore(query, productName) {
  const q = words(query);
  const p = new Set(words(productName));
  const pText = words(productName).join(' ');
  if (!q.length) return -1;
  const overlap = q.filter((w) => p.has(w)).length / q.length;
  const headMissing = p.has(q[q.length - 1]) ? 0 : 0.6;
  const qText = q.join(' ');
  const penalty = OFF_TARGET.filter((t) => pText.includes(t) && !qText.includes(t)).length * 0.25;
  return overlap - headMissing - penalty;
}

export const MIN_SCORE = 0.5;

/** Best product for the item, or null when nothing is a credible match. */
export function pickBest(query, products) {
  let best = null;
  let bestScore = -Infinity;
  for (const p of products) {
    if (p.price == null) continue;
    const score = matchScore(query, p.name);
    // Strictly greater: the retailer's own relevance order breaks ties.
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best && bestScore >= MIN_SCORE ? { ...best, matchScore: Math.round(bestScore * 100) / 100 } : null;
}
