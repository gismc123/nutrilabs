import prisma from '../lib/prisma.js';
import { searchFoods, getFood } from './usda.js';
import {
  matchKey, curatedFdcId, rankFoods, gramsFor, macrosForGrams,
  MIN_MATCH_SCORE, MATCHER_VERSION,
} from '../lib/macroCalc.js';

function rowToFood(row) {
  const hasMacros = row.calories != null;
  return {
    key: row.key,
    fdcId: row.fdcId,
    description: row.description,
    dataType: row.dataType,
    per100g: hasMacros ? { calories: row.calories, proteinG: row.proteinG, carbsG: row.carbsG, fatG: row.fatG } : null,
    portions: Array.isArray(row.portions) ? row.portions : [],
    unitGrams: row.unitGrams && typeof row.unitGrams === 'object' ? row.unitGrams : {},
    skip: row.skip,
    isUserChoice: row.isUserChoice,
  };
}

// Shared automatic matches live under userId 0; corrections under the user's id,
// so one user's choices never change another user's numbers.
const SHARED = 0;
const id = (key, userId) => ({ key_userId: { key, userId } });

async function saveMatch(key, food, { isUserChoice = false, skip = false, userId = SHARED } = {}) {
  const data = {
    fdcId: food?.fdcId ?? null,
    description: food?.description ?? null,
    dataType: food?.dataType ?? null,
    calories: food?.per100g?.calories ?? null,
    proteinG: food?.per100g?.proteinG ?? null,
    carbsG: food?.per100g?.carbsG ?? null,
    fatG: food?.per100g?.fatG ?? null,
    portions: food?.portions ?? [],
    skip,
    isUserChoice,
    matcherVersion: MATCHER_VERSION,
  };
  // unitGrams (the user's "1 bunch = 30 g") survives re-matching.
  const row = await prisma.foodMatch.upsert({ where: id(key, userId), create: { key, userId, ...data }, update: data });
  return rowToFood(row);
}

/**
 * Foods borrow household portions from the curated food for their head noun, after
 * their own: "red onion" (a Foundation food with no portions) uses "onion"'s
 * medium/cup weights; "baby carrot" gains carrot's cup weight.
 */
async function withPortions(key, food, apiKey) {
  const head = key.split(' ').pop();
  const donorId = head !== key ? curatedFdcId(head) : null;
  if (!donorId || donorId === food.fdcId) return food;
  const donor = await resolveFood(head, apiKey);
  if (donor.error || !donor.portions.length) return food;
  return { ...food, portions: [...food.portions, ...donor.portions.map((p) => ({ ...p, from: donor.description }))] };
}

/** The food for an ingredient key: the user's choice, the cached shared match, or a fresh match. */
export async function resolveFood(key, apiKey, userId = null) {
  if (userId) {
    const own = await prisma.foodMatch.findUnique({ where: id(key, userId) });
    if (own) return rowToFood(own);
  }
  const row = await prisma.foodMatch.findUnique({ where: id(key, SHARED) });
  if (row && row.matcherVersion === MATCHER_VERSION) return rowToFood(row);

  let fdcId = curatedFdcId(key);
  if (!fdcId) {
    const found = await searchFoods(key, apiKey);
    if (found.error) return found;
    const best = rankFoods(key, found)[0];
    fdcId = best && best.score >= MIN_MATCH_SCORE ? best.fdcId : null;
  }
  if (!fdcId) return saveMatch(key, null);

  const food = await getFood(fdcId, apiKey);
  if (food.error) return food;
  return saveMatch(key, await withPortions(key, food, apiKey));
}

/** Run fn over items with at most `limit` in flight (USDA allows ~1 req/s on a key). */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Per-ingredient breakdown and per-serving macros for a recipe's ingredients.
 * Ingredient quantities are for the whole recipe.
 */
