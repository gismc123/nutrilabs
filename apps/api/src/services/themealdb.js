import fetch from 'node-fetch';
import { lookupUnit } from '../lib/groceryEngine.js';

// "1" is TheMealDB's free public key (fine for development and self-hosting);
// supporters get a personal key, set via THEMEALDB_API_KEY.
const baseUrl = () => `https://www.themealdb.com/api/json/v1/${process.env.THEMEALDB_API_KEY || '1'}`;

const HOUR = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const cache = new Map();

/** GET a TheMealDB endpoint, cached in memory. Returns parsed JSON or { error, code, message }. */
async function getJson(path, ttlMs) {
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now()) return hit.data;

  let res;
  try {
    res = await fetch(`${baseUrl()}/${path}`, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    return { error: true, code: 'MEALDB_UNAVAILABLE', message: `TheMealDB could not be reached (${err.name === 'TimeoutError' ? 'timed out' : err.message})` };
  }
  if (!res.ok) {
    return { error: true, code: 'MEALDB_UNAVAILABLE', message: `TheMealDB returned HTTP ${res.status}` };
  }
  let data;
  try {
    data = await res.json();
  } catch {
    // An invalid key gets an HTML page back instead of JSON.
    return { error: true, code: 'MEALDB_BAD_RESPONSE', message: 'TheMealDB returned an unexpected response — check THEMEALDB_API_KEY' };
  }

  cache.set(path, { data, expires: Date.now() + ttlMs });
  if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  return data;
}

const q = encodeURIComponent;

// ── Measure parsing ───────────────────────────────────────────────────────────

const UNICODE_FRACTIONS = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅕': '1/5', '⅖': '2/5',
  '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
};
const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join('');

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twelve: 12, half: 0.5, a: 1, an: 1,
};

// Spellings TheMealDB uses that the grocery engine's unit table doesn't know.
const EXTRA_UNIT_ALIASES = { tblsp: 'tbsp', tbls: 'tbsp', tblsps: 'tbsp', gr: 'g', gms: 'g', kgs: 'kg', mls: 'ml' };

// Count units, keyed by every spelling seen in TheMealDB → singular label.
const COUNT_UNITS = Object.fromEntries(Object.entries({
  clove: ['cloves'], can: ['cans'], tin: ['tins'], jar: ['jars'], bunch: ['bunches'],
  handful: ['handfuls', 'handfull', 'handfulls'], pinch: ['pinches'], dash: ['dashes'],
  splash: ['splashes'], sprig: ['sprigs'], slice: ['slices'], knob: ['knobs'], packet: ['packets'],
  pack: ['packs'], package: ['packages'], bag: ['bags'], stick: ['sticks'], head: ['heads'],
  bulb: ['bulbs'], stalk: ['stalks'], piece: ['pieces'], fillet: ['fillets'], rasher: ['rashers'],
  leaf: ['leaves'], pod: ['pods'], tub: ['tubs'], bottle: ['bottles'], drop: ['drops'],
  scoop: ['scoops'], shot: ['shots'], strip: ['strips'], sheet: ['sheets'], sachet: ['sachets'],
  carton: ['cartons'], block: ['blocks'], envelope: ['envelopes'],
}).flatMap(([unit, spellings]) => [unit, ...spellings].map((s) => [s, unit])));

// Words that size a quantity rather than name its unit ("1 large", "small bunch").
const SIZE_WORDS = new Set(['large', 'medium', 'small', 'whole', 'big', 'thick', 'thin', 'heaped', 'heaping', 'level', 'generous', 'good', 'fresh']);
const DIMENSION_UNITS = new Set(['cm', 'mm', 'inch', 'inches', 'in']);
const CONTAINER_UNITS = new Set(['can', 'tin', 'jar', 'pack', 'packet', 'package', 'bag', 'tub', 'carton', 'bottle', 'block']);

const OPTIONAL_RE = /\b(optional|to serve|for serving|garnish|to decorate|decoration)\b/i;

// "1 1/2" before "1/2" before "1.5": the alternation order matters.
const NUM = String.raw`\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?`;
const QTY_RE = new RegExp(String.raw`^(${NUM})(?:\s*(?:-|to)\s*(${NUM})(?![-\w/]))?`);
const PACK_RE = new RegExp(String.raw`^(?:x\s*|-\s*)?(${NUM})\s*-?\s*([a-z]+(?:\s+oz)?)\b`);
const JUICE_RE = /^(?:the\s+)?(?:grated\s+)?(zest and juice|juice and zest|juice\/zest|zest\/juice|juice|zest) of (one|two|three|half|a|an|\d+(?:\/\d+)?)\b(.*)$/;

