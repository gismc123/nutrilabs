import { normalizeIngredientName, parseUnit, lookupUnit, singularize } from './groceryEngine.js';

// Bump when ranking changes so cached automatic matches get re-picked.
export const MATCHER_VERSION = 2;

// ── Nutrients ─────────────────────────────────────────────────────────────────

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Per-100 g macros from a USDA nutrient list (search or detail format). Matches by
 * nutrient number, not name: Foundation foods report energy as "Energy (Atwater …)"
 * and every food lists kcal and kJ under the same "Energy" name.
 */
export function macrosFromNutrients(nutrients = []) {
  const byNumber = new Map();
  for (const n of nutrients) {
    const number = String(n.nutrient?.number ?? n.nutrientNumber ?? '');
    const value = n.amount ?? n.value;
    if (number && value != null && !byNumber.has(number)) byNumber.set(number, Number(value));
  }
  const pick = (...numbers) => numbers.map((k) => byNumber.get(k)).find((v) => v != null) ?? null;

  let calories = pick('208', '957', '958');
  const kj = byNumber.get('268');
  if (calories == null && kj != null) calories = kj / 4.184;
  const proteinG = pick('203');
  const fatG = pick('204');
  const carbsG = pick('205', '205.2');
  if ([calories, proteinG, fatG, carbsG].every((v) => v == null)) return null;
  // USDA reports carbs "by difference", which can dip slightly below zero.
  const clean = (v) => (v == null ? 0 : round1(Math.max(0, v)));
  return { calories: clean(calories), proteinG: clean(proteinG), carbsG: clean(carbsG), fatG: clean(fatG) };
}

/** Household portions from a USDA food detail: [{ amount, label, gramWeight }]. */
export function portionsFromDetail(detail) {
  return (detail?.foodPortions ?? [])
    .map((p) => {
      const unitName = p.measureUnit?.name;
      const label = [unitName && unitName !== 'undetermined' && unitName !== 'RACC' ? unitName : null, p.modifier, p.portionDescription]
        .filter(Boolean).join(' ').trim();
      return { amount: Number(p.amount) || 1, label, gramWeight: Number(p.gramWeight) };
    })
    .filter((p) => p.label && p.gramWeight > 0);
}

// ── Curated staples ───────────────────────────────────────────────────────────