export async function calculateRecipe({ ingredients, servings }, apiKey, userId = null) {
  const lines = ingredients.map((ing) => ({ ...ing, key: matchKey(ing.name) }));
  const keys = [...new Set(lines.filter((l) => !l.isOptional && l.quantity != null).map((l) => l.key))];
  const resolved = await mapLimit(keys, 4, (key) => resolveFood(key, apiKey, userId));
  const foods = new Map(keys.map((k, i) => [k, resolved[i]]));

  const total = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  const rows = lines.map((line) => {
    const base = { name: line.name, quantity: line.quantity, unit: line.unit, key: line.key };
    if (line.isOptional) return { ...base, status: 'optional' };
    if (line.quantity == null) return { ...base, status: 'no-quantity' };

    const food = foods.get(line.key);
    if (food.error) return { ...base, status: 'error', message: food.message };
    const foodInfo = { fdcId: food.fdcId, description: food.description, dataType: food.dataType, isUserChoice: food.isUserChoice };
    if (food.skip) return { ...base, status: 'skipped', food: foodInfo };
    if (!food.fdcId || !food.per100g) return { ...base, status: 'no-match', food: food.fdcId ? foodInfo : null };

    const g = gramsFor(line, food, line.key);
    if (g.grams == null) return { ...base, status: 'no-grams', food: foodInfo, countUnit: g.countUnit };

    const m = macrosForGrams(food.per100g, g.grams);
    for (const k of Object.keys(total)) total[k] += m[k];
    return {
      ...base,
      status: 'ok',
      food: foodInfo,
      grams: r1(g.grams),
      how: g.how,
      estimated: g.estimated,
      macros: { calories: Math.round(m.calories), proteinG: r1(m.proteinG), carbsG: r1(m.carbsG), fatG: r1(m.fatG) },
    };
  });

  const perServing = {
    calories: Math.round(total.calories / servings),
    proteinG: Math.round(total.proteinG / servings),
    carbsG: Math.round(total.carbsG / servings),
    fatG: Math.round(total.fatG / servings),
  };
  const counted = rows.filter((r) => r.status === 'ok').length;
  const unresolved = rows.filter((r) => ['no-match', 'no-grams', 'error'].includes(r.status)).length;

  return {
    servings,
    perServing,
    total: { calories: Math.round(total.calories), proteinG: r1(total.proteinG), carbsG: r1(total.carbsG), fatG: r1(total.fatG) },
    counted,
    unresolved,
    rows,
  };
}

/** Ranked USDA candidates for the match picker. `query` overrides the search text. */
export async function findCandidates(name, query, apiKey, userId) {
  const key = matchKey(name);
  const text = query?.trim() || key;
  const found = await searchFoods(text, apiKey);
  if (found.error) return found;
  const ranked = rankFoods(text, found);
  // Fall back to USDA's order for words the ranking can't place (e.g. a brand-new query).
  const list = ranked.length ? ranked : found.map((f) => ({ ...f, score: null }));
  const current = (await prisma.foodMatch.findUnique({ where: id(key, userId) }))
    ?? (await prisma.foodMatch.findUnique({ where: id(key, SHARED) }));
  return {
    key,
    current: current ? rowToFood(current) : null,
    candidates: list.slice(0, 12).map(({ fdcId, description, dataType, per100g, score }) => ({ fdcId, description, dataType, per100g, score })),
  };
}

/** Pin an ingredient to a USDA food (or mark it as not counted when fdcId is null). */
export async function chooseMatch(name, fdcId, apiKey, userId) {
  const key = matchKey(name);
  if (fdcId == null) return saveMatch(key, null, { isUserChoice: true, skip: true, userId });
  const food = await getFood(fdcId, apiKey);
  if (food.error) return food;
  return saveMatch(key, await withPortions(key, food, apiKey), { isUserChoice: true, userId });
}

/** Remember "1 <unit> of <ingredient> = N g" for counts USDA has no portion for. */
export async function setUnitGrams(name, unit, grams, userId) {
  const key = matchKey(name);
  let row = await prisma.foodMatch.findUnique({ where: id(key, userId) });
  if (!row) {
    // First personal change for this ingredient: start from the shared match.
    const shared = await prisma.foodMatch.findUnique({ where: id(key, SHARED) });
    if (!shared) return { error: true, code: 'NOT_FOUND', message: 'Calculate the recipe first so the ingredient has a match' };
    const { key: _k, userId: _u, updatedAt: _t, ...copy } = shared;
    row = await prisma.foodMatch.create({ data: { ...copy, key, userId, isUserChoice: true } });
  }
  const unitGrams = { ...(row.unitGrams ?? {}), [unit || 'each']: grams };
  return rowToFood(await prisma.foodMatch.update({ where: id(key, userId), data: { unitGrams } }));
}

/** Forget a saved choice so the ingredient is matched automatically again. */
export async function resetMatch(name, userId) {
  await prisma.foodMatch.deleteMany({ where: { key: matchKey(name), userId } });
}