function toNumber(text) {
  const t = String(text).trim();
  if (WORD_NUMBERS[t] != null) return WORD_NUMBERS[t];
  return t.split(/\s+/).reduce((sum, part) => {
    const [n, d] = part.split('/');
    return sum + (d ? Number(n) / Number(d) : Number(n));
  }, 0);
}

function roundQty(n) {
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : null;
}

function normalizeMeasure(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(new RegExp(`(\\d)([${FRACTION_CHARS}])`, 'g'), '$1 $2')   // "1½" → "1 ½"
    .replace(new RegExp(`[${FRACTION_CHARS}]`, 'g'), (f) => UNICODE_FRACTIONS[f])
    .replace(/[–—]/g, '-')
    .replace(/(\d)-(\d+\/\d+)/g, '$1 $2')                              // "2-1/2" is a mixed number
    .replace(/(\d+) and (\d+\/\d+)/g, '$1 $2')                         // "1 and 1/8"
    .replace(/\s+/g, ' ')
    .trim();
}

/** Unit at the start of a word list: { unit, measured, used } or null. */
function readUnit(words) {
  const two = words.length > 1 ? lookupUnit(`${words[0]} ${words[1]}`) : null;
  if (two) return { unit: two.unit, measured: true, used: 2 };
  const word = words[0]?.replace(/[.,;:]+$/, '');
  if (!word) return null;
  const measured = lookupUnit(EXTRA_UNIT_ALIASES[word] ?? word);
  if (measured) return { unit: measured.unit, measured: true, used: 1 };
  if (COUNT_UNITS[word]) return { unit: COUNT_UNITS[word], measured: false, used: 1 };
  return null;
}

