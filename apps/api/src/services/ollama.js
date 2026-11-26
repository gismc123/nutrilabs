import fetch from 'node-fetch';

// Every call asks for a small, bounded answer (one day, or a handful of ideas), so a
// healthy local model finishes well inside this. A whole week in one call does not:
// ~4k tokens took ~90s warm and overran this limit and the Cloudflare tunnel's.
const TIMEOUT_MS = 120_000;
const NUM_CTX = 8192;

async function ollamaGet(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  return res.json();
}

/**
 * One /api/chat call with a JSON-schema `format`, so the reply always has the
 * expected shape. Thinking is switched off: reasoning models (gemma4, qwen3,
 * deepseek-r1) otherwise spend thousands of hidden tokens before answering.
 */
async function ollamaJson(settings, { system, user, schema, temperature = 0.7, maxTokens = 2048 }) {
  const call = async (think) => {
    const body = {
      model: settings.ollamaModel,
      stream: false,
      format: schema,
      keep_alive: '30m',
      options: { temperature, num_ctx: NUM_CTX, num_predict: maxTokens },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    };
    if (think === false) body.think = false;
    let res;
    try {
      res = await fetch(`${settings.ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new Error(`The AI model (${settings.ollamaModel}) took longer than ${TIMEOUT_MS / 1000}s — the PC running Ollama may be busy`);
      }
      throw new Error(`Could not reach Ollama at ${settings.ollamaHost} (${err.message})`);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error ?? `Ollama returned HTTP ${res.status}`);
    return data;
  };

  let data;
  try {
    data = await call(false);
  } catch (err) {
    // Older Ollama builds reject `think` for models without a thinking mode.
    if (!/think/i.test(err.message)) throw err;
    data = await call(undefined);
  }
  const text = data.message?.content ?? '';
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(data.done_reason === 'length'
      ? 'The AI answer was cut off — try again'
      : 'The AI returned malformed JSON — try again');
  }
}

const fail = (err) => ({ error: true, code: 'OLLAMA_UNAVAILABLE', message: err.message });

// ── Prompt pieces ─────────────────────────────────────────────────────────────

const PLANNER_SYSTEM = `You are a practical home-cooking meal planner for a US household.
Suggest real, well-known dishes that an ordinary home cook actually makes, using regular grocery-store ingredients.
- Use specific, recognisable dish names (e.g. "Sheet-Pan Chicken Fajitas", "Turkey Chili", "Breakfast Burritos"), never vague ones like "Healthy Protein Bowl".
- No odd fusion experiments, restaurant-only techniques, or hard-to-find ingredients.
- Respect every dislike, allergy and dietary note. The household's stated preferences matter most.
- Vary proteins, cuisines and cooking styles; don't repeat dishes the household already has this week.
- Breakfasts are quick (under 15 minutes on weekdays). Weeknight dinners take under 45 minutes.
- Calories, macros and cost are per serving and realistic for the dish. Cost is US grocery prices in dollars.
Respond with JSON only.`;

const MEAL_LABEL = { BREAKFAST: 'breakfast', LUNCH: 'lunch', DINNER: 'dinner', SNACK: 'snack' };
const DAY_LABEL = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday' };

function describeEaters(eaters) {
  return eaters.map((p) => {
    const bits = [p.name];
    if (p.age) bits.push(`age ${p.age}`);
    if (p.dietaryNotes) bits.push(`diet: ${p.dietaryNotes}`);
    if (p.foodDislikes) bits.push(`dislikes: ${p.foodDislikes}`);
    if (p.calorieTarget) bits.push(`~${p.calorieTarget} kcal/day`);
    return `- ${bits.join(', ')}`;
  }).join('\n');
}

/** The household facts every planning prompt shares. */
function householdBlock(ctx, eaters) {
  const lines = [];
  lines.push(`Eating (${eaters.length} ${eaters.length === 1 ? 'person' : 'people'}):\n${describeEaters(eaters) || '- one adult'}`);
  if (ctx.foodPreferences) lines.push(`Household food preferences (follow these closely): ${ctx.foodPreferences}`);
  if (ctx.likedRecipes?.length) lines.push(`Dishes already in their recipe box (their taste — similar styles are welcome): ${ctx.likedRecipes.join(', ')}`);
  if (ctx.weekMeals?.length) lines.push(`Already planned this week (don't repeat): ${ctx.weekMeals.join(', ')}`);
  if (ctx.pantryStaples?.length) lines.push(`Pantry staples on hand: ${ctx.pantryStaples.join(', ')}`);
  if (ctx.costTarget) lines.push(`Budget: aim for about $${ctx.costTarget.toFixed(2)} per serving or less.`);
  return lines.join('\n');
}

const KID_NOTE = (eaters) => (eaters.some((p) => p.age != null && p.age < 13)
  ? 'Kids are eating, so every dish must be kid-friendly.'
  : '');

// ── JSON schemas (Ollama structured outputs) ─────────────────────────────────

const int = { type: 'integer' };
const num = { type: 'number' };
const str = { type: 'string' };
const bool = { type: 'boolean' };

const IDEA_PROPS = {
  name: str,
  description: str,
  cuisine: str,
  prepTimeMinutes: int,
  estimatedCalories: int,
  estimatedProteinG: int,
  estimatedCarbsG: int,
  estimatedFatG: int,
  estimatedCostPerServing: num,
  isKidFriendly: bool,
};

const INGREDIENT_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: { name: str, quantity: num, unit: str },
    required: ['name', 'quantity', 'unit'],
  },
};

const RECIPE_PROPS = {
  ...IDEA_PROPS,
  ingredients: INGREDIENT_SCHEMA,
  instructions: { type: 'array', items: str },
};

const objectOf = (props) => ({ type: 'object', properties: props, required: Object.keys(props) });

const INGREDIENT_RULES = `Ingredient quantities are the TOTAL to buy for the whole recipe. "name" is the plain grocery item ("chicken breast", "shredded cheddar"). "unit" is one of cup, tbsp, tsp, lb, oz, can, clove, slice, or "" for whole items (e.g. 3 eggs → quantity 3, unit ""). Skip water, salt and pepper.`;

// ── Cleaning model output ─────────────────────────────────────────────────────

function parseQuantity(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const parts = value.trim().split(/\s+/);
  let total = 0;
  for (const part of parts) {
    const frac = part.match(/^(\d+)\/(\d+)$/);
    if (frac) total += Number(frac[1]) / Number(frac[2]);
    else if (!Number.isNaN(Number(part))) total += Number(part);
    else return total > 0 ? total : null;
  }
  return total > 0 ? total : null;
}

// Coerce a model's ingredient list into { name, quantity, unit } rows the recipe API accepts.
export function cleanIngredients(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((raw) => {
      if (typeof raw === 'string') return { name: raw.trim(), quantity: null, unit: null };
      const name = String(raw?.name ?? raw?.ingredient ?? raw?.item ?? '').trim().slice(0, 200);
      const unit = raw?.unit != null && String(raw.unit).trim() ? String(raw.unit).trim().slice(0, 40) : null;
      return { name, quantity: parseQuantity(raw?.quantity ?? raw?.amount), unit };
    })
    .filter((i) => i.name)
    .slice(0, 60);
}

const posInt = (v, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : null;
};

function cleanIdea(raw) {
  const cost = Number(raw?.estimatedCostPerServing);
  return {
    name: String(raw?.name ?? '').trim().slice(0, 200),
    description: raw?.description ? String(raw.description).trim().slice(0, 500) : null,
    cuisine: raw?.cuisine ? String(raw.cuisine).trim().slice(0, 50) : null,
    prepTimeMinutes: posInt(raw?.prepTimeMinutes, 600),
    estimatedCalories: posInt(raw?.estimatedCalories, 5000),
    estimatedProteinG: posInt(raw?.estimatedProteinG, 500),
    estimatedCarbsG: posInt(raw?.estimatedCarbsG, 1000),
    estimatedFatG: posInt(raw?.estimatedFatG, 500),
    estimatedCostPerServing: Number.isFinite(cost) && cost > 0 ? Math.round(Math.min(cost, 100) * 100) / 100 : null,
    isKidFriendly: raw?.isKidFriendly !== false,
  };
}

function cleanRecipe(raw) {
  const steps = Array.isArray(raw?.instructions)
    ? raw.instructions.map((s) => String(s).trim()).filter(Boolean)
    : String(raw?.instructions ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  return {
    ...cleanIdea(raw),
    ingredients: cleanIngredients(raw?.ingredients),
    instructions: steps.map((s, i) => (/^\d+[.)]/.test(s) ? s : `${i + 1}. ${s}`)).join('\n').slice(0, 20000) || null,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function testConnection(ollamaHost) {
  try {
    const data = await ollamaGet(`${ollamaHost}/api/tags`);
    const models = (data.models ?? []).map((m) => m.name);
    return { connected: true, models };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

export async function getAvailableModels(ollamaHost) {
  try {
    const data = await ollamaGet(`${ollamaHost}/api/tags`);
    return (data.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}

/**
 * Full recipes (with ingredients and steps) for some meal slots of one day.
 * One day per call keeps the answer to ~1-1.5k tokens (10-25s on a local model).
 * Returns [{ mealType, ...recipe }] or an error object.
 */
export async function planDay(ctx, { dayOfWeek, mealTypes, eaters }, settings) {
  const schema = objectOf({
    meals: { type: 'array', items: objectOf({ mealType: { type: 'string', enum: mealTypes }, ...RECIPE_PROPS }) },
  });
  const user = `Plan ${DAY_LABEL[dayOfWeek]}'s ${mealTypes.map((m) => MEAL_LABEL[m]).join(', ')} — exactly one meal for each: ${mealTypes.join(', ')}.

${householdBlock(ctx, eaters)}
${KID_NOTE(eaters)}

Each recipe makes ${eaters.length} serving${eaters.length === 1 ? '' : 's'} (one per person eating). ${INGREDIENT_RULES}
Keep instructions to 3-6 short steps. Macros and cost are per serving.`;

  try {
    const parsed = await ollamaJson(settings, { system: PLANNER_SYSTEM, user, schema, temperature: 0.8, maxTokens: 3000 });
    const meals = (parsed?.meals ?? [])
      .filter((m) => mealTypes.includes(m?.mealType))
      .map((m) => ({ mealType: m.mealType, ...cleanRecipe(m) }))
      .filter((m) => m.name);
    // One per slot, even if the model doubled one up.
    const bySlot = new Map();
    for (const m of meals) if (!bySlot.has(m.mealType)) bySlot.set(m.mealType, m);
    return [...bySlot.values()];
  } catch (err) {
    return fail(err);
  }
}

/**
 * Quick ideas for one slot — names, descriptions and estimates only, no ingredients,
 * so it returns in a few seconds. The chosen idea is expanded with expandIdea().
 */
export async function suggestIdeas(ctx, { dayOfWeek, mealType, eaters, request, count = 5 }, settings) {
  const schema = objectOf({ meals: { type: 'array', items: objectOf(IDEA_PROPS) } });
  const slot = dayOfWeek ? `${DAY_LABEL[dayOfWeek]} ${MEAL_LABEL[mealType]}` : MEAL_LABEL[mealType];
  const user = `Suggest ${count} different ${slot} ideas.
${request ? `\nWhat they're in the mood for (most important): "${request}"\n` : ''}
${householdBlock(ctx, eaters)}
${KID_NOTE(eaters)}

Make the ${count} ideas clearly different from each other (different proteins or cuisines). Description: one appetising sentence.`;

  try {
    const parsed = await ollamaJson(settings, { system: PLANNER_SYSTEM, user, schema, temperature: 0.9, maxTokens: 1200 });
    return (parsed?.meals ?? []).map(cleanIdea).filter((m) => m.name).slice(0, count);
  } catch (err) {
    return fail(err);
  }
}

/** Turn a chosen idea into a full recipe with ingredients and steps. */
export async function expandIdea(ctx, { idea, mealType, eaters }, settings) {
  const schema = objectOf(RECIPE_PROPS);
  const user = `Write the full recipe for "${idea.name}"${idea.description ? ` (${idea.description})` : ''} as a ${MEAL_LABEL[mealType]}.

${householdBlock({ foodPreferences: ctx.foodPreferences, pantryStaples: ctx.pantryStaples }, eaters)}

The recipe makes ${eaters.length} serving${eaters.length === 1 ? '' : 's'}. ${INGREDIENT_RULES}
Instructions: 3-8 short, clear steps. Macros and cost are per serving.`;

  try {
    const parsed = await ollamaJson(settings, { system: PLANNER_SYSTEM, user, schema, temperature: 0.4, maxTokens: 2000 });
    return cleanRecipe({ ...idea, ...parsed, name: idea.name });
  } catch (err) {
    return fail(err);
  }
}

/** Recipe Library "Ask AI": free-text request → 5 full recipes. */
export async function suggestRecipesByPrompt(userPrompt, settings, ctx = {}) {
  const schema = objectOf({
    recipes: {
      type: 'array',
      items: objectOf({ mealType: { type: 'string', enum: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] }, ...RECIPE_PROPS }),
    },
  });
  const user = `Request: "${userPrompt}"

${ctx.foodPreferences ? `Household food preferences: ${ctx.foodPreferences}\n` : ''}Suggest 4 different recipes that fit the request, each serving 4. ${INGREDIENT_RULES}
Keep instructions to 3-6 short steps. Macros and cost are per serving.`;

  try {
    const parsed = await ollamaJson(settings, { system: PLANNER_SYSTEM, user, schema, temperature: 0.8, maxTokens: 4000 });
    return (parsed?.recipes ?? [])
      .map((r) => ({ ...cleanRecipe(r), mealType: r.mealType, servings: 4 }))
      .filter((r) => r.name);
  } catch (err) {
    return fail(err);
  }
}

export async function estimateMacros(recipeName, ingredients, servings, settings) {
  // Ask for the whole-recipe total and divide here: local models are unreliable at
  // "per serving" arithmetic (they tend to return totals or something in between).
  const schema = objectOf({ calories: int, proteinG: num, carbsG: num, fatG: num, totalCost: num });
  const user = `Recipe: ${recipeName}
Ingredients (amounts for the WHOLE recipe):
${ingredients.join('\n')}

Estimate the TOTAL nutrition of all the ingredients above combined, and their total US grocery cost in dollars.`;

  try {
    const parsed = await ollamaJson(settings, {
      system: 'You are a careful nutrition estimator. Respond with JSON only.', user, schema, temperature: 0.1, maxTokens: 300,
    });
    const per = (v, digits = 0) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      const f = 10 ** digits;
      return Math.round((n / servings) * f) / f;
    };
    return {
      calories: per(parsed.calories),
      proteinG: per(parsed.proteinG, 1),
      carbsG: per(parsed.carbsG, 1),
      fatG: per(parsed.fatG, 1),
      costPerServingEstimate: per(parsed.totalCost, 2),
    };
  } catch (err) {
    return fail(err);
  }
}

export async function weeklyInsight(budgetSummary, settings) {
  const user = `Weekly summary:
- Grocery spend this week: $${(budgetSummary.thisWeekGrocerySpend / 100).toFixed(2)}
- Eating out spend this week: $${(budgetSummary.thisWeekEatingOutSpend / 100).toFixed(2)}
- Grocery spend last week: $${(budgetSummary.lastWeekGrocerySpend / 100).toFixed(2)}
- Eating out spend last week: $${(budgetSummary.lastWeekEatingOutSpend / 100).toFixed(2)}
- Meals cooked at home: ${budgetSummary.mealsCooked}
- Meals eaten out: ${budgetSummary.mealsEatenOut}
- Most common eating out day: ${budgetSummary.topEatingOutDay ?? 'unknown'}

Summarise the week in one positive, motivating sentence (max 20 words).`;

  try {
    const parsed = await ollamaJson(settings, {
      system: 'You are a friendly nutrition coach. Respond with JSON only.', user, schema: objectOf({ insight: str }), maxTokens: 120,
    });
    return parsed?.insight ?? '';
  } catch {
    return '';
  }
}

/**
 * Pull a recipe out of messy page text (or text the user pasted). Copies what's
 * there rather than inventing: ingredient lines come back verbatim and are parsed
 * by the same code as structured imports. Returns { found: false } if no recipe.
 */
export async function extractRecipeFromText(text, settings) {
  const schema = objectOf({
    found: bool,
    name: str,
    description: str,
    servings: int,
    totalTimeMinutes: int,
    mealType: { type: 'string', enum: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] },
    ingredientLines: { type: 'array', items: str },
    instructions: { type: 'array', items: str },
  });
  const user = `Below is text from a recipe web page (or text a user pasted). Extract the recipe exactly as written.
- ingredientLines: each ingredient line verbatim with its amount, e.g. "2 cups shredded cheddar cheese".
- instructions: the steps in order, lightly shortened if very long, without step numbers.
- servings: the yield (use 4 if not stated). totalTimeMinutes: total time (0 if not stated).
- Do not invent ingredients or steps. If the text contains no recipe, set found to false.

TEXT:
"""
${text}
"""`;
  try {
    const parsed = await ollamaJson(settings, {
      system: 'You extract recipes from web page text accurately. Respond with JSON only.',
      user, schema, temperature: 0, maxTokens: 3000,
    });
    return parsed;
  } catch (err) {
    return fail(err);
  }
}
