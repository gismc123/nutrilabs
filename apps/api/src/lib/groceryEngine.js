import { createHash } from 'node:crypto';

// Bump when the consolidation/categorization output changes so saved lists regenerate.
export const ENGINE_VERSION = 4;

// ── Words ─────────────────────────────────────────────────────────────────────

const SINGULAR_IRREGULAR = {
  leaves: 'leaf', loaves: 'loaf', halves: 'half', knives: 'knife',
  cookies: 'cookie', brownies: 'brownie', smoothies: 'smoothie', veggies: 'veggie',
  chilies: 'chili', chillies: 'chili', pies: 'pie', ties: 'tie',
};
const SINGULAR_INVARIANT = new Set([
  'hummus', 'couscous', 'asparagus', 'molasses', 'swiss', 'grits', 'citrus',
  'bass', 'watercress', 'series', 'species', 'brussels',
]);

export function singularize(word) {
  if (word.length <= 3) return word;
  if (SINGULAR_IRREGULAR[word]) return SINGULAR_IRREGULAR[word];
  if (SINGULAR_INVARIANT.has(word)) return word;
  if (/(ss|us|is)$/.test(word)) return word;
  if (/ies$/.test(word)) return word.slice(0, -3) + 'y';
  if (/oes$/.test(word)) return word.slice(0, -2);
  if (/(ch|sh|x|z)es$/.test(word)) return word.slice(0, -2);
  if (/s$/.test(word)) return word.slice(0, -1);
  return word;
}

function tokens(text) {
  return text.split(' ').filter(Boolean);
}