function cleanNote(words) {
  return words.join(' ')
    .replace(/[()]/g, ' ')
    .replace(/\boptional\b/g, ' ')
    .replace(/^[\s,;:\-]+|[\s,;:\-]+$/g, '')
    .replace(/^of\b\s*/, '')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

/**
 * Split a TheMealDB measure ("350g", "2 x 400g tins", "1 1/2 cups chopped",
 * "Juice of 1", "To serve") into { quantity, unit, note, isOptional }.
 * Units come back in the grocery engine's canonical form (tbsp, g, cup, clove…).
 */
export function parseMeasure(raw) {
  const isOptional = OPTIONAL_RE.test(String(raw ?? ''));
  let s = normalizeMeasure(raw);
  if (!s) return { quantity: null, unit: null, note: null, isOptional };

  // "Juice of 1", "zest and juice of 2" — the number is a count of the ingredient.
  const juice = s.match(JUICE_RE);
  if (juice) {
    const note = cleanNote([juice[1].replace('/', ' and '), ...juice[3].split(' ')]);
    return { quantity: roundQty(toNumber(juice[2])), unit: null, note, isOptional };
  }

  // Parentheticals are pack sizes or conversions: "1 (400g) tin", "2 tablespoons (55 grams)".
  const parens = [...s.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim());
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

  let quantity = null;
  const qty = s.match(QTY_RE);
  if (qty) {
    quantity = toNumber(qty[2] ?? qty[1]);        // ranges ("2-3") shop for the high end
    s = s.slice(qty[0].length).replace(/^-(?=[a-z])/, '').trim();   // "8-ounce"
  } else {
    const first = s.split(' ')[0];
    const rest = s.split(' ').slice(1);
    if (WORD_NUMBERS[first] != null && (!['a', 'an'].includes(first) || readUnit(rest))) {
      quantity = WORD_NUMBERS[first];
      s = rest.join(' ');
    }
  }

  // Drop metric/imperial alternates after a slash: "g/3oz", "oz/180g", "ml/2fl oz".
  s = s.replace(/^([a-z]+)\s*\/\s*\d[\d./ ]*?\s*(?:fl\.?\s*oz|[a-z]+)(?:\s+\d+\s*[a-z]+)?/, '$1').trim();

  // "x 400g tins", "- 14-ounce can": a multiplied pack size.
  let unit = null;
  let measured = false;
  if (quantity != null) {
    const pack = s.match(PACK_RE);
    const packUnit = pack && lookupUnit(EXTRA_UNIT_ALIASES[pack[2]] ?? pack[2]);
    if (packUnit) {
      quantity *= toNumber(pack[1]);
      unit = packUnit.unit;
      measured = true;
      s = s.slice(pack[0].length).trim();
    }
  }

  let words = s.split(' ').filter(Boolean);
  const noteWords = [];

  if (!unit) {
    while (words.length && SIZE_WORDS.has(words[0])) noteWords.push(words.shift());

    // "2cm piece" of ginger: the size is a note, the ingredient count is 1.
    if (quantity != null && DIMENSION_UNITS.has(words[0])) {
      noteWords.push(`${roundQty(quantity)}${words.shift()}`);
      quantity = 1;
    }

    const found = readUnit(words);
    // A bare "Pinch" or "Handful" means one of it; a bare "Leaves" says nothing about how many.
    const barePlural = found && !found.measured && quantity == null && /s$/.test(words[0]) && words[0] !== found.unit;
    if (found && !barePlural) {
      unit = found.unit;
      measured = found.measured;
      words = words.slice(found.used);
      if (quantity == null && !measured) quantity = 1;
    }
  }

  // A weight/volume in parentheses beats a count unit: "1 (400g) tin" → 400 g.
  if (!measured) {
    for (const p of parens) {
      const m = normalizeMeasure(p).match(new RegExp(String.raw`^(${NUM})\s*-?\s*([a-z]+)`));
      const u = m && lookupUnit(EXTRA_UNIT_ALIASES[m[2]] ?? m[2]);
      if (u) {
        quantity = (quantity ?? 1) * toNumber(m[1]);
        unit = u.unit;
        measured = true;
        break;
      }
    }
  }

  // Leftover container words after a measured amount add nothing ("400g tins").
  if (measured && words.length && CONTAINER_UNITS.has(COUNT_UNITS[words[0]] ?? words[0])) words.shift();

  if (quantity == null && unit != null && measured) unit = null;  // "tsp" with no number: keep as note
  const note = cleanNote([...noteWords, ...words]);
  return { quantity: roundQty(quantity), unit, note, isOptional };
}

// ── Recipe mapping ────────────────────────────────────────────────────────────

const SPICY_RE = /\b(chill?i(?:e?s)?|chiles?|cayenne|jalape[nñ]os?|habaneros?|scotch bonnets?|sriracha|hot sauce|chipotles?|harissa|gochujang|wasabi|piri[- ]piri|peri[- ]peri|bird'?s[- ]eye)\b/i;

function mealTypeFor(category) {
  switch (category) {
    case 'Breakfast': return 'BREAKFAST';
    case 'Starter':
    case 'Side': return 'LUNCH';
    case 'Dessert': return 'SNACK';
    default: return 'DINNER';
  }
}

/** Instruction text → one step per line, without "STEP 1" headers or "1." prefixes. */
export function cleanInstructions(text) {
  const steps = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:step\s*\d+\s*[:.)-]?|\d+\s*[.)]|[-•▢*])\s*/i, '').trim())
    .filter(Boolean);
  return steps.join('\n') || null;
}