// Everyday ingredients pinned to a specific USDA food, because search ranking gets
// several of them badly wrong ("egg" → egg white, "olive oil" → an oil blend).
// SR Legacy ids (frozen dataset, so stable) are preferred: they carry household
// portions (cup, tbsp, clove, large…) needed to convert volumes and counts to grams.
const CURATED_FOODS = [
  [171287, 'Egg, whole, raw, fresh', ['egg', 'whole egg', 'free range egg', 'free-range egg']],
  [172183, 'Egg, white, raw, fresh', ['egg white']],
  [172184, 'Egg, yolk, raw, fresh', ['egg yolk']],
  [173410, 'Butter, salted', ['butter', 'salted butter']],
  [173430, 'Butter, without salt', ['unsalted butter']],
  [171413, 'Oil, olive, salad or cooking', ['olive oil', 'extra virgin olive oil']],
  [172336, 'Oil, canola', ['oil', 'vegetable oil', 'canola oil', 'cooking oil', 'rapeseed oil']],
  [171265, 'Milk, whole, 3.25% milkfat, with added vitamin D', ['milk', 'whole milk']],
  [171267, 'Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D', ['2% milk', 'semi skimmed milk']],
  [170859, 'Cream, fluid, heavy whipping', ['heavy cream', 'double cream', 'whipping cream', 'heavy whipping cream']],
  [170857, 'Cream, fluid, light (coffee cream or table cream)', ['single cream', 'light cream']],
  [169655, 'Sugars, granulated', ['sugar', 'white sugar', 'granulated sugar', 'caster sugar']],
  [169656, 'Sugars, powdered', ['icing sugar', 'powdered sugar', 'confectioners sugar']],
  [168894, 'Wheat flour, white, all-purpose, enriched, bleached', ['flour', 'plain flour', 'all purpose flour', 'white flour']],
  [168877, 'Rice, white, long-grain, regular, raw, enriched', ['rice', 'white rice', 'long grain rice', 'basmati rice', 'jasmine rice']],
  [168878, 'Rice, white, long-grain, regular, enriched, cooked', ['cooked rice', 'cooked white rice', 'cooked basmati rice', 'cooked jasmine rice']],
  [169704, 'Rice, brown, long-grain, cooked', ['cooked brown rice']],
  [170931, 'Spices, pepper, black', ['black pepper', 'pepper', 'ground black pepper']],
  [170932, 'Spices, pepper, red or cayenne', ['cayenne pepper', 'cayenne', 'red pepper flake', 'chilli flake', 'chili flake', 'crushed red pepper']],
  [171320, 'Spices, cinnamon, ground', ['cinnamon', 'ground cinnamon']],
  [170923, 'Spices, cumin seed', ['cumin', 'ground cumin', 'cumin seed']],
  [170922, 'Spices, coriander seed', ['ground coriander', 'coriander seed']],
  [171326, 'Spices, nutmeg, ground', ['nutmeg', 'ground nutmeg']],
  [171325, 'Spices, garlic powder', ['garlic powder']],
  [171327, 'Spices, onion powder', ['onion powder']],
  [170926, 'Spices, ginger, ground', ['ground ginger']],
  [171328, 'Spices, oregano, dried', ['oregano', 'dried oregano', 'italian seasoning']],
  [171329, 'Spices, paprika', ['paprika', 'smoked paprika']],
  [171319, 'Spices, chili powder', ['chili powder', 'chilli powder']],
  [172231, 'Spices, turmeric, ground', ['turmeric', 'ground turmeric', 'turmeric powder']],
  [170938, 'Spices, thyme, dried', ['dried thyme']],
  [170457, 'Tomatoes, red, ripe, raw, year round average', ['tomato', 'cherry tomato', 'plum tomato']],
  [170051, 'Tomatoes, red, ripe, canned, packed in tomato juice', ['canned tomato', 'tinned tomato', 'crushed tomato', 'canned diced tomato']],
  [170459, 'Tomato products, canned, paste, without salt added', ['tomato paste', 'tomato puree']],
  [172884, 'Soup, stock, chicken, home-prepared', ['chicken stock', 'chicken broth']],
  [172883, 'Soup, stock, beef, home-prepared', ['beef stock', 'beef broth']],
  [171583, 'Soup, vegetable broth, ready to serve', ['vegetable stock', 'vegetable broth']],
  [168277, 'Pork, cured, bacon, unprepared', ['bacon']],
  [174036, 'Beef, ground, 80% lean meat / 20% fat, raw', ['ground beef', 'minced beef', 'beef mince', 'mince']],
  [171052, 'Chicken, broilers or fryers, meat only, raw', ['chicken']],
  [171077, 'Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw', ['chicken breast']],
  [173627, 'Chicken, broilers or fryers, dark meat, thigh, meat only, raw', ['chicken thigh', 'bone in chicken thigh']],
  [174924, 'Bread, white, commercially prepared', ['bread', 'white bread']],
  [172688, 'Bread, whole-wheat, commercially prepared', ['whole wheat bread', 'wholemeal bread']],
  [174928, 'Bread, crumbs, dry, grated, plain', ['breadcrumb', 'bread crumb', 'panko']],
  [175036, 'Tortillas, ready-to-bake or -fry, corn', ['corn tortilla']],
  [175037, 'Tortillas, ready-to-bake or -fry, flour, refrigerated', ['flour tortilla', 'tortilla']],
  [171304, 'Yogurt, Greek, plain, whole milk', ['greek yogurt', 'plain greek yogurt']],
  [171284, 'Yogurt, plain, whole milk', ['yogurt', 'plain yogurt', 'natural yogurt']],
  [171247, 'Cheese, parmesan, grated', ['parmesan', 'parmesan cheese']],
  [173414, 'Cheese, cheddar', ['cheddar', 'cheddar cheese', 'cheese', 'shredded cheese']],
  [170845, 'Cheese, mozzarella, whole milk', ['mozzarella', 'mozzarella cheese', 'mozzarella ball']],
  [173418, 'Cheese, cream', ['cream cheese']],
  [173475, 'Spearmint, fresh', ['mint', 'fresh mint', 'mint leaf']],
  [170567, 'Nuts, almonds', ['almond']],
  [171646, 'Cereals ready-to-eat, granola, homemade', ['granola']],
  [170426, 'Peppers, hot chili, green, canned', ['green chile', 'canned green chile']],
  [170497, 'Peppers, hot chili, green, raw', ['green chilli', 'green chili']],
  [170106, 'Peppers, hot chili, red, raw', ['red chilli', 'red chili', 'chilli', 'chili']],
  [172234, 'Mustard, prepared, yellow', ['mustard', 'yellow mustard']],
  [170026, 'Potatoes, flesh and skin, raw', ['potato']],
  [169251, 'Mushrooms, white, raw', ['mushroom', 'button mushroom']],
  [169097, 'Oranges, raw, all commercial varieties', ['orange']],
  [171705, 'Avocados, raw, all commercial varieties', ['avocado']],
  [174277, 'Soy sauce made from soy and wheat (shoyu)', ['soy sauce', 'soya sauce']],
  [169736, 'Pasta, dry, enriched', ['pasta', 'spaghetti', 'penne', 'lasagne sheet', 'lasagna noodle', 'macaroni']],
  [169738, 'Pasta, whole-wheat, dry', ['whole wheat spaghetti', 'whole wheat pasta']],
  [169737, 'Pasta, cooked, enriched, without added salt', ['cooked pasta', 'cooked spaghetti', 'cooked penne', 'cooked macaroni']],
  [170173, 'Nuts, coconut milk, canned', ['coconut milk']],
  [173904, 'Cereals, oats, regular and quick, not fortified, dry', ['oat', 'rolled oat', 'porridge oat']],
  [175238, 'Beans, black, mature seeds, canned, low sodium', ['black bean']],
  [175204, 'Beans, white, mature seeds, canned', ['white bean', 'cannellini bean']],
  [173801, 'Chickpeas, mature seeds, canned, drained', ['chickpea']],
  [169214, 'Corn, sweet, yellow, canned, whole kernel, drained solids', ['corn', 'sweetcorn', 'sweet corn']],
  [170379, 'Broccoli, raw', ['broccoli', 'broccoli floret']],
  [170393, 'Carrots, raw', ['carrot']],
  [170427, 'Peppers, sweet, green, raw', ['green pepper', 'green bell pepper', 'bell pepper', 'capsicum']],
  [170108, 'Peppers, sweet, red, raw', ['red pepper', 'red bell pepper', 'red capsicum']],
  [169383, 'Peppers, sweet, yellow, raw', ['yellow pepper', 'yellow bell pepper']],
  [170005, 'Onions, spring or scallions (includes tops and bulb), raw', ['green onion', 'scallion', 'spring onion']],
  [168462, 'Spinach, raw', ['spinach', 'baby spinach']],
  [172232, 'Basil, fresh', ['basil', 'fresh basil', 'basil leaf']],
  [170016, 'Peas, green, frozen, unprepared', ['pea', 'frozen pea', 'green pea']],
  [167746, 'Lemons, raw, without peel', ['lemon']],
  [167747, 'Lemon juice, raw', ['lemon juice']],
  [168156, 'Lime juice, raw', ['lime juice']],
  [169230, 'Garlic, raw', ['garlic', 'garlic clove']],
  [170000, 'Onions, raw', ['onion', 'yellow onion', 'white onion', 'brown onion']],
  [169231, 'Ginger root, raw', ['ginger', 'fresh ginger', 'ginger root']],
  [169640, 'Honey', ['honey']],
  [173468, 'Salt, table', ['salt', 'sea salt', 'kosher salt', 'table salt']],
  [174158, 'Water, bottled, generic', ['water', 'cold water', 'hot water', 'boiling water']],
  [175167, 'Fish, salmon, Atlantic, farmed, raw', ['salmon', 'salmon fillet']],
  [175179, 'Crustaceans, shrimp, raw', ['shrimp', 'prawn', 'king prawn']],
  [171009, 'Salad dressing, mayonnaise, regular', ['mayonnaise', 'mayo']],
  [171443, 'Mayonnaise, reduced fat, with olive oil', ['light mayo', 'light mayonnaise']],
  [169698, 'Cornstarch', ['cornstarch', 'cornflour', 'corn starch']],
  [173471, 'Vanilla extract', ['vanilla extract', 'vanilla']],
  [172803, 'Leavening agents, baking powder, double-acting', ['baking powder']],
  [175040, 'Leavening agents, baking soda', ['baking soda', 'bicarbonate of soda']],
  [174266, 'Peanut butter, smooth style, with salt', ['peanut butter']],
  [170416, 'Parsley, fresh', ['parsley', 'fresh parsley']],
  [169997, 'Coriander (cilantro) leaves, raw', ['cilantro', 'coriander', 'fresh coriander', 'coriander leaf']],
];