function cleanText(name) {
  return String(name)
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')   // parentheticals: "rice (day-old)"
    .split(',')[0]              // trailing prep: "onion, chopped"
    .replace(/[-–/]/g, ' ')
    .replace(/[^a-z0-9ñé&' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Words that describe preparation, not what you buy. Product-form words
// (frozen, canned, dried, ground, crushed) are deliberately kept.
const PREP_WORDS = new Set([
  'diced', 'chopped', 'minced', 'sliced', 'shredded', 'grated', 'cubed', 'peeled',
  'halved', 'quartered', 'julienned', 'cooked', 'uncooked', 'raw', 'fresh', 'freshly',
  'boneless', 'skinless', 'finely', 'roughly', 'thinly', 'coarsely', 'packed',
  'softened', 'melted', 'beaten', 'rinsed', 'drained', 'divided', 'trimmed',
  'large', 'medium', 'small', 'ripe', 'optional',
]);

const NAME_ALIASES = {
  pepper: 'black pepper',
  'ground pepper': 'black pepper',
  'ground black pepper': 'black pepper',
  'extra virgin olive oil': 'olive oil',
  evoo: 'olive oil',
  scallion: 'green onion',
  'spring onion': 'green onion',
  'garbanzo bean': 'chickpea',
};

/** Canonical grouping key for an ingredient name: lowercase, prep words removed, singular. */
export function normalizeIngredientName(name) {
  const words = tokens(cleanText(name))
    .filter((w) => !PREP_WORDS.has(w))
    .map(singularize);
  const key = words.join(' ');
  return NAME_ALIASES[key] ?? key;
}

// ── Units ─────────────────────────────────────────────────────────────────────

// Volume in teaspoons, weight in grams.
const UNIT_TABLE = [
  { unit: 'tsp', dim: 'volume', factor: 1, aliases: ['tsp', 'tsps', 'teaspoon', 'teaspoons'] },
  { unit: 'tbsp', dim: 'volume', factor: 3, aliases: ['tbsp', 'tbsps', 'tbs', 'tbl', 'tablespoon', 'tablespoons'] },
  { unit: 'fl oz', dim: 'volume', factor: 6, aliases: ['fl oz', 'fl. oz', 'fluid ounce', 'fluid ounces'] },
  { unit: 'cup', dim: 'volume', factor: 48, aliases: ['cup', 'cups', 'c'] },
  { unit: 'pint', dim: 'volume', factor: 96, aliases: ['pint', 'pints', 'pt'] },
  { unit: 'quart', dim: 'volume', factor: 192, aliases: ['quart', 'quarts', 'qt'] },
  { unit: 'gallon', dim: 'volume', factor: 768, aliases: ['gallon', 'gallons', 'gal'] },
  { unit: 'ml', dim: 'volume', factor: 0.202884, metric: true, aliases: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'] },
  { unit: 'l', dim: 'volume', factor: 202.884, metric: true, aliases: ['l', 'liter', 'liters', 'litre', 'litres'] },
  { unit: 'oz', dim: 'weight', factor: 28.3495, aliases: ['oz', 'ounce', 'ounces'] },
  { unit: 'lb', dim: 'weight', factor: 453.592, aliases: ['lb', 'lbs', 'pound', 'pounds'] },
  { unit: 'g', dim: 'weight', factor: 1, metric: true, aliases: ['g', 'gram', 'grams'] },
  { unit: 'kg', dim: 'weight', factor: 1000, metric: true, aliases: ['kg', 'kilogram', 'kilograms'] },
];
const UNIT_LOOKUP = new Map(UNIT_TABLE.flatMap((u) => u.aliases.map((a) => [a, u])));

// Descriptors that ride along on unit strings: "cup dry", "heaping tbsp".
const UNIT_NOISE = new Set(['dry', 'heaping', 'level', 'packed', 'scant', 'large', 'medium', 'small', 'whole']);

/** Parse a unit string into { dim, unit, factor, metric }. Count-type units keep a singular label. */
export function parseUnit(raw) {
  if (raw == null) return { dim: 'count', unit: null, factor: 1 };
  const cleaned = String(raw).toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return { dim: 'count', unit: null, factor: 1 };
  const direct = UNIT_LOOKUP.get(cleaned);
  if (direct) return direct;
  const words = tokens(cleaned).filter((w) => !UNIT_NOISE.has(w));
  const joined = words.join(' ');
  const known = UNIT_LOOKUP.get(joined) ?? UNIT_LOOKUP.get(words[0]);
  if (known) return known;
  if (!words.length) return { dim: 'count', unit: null, factor: 1 };
  return { dim: 'count', unit: words.map(singularize).join(' '), factor: 1 };
}

/** The volume/weight unit a single unit string names ("Tablespoons" → tbsp), or null. */
export function lookupUnit(raw) {
  return UNIT_LOOKUP.get(String(raw).toLowerCase().replace(/\./g, '').trim()) ?? null;
}

const NO_PLURAL = new Set(['tsp', 'tbsp', 'fl oz', 'oz', 'lb', 'g', 'kg', 'ml', 'l']);

function displayUnit(unit, qty) {
  if (!unit || NO_PLURAL.has(unit) || qty == null || qty <= 1) return unit;
  if (unit === 'leaf') return 'leaves';
  if (/(ch|sh|x|s)$/.test(unit)) return unit + 'es';
  return unit + 's';
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function formatVolume(tsp, metricOnly) {
  if (metricOnly) return tsp >= 202.884 ? [tsp / 202.884, 'l'] : [tsp / 0.202884, 'ml'];
  if (tsp >= 12) return [tsp / 48, 'cup'];
  if (tsp >= 3) return [tsp / 3, 'tbsp'];
  return [tsp, 'tsp'];
}

function formatWeight(g, metricOnly) {
  if (metricOnly) return g >= 1000 ? [g / 1000, 'kg'] : [g, 'g'];
  const oz = g / 28.3495;
  return oz >= 16 ? [oz / 16, 'lb'] : [oz, 'oz'];
}

// ── Consolidation ─────────────────────────────────────────────────────────────

/**
 * Sum ingredients that share a canonical name and a compatible unit.
 * Volume units convert to each other, weight units convert to each other; count
 * units ("can", "clove", none) only merge with the same count unit.
 */
export function consolidateIngredients(ingredientList) {
  const groups = new Map();

  for (const ing of ingredientList) {
    const normalizedName = ing.normalizedName ?? normalizeIngredientName(ing.name);
    const parsed = parseUnit(ing.unit);
    const key = `${normalizedName}|${parsed.dim === 'count' ? `count:${parsed.unit ?? ''}` : parsed.dim}`;
    const qty = ing.quantity != null && !Number.isNaN(Number(ing.quantity)) ? Number(ing.quantity) : null;

    let g = groups.get(key);
    if (!g) {
      g = { normalizedName, dim: parsed.dim, unit: parsed.unit, base: null, metricOnly: true, names: {} };
      groups.set(key, g);
    }
    if (qty != null) g.base = (g.base ?? 0) + qty * parsed.factor;
    if (parsed.dim !== 'count' && !parsed.metric) g.metricOnly = false;
    const display = String(ing.name).replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim() || ing.name;
    g.names[display] = (g.names[display] ?? 0) + 1;
  }

  return Array.from(groups.values()).map((g) => {
    let quantity = g.base;
    let unit = g.unit;
    if (g.base != null && g.dim === 'volume') [quantity, unit] = formatVolume(g.base, g.metricOnly);
    if (g.base != null && g.dim === 'weight') [quantity, unit] = formatWeight(g.base, g.metricOnly);
    if (g.base == null && g.dim !== 'count') unit = null;
    quantity = quantity != null ? round(quantity) : null;
    const name = Object.entries(g.names).sort((a, b) => b[1] - a[1])[0][0];
    return { name, normalizedName: g.normalizedName, quantity, unit: displayUnit(unit, quantity) };
  });
}

// ── Categorization ────────────────────────────────────────────────────────────

// Keywords are singular and matched as whole words; the longest match wins, so
// "peanut butter" beats "butter" and "corn tortilla" lands in GRAINS via "tortilla".
const CATEGORY_KEYWORDS = {
  PRODUCE: [
    'apple', 'banana', 'berry', 'grape', 'orange', 'lemon', 'lime', 'peach', 'pear',
    'plum', 'mango', 'pineapple', 'melon', 'watermelon', 'strawberry', 'blueberry',
    'raspberry', 'blackberry', 'cherry', 'kiwi', 'tomato', 'potato', 'onion', 'garlic',
    'carrot', 'celery', 'lettuce', 'romaine', 'spinach', 'kale', 'arugula', 'cabbage',
    'broccoli', 'broccoli floret', 'cauliflower', 'bell pepper', 'pepper', 'cucumber',
    'zucchini', 'squash', 'asparagus', 'avocado', 'mushroom', 'corn', 'green bean',
    'cilantro', 'parsley', 'basil', 'mint', 'dill', 'ginger', 'jalapeño', 'jalapeno',
    'green onion', 'leek', 'shallot', 'radish', 'beet', 'artichoke', 'eggplant',
    'sweet potato', 'yam', 'pea', 'snap pea', 'sugar snap pea', 'brussels sprout', 'chile',
    // British names (TheMealDB imports)
    'courgette', 'aubergine', 'swede', 'beetroot',
  ],
  PROTEIN: [
    'chicken', 'chicken breast', 'chicken thigh', 'beef', 'ground beef', 'pork', 'turkey',
    'ground turkey', 'deli turkey', 'lamb', 'fish', 'salmon', 'tuna', 'shrimp', 'egg',
    'bean', 'black bean', 'white bean', 'kidney bean', 'pinto bean', 'lentil', 'chickpea',
    'tofu', 'tempeh', 'sausage', 'bacon', 'ham', 'tilapia', 'cod', 'halibut', 'steak',
    'prawn', 'chorizo', 'pancetta', 'mince',
  ],
  DAIRY: [
    'milk', 'buttermilk', 'cheese', 'cream cheese', 'cottage cheese', 'yogurt',
    'greek yogurt', 'butter', 'cream', 'heavy cream', 'sour cream', 'mozzarella',
    'cheddar', 'parmesan', 'feta', 'ricotta', 'half and half', 'creme fraiche', 'mascarpone',
  ],
  GRAINS: [
    'bread', 'rice', 'brown rice', 'pasta', 'oat', 'oatmeal', 'granola', 'tortilla',
    'quinoa', 'flour', 'breadcrumb', 'noodle', 'egg noodle', 'spaghetti', 'penne',
    'linguine', 'fettuccine', 'macaroni', 'couscous', 'barley', 'cracker', 'cereal',
    'cornmeal', 'panko', 'bagel', 'english muffin', 'pita', 'bun', 'lasagne', 'lasagna',
    'lasagne sheet', 'tagliatelle', 'rigatoni', 'fusilli',
  ],
  CANNED: [
    'broth', 'chicken broth', 'vegetable broth', 'beef broth', 'stock', 'sauce', 'salsa',
    'marinara', 'marinara sauce', 'pasta sauce', 'tomato paste', 'tomato sauce',
    'diced tomato', 'crushed tomato', 'canned tomato', 'coconut milk', 'soy sauce',
    'vinegar', 'oil', 'olive oil', 'sesame oil', 'ketchup', 'mustard', 'mayonnaise',
    'mayo', 'pickle', 'olive', 'caper', 'anchovy', 'sriracha', 'hot sauce',
    'worcestershire', 'fish sauce', 'oyster sauce', 'hoisin', 'teriyaki', 'green chile',
    'canned', 'tuna in water', 'tomato puree', 'passata',
  ],
  FROZEN: ['frozen', 'ice cream', 'edamame'],
  MISC: [
    'peanut butter', 'almond butter', 'honey', 'maple syrup', 'syrup', 'sugar',
    'brown sugar', 'salt', 'black pepper', 'pepper flake', 'red pepper flake', 'spice',
    'seasoning', 'powder', 'cumin', 'paprika', 'turmeric', 'cinnamon', 'oregano',
    'chia seed', 'seed', 'nut', 'almond', 'walnut', 'hummus', 'extract', 'baking soda',
    'baking powder', 'cooking spray', 'lemon juice', 'lime juice',
  ],
};

const KEYWORD_INDEX = Object.entries(CATEGORY_KEYWORDS)
  .flatMap(([category, kws]) => kws.map((kw) => ({ category, words: tokens(kw).map(singularize) })))
  .sort((a, b) => b.words.length - a.words.length || b.words.join(' ').length - a.words.join(' ').length);

function containsPhrase(words, phrase) {
  for (let i = 0; i + phrase.length <= words.length; i++) {
    if (phrase.every((p, j) => words[i + j] === p)) return true;
  }
  return false;
}

/** Categorize from the original (un-stripped) name so "frozen"/"diced" still count. */
export function categorizeIngredient(name) {
  const words = tokens(cleanText(name)).map(singularize);
  if (words.includes('frozen')) return 'FROZEN';
  const hit = KEYWORD_INDEX.find((k) => containsPhrase(words, k.words));
  return hit?.category ?? 'MISC';
}

// ── Pantry staples ────────────────────────────────────────────────────────────

/**
 * A staple matches when its words end the ingredient's canonical name:
 * "salt" matches "kosher salt" but not "salted butter"; "garlic powder" does not
 * match "garlic"; "flour" does not match "flour tortilla".
 */
export function findMatchingStaple(ingredientName, pantryStaples) {
  const nameWords = tokens(normalizeIngredientName(ingredientName));
  for (const staple of pantryStaples) {
    const sWords = tokens(normalizeIngredientName(staple));
    if (!sWords.length || sWords.length > nameWords.length) continue;
    const tail = nameWords.slice(nameWords.length - sWords.length);
    if (sWords.every((w, i) => tail[i] === w)) return staple;
  }
  return null;
}

// ── Plan → list ───────────────────────────────────────────────────────────────

export function buildGroceryList(mealPlan, pantryStaples) {
  const rawIngredients = [];
  for (const pm of mealPlan.plannedMeals) {
    if (!pm.recipe?.ingredients) continue;
    for (const ing of pm.recipe.ingredients) {
      rawIngredients.push({
        name: ing.name,
        normalizedName: normalizeIngredientName(ing.name) || ing.name.toLowerCase(),
        quantity: ing.quantity != null ? parseFloat(ing.quantity) : null,
        unit: ing.unit ?? null,
      });
    }
  }

  const items = [];
  const excludedStaples = [];

  for (const ing of consolidateIngredients(rawIngredients)) {
    const staple = findMatchingStaple(ing.normalizedName, pantryStaples);
    const item = { ...ing, category: categorizeIngredient(ing.name) };
    if (staple) {
      excludedStaples.push({ ...item, isPantryStaple: true, staple });
    } else {
      items.push({ ...item, isPantryStaple: false });
    }
  }

  return { items, excludedStaples };
}

/** Planned meals whose recipe has no ingredients (they contribute nothing to the list). */
export function mealsWithoutIngredients(mealPlan) {
  return mealPlan.plannedMeals
    .filter((pm) => pm.recipe && !(pm.recipe.ingredients?.length))
    .map((pm) => ({ dayOfWeek: pm.dayOfWeek, mealType: pm.mealType, recipeId: pm.recipe.id, recipeName: pm.recipe.name }));
}

/**
 * Fingerprint of everything the list is derived from. A saved list whose hash
 * differs from the current plan's is stale and gets regenerated.
 */
export function planFingerprint(mealPlan, pantryStaples) {
  const meals = mealPlan.plannedMeals
    .filter((pm) => pm.recipe)
    .map((pm) => [
      pm.dayOfWeek, pm.mealType, pm.recipe.id,
      (pm.recipe.ingredients ?? [])
        .map((i) => `${i.name}:${i.quantity ?? ''}:${i.unit ?? ''}`)
        .sort()
        .join(';'),
    ].join('|'))
    .sort();
  const staples = [...pantryStaples].map((s) => s.toLowerCase()).sort();
  return createHash('sha1')
    .update(JSON.stringify({ v: ENGINE_VERSION, meals, staples }))
    .digest('hex');
}