/** The ingredient/measure pairs of a meal, parsed. `original` is the untouched measure. */
export function mealIngredients(meal) {
  const out = [];
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`]?.trim();
    if (!name) continue;
    const original = meal[`strMeasure${i}`]?.trim() || null;
    const { quantity, unit, note, isOptional } = parseMeasure(original);
    out.push({ name: note ? `${name} (${note})` : name, quantity, unit, isOptional, original });
  }
  return out;
}

const cuisineOf = (meal) => meal.strArea || meal.strCountry || null;

/** Compact search-result shape. Filter endpoints only return id, name and thumbnail. */
export function toSummary(meal) {
  return {
    id: Number(meal.idMeal),
    title: meal.strMeal,
    image: meal.strMealThumb ? `${meal.strMealThumb}/medium` : null,
    category: meal.strCategory ?? null,
    cuisine: cuisineOf(meal),
  };
}

/** A TheMealDB meal → NutriLabs recipe fields (ingredients still carry `original`). */
export function mapToNutriLabsRecipe(meal) {
  const ingredients = mealIngredients(meal);
  const category = meal.strCategory ?? null;
  const cuisine = cuisineOf(meal);

  const tags = [];
  if (category === 'Vegan') tags.push('vegan', 'vegetarian');
  if (category === 'Vegetarian') tags.push('vegetarian');
  if (cuisine) tags.push(cuisine);
  for (const t of (meal.strTags ?? '').split(',')) if (t.trim()) tags.push(t.trim().toLowerCase());
  const seen = new Set();
  const uniqueTags = tags.filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));

  const description = [cuisine, category?.toLowerCase()].filter(Boolean).join(' ');

  return {
    name: meal.strMeal.trim(),
    description: description ? `${description} recipe from TheMealDB` : 'Recipe from TheMealDB',
    mealType: mealTypeFor(category),
    servings: 4, // TheMealDB doesn't say; the import sheet lets the user correct it
    prepTimeMinutes: null,
    instructions: cleanInstructions(meal.strInstructions),
    tags: uniqueTags,
    isKidFriendly: !ingredients.some((i) => SPICY_RE.test(i.name)),
    ingredients,
    source: 'THEMEALDB',
    mealDbId: Number(meal.idMeal),
  };
}

// ── API calls ─────────────────────────────────────────────────────────────────

/** { categories: string[], countries: string[] } for the search filters. */
export async function getFilters() {
  const [cats, areas] = await Promise.all([
    getJson('list.php?c=list', 24 * HOUR),
    getJson('list.php?a=list', 24 * HOUR),
  ]);
  if (cats.error) return cats;
  if (areas.error) return areas;
  return {
    categories: (cats.meals ?? []).map((c) => c.strCategory).filter(Boolean).sort(),
    // The area filter matches strCountry ("India"), not strArea ("Indian").
    countries: [...new Set((areas.meals ?? []).map((a) => a.strCountry).filter(Boolean))].sort(),
  };
}

/**
 * Search by name and main ingredient, optionally narrowed by category and/or country.
 * With no query, lists a category/country. Returns { results } or an error object.
 */
export async function searchMeals({ query, category, country }) {
  const text = query?.trim();
  if (!text && !category && !country) return { results: [] };

  // Name search stops at 25 hits and the ingredient filter at ~20, so a broad word like
  // "chicken" also pulls in the whole category it names.
  const lower = text?.toLowerCase();
  const filters = text ? await getFilters() : null;
  const namedCategory = filters?.categories?.find((c) => [lower, lower.replace(/s$/, '')].includes(c.toLowerCase()));

  const [byName, byIngredient, byNamedCategory, byCategory, byCountry] = await Promise.all([
    text ? getJson(`search.php?s=${q(text)}`, HOUR) : null,
    text ? getJson(`filter.php?i=${q(text)}`, HOUR) : null,
    namedCategory && namedCategory !== category ? getJson(`filter.php?c=${q(namedCategory)}`, 24 * HOUR) : null,
    category ? getJson(`filter.php?c=${q(category)}`, 24 * HOUR) : null,
    country ? getJson(`filter.php?a=${q(country)}`, 24 * HOUR) : null,
  ]);
  const failed = [filters, byName, byIngredient, byNamedCategory, byCategory, byCountry].find((r) => r?.error);
  if (failed) return failed;

  let results;
  if (text) {
    // Titles in a selected category/country list match too, past the 25-hit cap.
    const titleHits = [byCategory, byCountry]
      .flatMap((list) => list?.meals ?? [])
      .filter((m) => m.strMeal.toLowerCase().includes(lower));
    const namedCategoryMeals = ((namedCategory === category ? byCategory : byNamedCategory)?.meals ?? [])
      .map((m) => ({ ...m, strCategory: namedCategory }));
    const merged = new Map();
    for (const m of [...(byName.meals ?? []), ...(byIngredient.meals ?? []), ...titleHits, ...namedCategoryMeals]) {
      if (!merged.has(m.idMeal)) merged.set(m.idMeal, toSummary(m));
    }
    results = [...merged.values()];
  } else {
    results = ((byCategory ?? byCountry).meals ?? []).map(toSummary);
  }

  for (const [list, field, value] of [[byCategory, 'category', category], [byCountry, 'cuisine', country]]) {
    if (!list) continue;
    const ids = new Set((list.meals ?? []).map((m) => Number(m.idMeal)));
    results = results.filter((r) => ids.has(r.id)).map((r) => ({ ...r, [field]: r[field] ?? value }));
  }

  return { results: results.slice(0, 100) };
}

/** Full meal by id: the raw TheMealDB object, null when it doesn't exist, or an error object. */
export async function getMeal(mealDbId) {
  const data = await getJson(`lookup.php?i=${q(mealDbId)}`, 24 * HOUR);
  if (data.error) return data;
  return data.meals?.[0] ?? null;
}

/** Cheap reachability check for the Settings → Connections tab. */
export async function testConnection() {
  cache.delete('list.php?c=list');
  const data = await getJson('list.php?c=list', 24 * HOUR);
  if (data.error) return { connected: false, message: data.message };
  return { connected: true, message: `Connected — ${data.meals?.length ?? 0} categories available` };
}