// Keyed through matchKey() so aliases normalize exactly like recipe ingredient names.
const CURATED = new Map(CURATED_FOODS.flatMap(([fdcId, , aliases]) => aliases.map((a) => [matchKey(a), fdcId])));

/** Aliases that normalize to a key another food already claimed (kept empty by a test). */
export function curatedCollisions() {
  const owner = new Map();
  const clashes = [];
  for (const [fdcId, , aliases] of CURATED_FOODS) {
    for (const a of aliases) {
      const k = matchKey(a);
      if (owner.has(k) && owner.get(k) !== fdcId) clashes.push(a);
      else owner.set(k, fdcId);
    }
  }
  return clashes;
}

/** fdcId pinned for an ingredient key, or null. */
export function curatedFdcId(key) {
  return CURATED.get(key) ?? null;
}

export const CURATED_FDC_IDS = CURATED_FOODS.map(([fdcId, description]) => ({ fdcId, description }));

// ── Matching ──────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set(['in', 'of', 'and', 'with', 'or', 'a', 'the', 'for']);

// Words that mark a processed/prepared variant. Penalized unless the query asks for them.
const PROCESSED_WORDS = [
  'lunchmeat', 'breaded', 'babyfood', 'baby', 'restaurant', 'fast', 'imitation', 'industrial',
  'mix', 'prepared', 'fried', 'cooked', 'roasted', 'boiled', 'stewed', 'braised', 'grilled',
  'canned', 'frozen', 'dehydrated', 'dried', 'powder', 'sweetened', 'reduced', 'substitute',
  'formulated', 'roll', 'loaf', 'patty', 'nugget', 'sandwich', 'snack', 'commercial', 'school',
  'infant', 'toddler', 'beverage', 'drink', 'flavored', 'salted', 'pickled', 'smoked', 'cured',
  'microwaved', 'heated', 'glazed', 'candied', 'juice', 'concentrate', 'skin', 'bone',
];
const PROCESSED = new Set(PROCESSED_WORDS);

