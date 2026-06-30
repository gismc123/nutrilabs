import fetch from 'node-fetch';

const TIMEOUT_MS = 120_000;

function withTimeout(promise, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, timer };
}

async function ollamaGet(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function unwrapArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const nested = Object.values(value).find(Array.isArray);
    if (nested) return nested;
  }
  return value;
}

async function ollamaGenerate(ollamaHost, model, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ollamaHost}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, format: 'json' }),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error ?? `Ollama returned HTTP ${res.status}`);
    }
    return JSON.parse(data.response);
  } finally {
    clearTimeout(timer);
  }
}

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

export async function suggestMeals(context, settings) {
  const { activeProfiles, weeklyBudget, existingMeals, pantryStaples, nutritionGoals } = context;

  const prompt = `You are a meal planning assistant. Respond with JSON only, no markdown.

Household members: ${JSON.stringify(activeProfiles)}
Weekly grocery budget: $${(weeklyBudget / 100).toFixed(2)}
Meals already planned: ${existingMeals.join(', ') || 'none'}
Pantry staples available: ${pantryStaples.join(', ') || 'none'}
Nutrition goals: ${JSON.stringify(nutritionGoals)}

Return a JSON array of exactly 21 meal suggestions covering 7 days (MON through SUN) and 3 meals per day (BREAKFAST, LUNCH, DINNER).
Each item must include: dayOfWeek (MON/TUE/WED/THU/FRI/SAT/SUN), mealType (BREAKFAST/LUNCH/DINNER), name, description, estimatedCalories (integer), estimatedProteinG (integer), estimatedCarbsG (integer), estimatedFatG (integer), estimatedCostPerServing (number in dollars), isKidFriendly (boolean), reason (one sentence explaining why this meal fits the household).
Return only the JSON array.`;

  try {
    const parsed = unwrapArray(await ollamaGenerate(settings.ollamaHost, settings.ollamaModel, prompt));
    if (!Array.isArray(parsed)) {
      return { error: true, code: 'OLLAMA_UNAVAILABLE', message: 'Response was not an array' };
    }
    return parsed;
  } catch (err) {
    return { error: true, code: 'OLLAMA_UNAVAILABLE', message: err.message };
  }
}

export async function suggestMealForSlot(slotContext, settings) {
  const {
    dayOfWeek, mealType, householdMode, activeProfiles,
    remainingCaloriesForDay, weeklyBudgetRemaining, recipesAlreadyThisWeek, pantryStaples,
  } = slotContext;

  const prompt = `You are a meal planning assistant. Respond with JSON only, no markdown.

Slot: ${dayOfWeek} ${mealType}
Household mode: ${householdMode}
Household members: ${JSON.stringify(activeProfiles)}
Remaining calories for the day: ${remainingCaloriesForDay ?? 'unknown'}
Remaining weekly budget: $${weeklyBudgetRemaining != null ? (weeklyBudgetRemaining / 100).toFixed(2) : 'unknown'}
Recipes already this week: ${(recipesAlreadyThisWeek ?? []).join(', ') || 'none'}
Pantry staples: ${(pantryStaples ?? []).join(', ') || 'none'}

Return a JSON array of exactly 3 meal options for this slot.
Each option must include: name, description, estimatedCalories (integer), estimatedProteinG (integer), estimatedCarbsG (integer), estimatedFatG (integer), estimatedCostPerServing (number in dollars), isKidFriendly (boolean), reason (one sentence).
Return only the JSON array.`;

  try {
    const parsed = unwrapArray(await ollamaGenerate(settings.ollamaHost, settings.ollamaModel, prompt));
    if (!Array.isArray(parsed)) {
      return { error: true, code: 'OLLAMA_UNAVAILABLE', message: 'Response was not an array' };
    }
    return parsed;
  } catch (err) {
    return { error: true, code: 'OLLAMA_UNAVAILABLE', message: err.message };
  }
}

export async function estimateMacros(recipeName, ingredients, settings) {
  const prompt = `You are a nutrition estimator. Respond with JSON only, no markdown.

Recipe: ${recipeName}
Ingredients (per serving):
${ingredients.join('\n')}

Return a JSON object with these fields per serving: calories (integer), proteinG (number), carbsG (number), fatG (number), costPerServingEstimate (number in dollars).
Return only the JSON object.`;

  try {
    const parsed = await ollamaGenerate(settings.ollamaHost, settings.ollamaModel, prompt);
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: true, code: 'OLLAMA_UNAVAILABLE', message: 'Response was not an object' };
    }
    return parsed;
  } catch (err) {
    return { error: true, code: 'OLLAMA_UNAVAILABLE', message: err.message };
  }
}

export async function suggestRecipesByPrompt(userPrompt, settings) {
  const prompt = `You are a recipe suggestion assistant. Respond with JSON only, no markdown.

User request: "${userPrompt}"

Return a JSON array of exactly 5 recipe suggestions.
Each item must include: name, description, mealType (BREAKFAST/LUNCH/DINNER/SNACK), estimatedCalories (integer), estimatedProteinG (integer), estimatedCarbsG (integer), estimatedFatG (integer), estimatedCostPerServing (number in dollars), isKidFriendly (boolean), prepTimeMinutes (integer).
Return only the JSON array.`;

  try {
    const parsed = unwrapArray(await ollamaGenerate(settings.ollamaHost, settings.ollamaModel, prompt));
    if (!Array.isArray(parsed)) {
      return { error: true, code: 'OLLAMA_UNAVAILABLE', message: 'Response was not an array' };
    }
    return parsed;
  } catch (err) {
    return { error: true, code: 'OLLAMA_UNAVAILABLE', message: err.message };
  }
}

export async function weeklyInsight(budgetSummary, settings) {
  const prompt = `You are a friendly nutrition coach. Respond with JSON only, no markdown.

Weekly summary:
- Grocery spend this week: $${(budgetSummary.thisWeekGrocerySpend / 100).toFixed(2)}
- Eating out spend this week: $${(budgetSummary.thisWeekEatingOutSpend / 100).toFixed(2)}
- Grocery spend last week: $${(budgetSummary.lastWeekGrocerySpend / 100).toFixed(2)}
- Eating out spend last week: $${(budgetSummary.lastWeekEatingOutSpend / 100).toFixed(2)}
- Meals cooked at home: ${budgetSummary.mealsCooked}
- Meals eaten out: ${budgetSummary.mealsEatenOut}
- Most common eating out day: ${budgetSummary.topEatingOutDay ?? 'unknown'}

Return a JSON object with a single key "insight" containing one sentence (max 20 words) summarizing the week in a positive, motivating tone.
Return only the JSON object.`;

  try {
    const parsed = await ollamaGenerate(settings.ollamaHost, settings.ollamaModel, prompt);
    return parsed?.insight ?? '';
  } catch {
    return '';
  }
}