const MODIFIER_WORDS = new Set([
  'ground', 'fresh', 'dried', 'red', 'green', 'yellow', 'white', 'black', 'brown', 'plain',
  'whole', 'light', 'dark', 'sweet', 'hot', 'mild', 'baby', 'large', 'small', 'medium', 'organic',
]);

// First segments that name a food group rather than the food itself.
const GROUP_PREFIXES = new Set([
  'spice', 'nut', 'seed', 'oil', 'sauce', 'soup', 'fish', 'bean', 'sugar', 'cheese', 'pepper',
  'crustacean', 'mollusk', 'leavening agent', 'cereal', 'cereal ready to eat', 'beverage', 'vegetable',
]);

function words(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(Boolean).map(singularize);
}

/**
 * Score how well a USDA description matches an ingredient name. Higher is better;
 * null means no query word appears at all.
 */
export function scoreDescription(query, description, dataType) {
  const q = words(query).filter((w) => !STOP_WORDS.has(w));
  if (!q.length) return null;
  const segments = String(description).toLowerCase().split(',').map((s) => words(s));
  const desc = segments.flat();
  const descSet = new Set(desc);

  // Modifiers ("ground", "red", "fresh") count half: "ground cumin" must not match "Chicken, ground".
  const weight = (w) => (MODIFIER_WORDS.has(w) ? 0.5 : 1);
  const total = q.reduce((sum, w) => sum + weight(w), 0);
  const hit = q.filter((w) => descSet.has(w)).reduce((sum, w) => sum + weight(w), 0);
  if (!hit || q.every((w) => MODIFIER_WORDS.has(w) || !descSet.has(w))) return null;
  // The head noun must appear: "frozen mixed berries" is not "Vegetables, mixed, frozen".
  if (!descSet.has(headNoun(q))) return null;
  let score = (hit / total) * 10;

  // USDA names lead with the food ("Onions, raw"; "Chicken, breast"), or with a
  // group ("Spices, cumin seed"; "Nuts, almonds"), in which case the food comes second.
  const lead = GROUP_PREFIXES.has(segments[0]?.join(' ')) ? segments[1] ?? [] : segments[0] ?? [];
  if (lead.some((w) => q.includes(w) && !MODIFIER_WORDS.has(w))) score += 3;
  if (lead.length && lead.every((w) => q.includes(w))) score += 2;

  // Recipes give raw weights; prefer raw/plain over prepared variants.
  const qSet = new Set(q);
  for (const w of desc) if (PROCESSED.has(w) && !qSet.has(w)) score -= 1.5;
  if (descSet.has('raw') && !qSet.has('raw')) score += 1.5;
  // Every unrequested word is a small step away from the plain food.
  score -= desc.filter((w) => !qSet.has(w) && w !== 'raw').length * 0.15;
  // Brand-name entries (CHOBANI, KRAFT, McDONALD'S) are specific products, not the food.
  if (/\b[A-Z][A-Z'&]{2,}\b/.test(description)) score -= 4;
  if (dataType === 'SR Legacy') score += 1.5; // carries household portions (cup, clove…)

  return Math.round(score * 100) / 100;
}

function headNoun(queryWords) {
  return [...queryWords].reverse().find((w) => !MODIFIER_WORDS.has(w)) ?? queryWords[queryWords.length - 1];
}

// Below this, the best candidate is too doubtful to use without asking.
export const MIN_MATCH_SCORE = 10;

/** USDA search results ranked best-first for an ingredient, with scores attached. */
export function rankFoods(query, foods) {
  return foods
    .map((f) => ({ ...f, score: scoreDescription(query, f.description, f.dataType) }))
    .filter((f) => f.score != null)
    .sort((a, b) => b.score - a.score);
}

/**
 * The lookup key for an ingredient: its canonical grocery name, or the raw name.
 * Unlike the grocery list, nutrition cares whether a food is already cooked
 * (2 cups cooked rice is a third of the calories of 2 cups raw), so that word stays.
 */
export function matchKey(name) {
  const key = normalizeIngredientName(name) || String(name).toLowerCase().trim();
  const outsideParens = String(name).replace(/\(.*?\)/g, ' ');
  return /\bcooked\b/i.test(outsideParens) && !/\buncooked\b/i.test(outsideParens) ? `cooked ${key}` : key;
}

// ── Grams ─────────────────────────────────────────────────────────────────────

const TSP_PER_ML = 0.202884;
// Rough sizes for containers USDA has no portion for. Flagged as estimates in the UI.
const CONTAINER_GRAMS = { can: 425, tin: 400, jar: 680, carton: 950, bottle: 500, packet: 30, sachet: 7 };
// Volume stand-ins for tiny counts.
const TINY_TSP = { pinch: 1 / 16, dash: 1 / 8, drop: 1 / 96, splash: 1, drizzle: 3 };
// Default size when a count has none: US recipes assume large eggs, medium produce.
const DEFAULT_SIZE = { egg: 'large' };
const SIZE_WORDS = ['extra large', 'large', 'medium', 'small'];

function portionWords(p) {
  return words(p.label);
}

/** The volume unit a portion is measured in (from its label's leading words), or null. */
function portionVolume(p) {
  const w = String(p.label).toLowerCase().replace(/[^a-z ]+/g, ' ').trim().split(/\s+/);
  const u = lookupUnit(`${w[0]} ${w[1] ?? ''}`.trim()) ?? lookupUnit(w[0]);
  return u?.dim === 'volume' ? u : null;
}

function isWeightPortion(p) {
  const u = lookupUnit(String(p.label).toLowerCase().split(/[\s,(]+/)[0]);
  return u?.dim === 'weight';
}

/** Every word of the ingredient name, prep notes included: "shredded cabbage", "Onion (finely chopped)". */
function noteWords(name) {
  return words(String(name).replace(/[()]/g, ' '));
}

function pickVolumePortion(portions, unit, name) {
  const candidates = portions.map((p) => ({ p, u: portionVolume(p) })).filter((c) => c.u);
  if (!candidates.length) return null;
  const notes = noteWords(name);
  const rank = (c) =>
    (c.u.unit === unit.unit ? 2 : 0) +
    (notes.some((w) => portionWords(c.p).includes(w)) ? 3 : 0) -
    (c.p.from ? 1 : 0) -
    (/whipped|packed|sifted|melted/.test(c.p.label) && !notes.some((w) => c.p.label.includes(w)) ? 4 : 0);
  return candidates.sort((a, b) => rank(b) - rank(a))[0];
}

// Portions that are a part of the item, not the whole thing ("1 slice", "1 wedge").
const PART_WORDS = new Set([
  'slice', 'wedge', 'ring', 'strip', 'sprig', 'leaf', 'cube', 'chop', 'package', 'container',
  'serving', 'packet', 'bunch', 'stalk', 'spear', 'floret', 'pat', 'stick', 'can', 'jar', 'cup',
]);

// Count units that mean "one whole item" when USDA has no portion by that name.
const WHOLE_ITEM_UNITS = new Set(['stalk', 'piece', 'fillet', 'breast', 'thigh', 'ear', 'link', 'stem', 'whole']);

function hasSize(label, size) {
  // "large" must not match "extra large".
  return new RegExp(`(?<!extra )\\b${size}\\b`).test(label);
}

function pickCountPortion(portions, countUnit, name, key) {
  const usable = portions.filter((p) => !portionVolume(p) && !isWeightPortion(p));
  if (countUnit) {
    const own = usable.find((p) => portionWords(p).includes(countUnit));
    // "2 stalks green onion": a stalk is one whole scallion, which USDA lists by size.
    if (own || !WHOLE_ITEM_UNITS.has(countUnit)) return own ?? null;
  }
  // A bare count ("3 eggs", "1 onion") means whole items: rank whole-item portions.
  const notes = noteWords(name).join(' ');
  const size = SIZE_WORDS.find((s) => hasSize(notes, s)) ?? DEFAULT_SIZE[key];
  const keyWords = words(key);
  const whole = usable.filter((p) => {
    const w = portionWords(p);
    return !PART_WORDS.has(w[0]) || keyWords.includes(w[0]);
  });
  const score = (p) => {
    const label = p.label.toLowerCase();
    return (size && hasSize(label, size) ? 5 : 0) +
      (portionWords(p).some((w) => keyWords.includes(w)) ? 2 : 0) +
      (hasSize(label, 'medium') ? 2.5 : 0) +
      (/\b(whole|fruit|each|piece|unit)\b/.test(label) ? 1 : 0) -
      (p.from ? 1 : 0) -
      label.length * 0.01;
  };
  return whole.sort((a, b) => score(b) - score(a))[0] ?? null;
}

const fmt = (n) => String(Math.round(n * 100) / 100);
const from = (p) => (p.from ? ` (${p.from})` : '');

/**
 * Grams for one ingredient line against a matched food.
 * food: { portions: [{ amount, label, gramWeight }], unitGrams: { [countUnit|'each']: grams } }
 * Returns { grams, how, estimated } or { grams: null, reason }.
 */
export function gramsFor({ name, quantity, unit }, food, key = matchKey(name)) {
  const qty = Number(quantity);
  if (quantity == null || !Number.isFinite(qty) || qty <= 0) return { grams: null, reason: 'no-quantity' };
  const parsed = parseUnit(unit);
  const portions = food?.portions ?? [];

  if (parsed.dim === 'weight') {
    return { grams: qty * parsed.factor, how: `${fmt(qty)} ${parsed.unit}`, estimated: false };
  }

  let tsp = parsed.dim === 'volume' ? qty * parsed.factor : null;
  if (tsp == null && TINY_TSP[parsed.unit] != null) {
    const own = pickCountPortion(portions, parsed.unit, name, key);
    if (own) return { grams: qty * own.gramWeight / own.amount, how: `1 ${parsed.unit} = ${fmt(own.gramWeight / own.amount)} g${from(own)}`, estimated: false };
    tsp = qty * TINY_TSP[parsed.unit];
  }

  if (tsp != null) {
    const unitInfo = parsed.dim === 'volume' ? parsed : lookupUnit('tsp');
    const hit = pickVolumePortion(portions, unitInfo, name);
    if (hit) {
      const gPerTsp = hit.p.gramWeight / (hit.p.amount * hit.u.factor);
      return { grams: tsp * gPerTsp, how: `${fmt(hit.p.amount)} ${hit.p.label} = ${fmt(hit.p.gramWeight)} g${from(hit.p)}`, estimated: parsed.dim !== 'volume' };
    }
    // No volume portion: assume the density of water.
    return { grams: tsp / TSP_PER_ML, how: 'assumed 1 g per ml', estimated: true };
  }

  // Counts: "2 cloves", "1 can", or a bare "3" (eggs, onions).
  const countUnit = parsed.unit;
  const userGrams = food?.unitGrams?.[countUnit ?? 'each'];
  if (userGrams > 0) return { grams: qty * userGrams, how: `1 ${countUnit ?? 'each'} = ${fmt(userGrams)} g (yours)`, estimated: false };

  const portion = pickCountPortion(portions, countUnit, name, key);
  if (portion) {
    const per = portion.gramWeight / portion.amount;
    return { grams: qty * per, how: `${fmt(portion.amount)} ${portion.label} = ${fmt(portion.gramWeight)} g${from(portion)}`, estimated: false };
  }
  if (countUnit && CONTAINER_GRAMS[countUnit]) {
    return { grams: qty * CONTAINER_GRAMS[countUnit], how: `assumed 1 ${countUnit} ≈ ${CONTAINER_GRAMS[countUnit]} g`, estimated: true };
  }
  return { grams: null, reason: 'no-portion', countUnit: countUnit ?? 'each' };
}

/** Macros for a gram amount of a food with per-100 g values. */
export function macrosForGrams(per100g, grams) {
  const f = grams / 100;
  return {
    calories: per100g.calories * f,
    proteinG: per100g.proteinG * f,
    carbsG: per100g.carbsG * f,
    fatG: per100g.fatG * f,
  };
}
