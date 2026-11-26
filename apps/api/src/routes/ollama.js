import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  testConnection,
  getAvailableModels,
  planDay,
  suggestIdeas,
  expandIdea,
  estimateMacros,
  weeklyInsight,
  suggestRecipesByPrompt,
} from '../services/ollama.js';
import { ollamaState } from '../lib/ollamaState.js';
import { settingsForUser, getInstanceSettings } from '../lib/instanceSettings.js';
import { limits } from '../lib/security.js';
import { loadPlanContext } from '../lib/aiContext.js';

// The user's own settings, with the server-wide Ollama host/model.
const getUserSettings = settingsForUser;

// ── /api/ollama/* ─────────────────────────────────────────────────────────────

const ollamaRouter = Router();
ollamaRouter.use(requireAuth, limits.ai);

// GET /api/ollama/models
ollamaRouter.get('/models', asyncHandler(async (req, res) => {
  const { ollamaHost } = await getInstanceSettings();
  const models = await getAvailableModels(ollamaHost);
  res.json({ data: models, error: null });
}));

// POST /api/ollama/test
ollamaRouter.post('/test', asyncHandler(async (req, res) => {
  const { ollamaHost } = await getInstanceSettings();
  const result = await testConnection(ollamaHost);
  ollamaState.connected = result.connected;
  ollamaState.lastCheckedAt = Date.now();
  res.json({ data: result, error: null });
}));

export default ollamaRouter;

// ── AI routes mounted at /api (mealplans, recipes, budget) ────────────────────

// Mounted at /api, so router-level middleware would run for every /api request
// that passes through: the AI rate limit is attached per route instead.
export const aiRouter = Router();
aiRouter.use(requireAuth);

const DAY_ENUM = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
const SLOT_ENUM = z.enum(['BREAKFAST', 'LUNCH', 'DINNER']);

function validationError(res, parsed) {
  return res.status(400).json({ data: null, error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' } });
}

const planNotFound = (res) => res.status(404).json({ data: null, error: { message: 'Meal plan not found', code: 'NOT_FOUND' } });
const aiFailed = (res, result) => res.status(502).json({ data: null, error: { message: result.message, code: result.code } });

/** Save a generated recipe to the user's library (source AI). */
function saveAiRecipe(userId, recipe, mealType, servings) {
  return prisma.recipe.create({
    data: {
      userId,
      source: 'AI',
      name: recipe.name,
      description: recipe.description,
      mealType,
      servings,
      prepTimeMinutes: recipe.prepTimeMinutes,
      calories: recipe.estimatedCalories,
      proteinG: recipe.estimatedProteinG,
      carbsG: recipe.estimatedCarbsG,
      fatG: recipe.estimatedFatG,
      costPerServing: recipe.estimatedCostPerServing,
      isKidFriendly: recipe.isKidFriendly,
      tags: recipe.cuisine ? [recipe.cuisine.toLowerCase()] : [],
      instructions: recipe.instructions,
      ingredients: { create: recipe.ingredients },
    },
  });
}

function assignSlot(mealPlanId, dayOfWeek, mealType, recipeId) {
  return prisma.plannedMeal.upsert({
    where: { mealPlanId_dayOfWeek_mealType: { mealPlanId, dayOfWeek, mealType } },
    update: { recipeId },
    create: { mealPlanId, dayOfWeek, mealType, recipeId },
  });
}

// POST /api/mealplans/:id/ai-fill-day  { dayOfWeek, avoid?: string[] }
// Plans the day's EMPTY breakfast/lunch/dinner slots, saves the recipes and assigns
// them. The week planner calls this once per day so each request stays short and
// the grid fills in as it goes.
aiRouter.post('/mealplans/:id/ai-fill-day', limits.ai, asyncHandler(async (req, res) => {
  const parsed = z.object({
    dayOfWeek: DAY_ENUM,
    avoid: z.array(z.string().max(200)).max(40).default([]),
  }).safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { dayOfWeek, avoid } = parsed.data;

  const mealPlanId = parseInt(req.params.id);
  const loaded = await loadPlanContext(req.user, mealPlanId);
  if (!loaded) return planNotFound(res);
  const { plan, ctx, settings, eatersFor } = loaded;

  const filled = new Set(plan.plannedMeals.filter((m) => m.dayOfWeek === dayOfWeek && m.recipeId).map((m) => m.mealType));
  const mealTypes = SLOT_ENUM.options.filter((t) => !filled.has(t));
  if (!mealTypes.length) return res.json({ data: { dayOfWeek, meals: [] }, error: null });

  const eaters = eatersFor(dayOfWeek);
  ctx.weekMeals = [...new Set([...ctx.weekMeals, ...avoid])];
  const result = await planDay(ctx, { dayOfWeek, mealTypes, eaters }, settings);
  if (result?.error) return aiFailed(res, result);
  if (!result.length) return aiFailed(res, { code: 'OLLAMA_EMPTY', message: 'The AI returned no meals — try again' });

  const meals = [];
  for (const meal of result) {
    const recipe = await saveAiRecipe(req.user.userId, meal, meal.mealType, eaters.length);
    await assignSlot(mealPlanId, dayOfWeek, meal.mealType, recipe.id);
    meals.push({ mealType: meal.mealType, recipeId: recipe.id, name: recipe.name });
  }
  res.json({ data: { dayOfWeek, meals }, error: null });
}));

// POST /api/mealplans/:id/ai-suggest-slot  { dayOfWeek, mealType, request? }
// Quick ideas (no ingredients yet) for one slot.
aiRouter.post('/mealplans/:id/ai-suggest-slot', limits.ai, asyncHandler(async (req, res) => {
  const parsed = z.object({
    dayOfWeek: DAY_ENUM,
    mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']),
    request: z.string().trim().max(300).optional(),
    exclude: z.array(z.string().max(200)).max(40).default([]),
  }).safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { dayOfWeek, mealType, request, exclude } = parsed.data;

  const loaded = await loadPlanContext(req.user, parseInt(req.params.id));
  if (!loaded) return planNotFound(res);
  const { ctx, settings, eatersFor } = loaded;
  ctx.weekMeals = [...new Set([...ctx.weekMeals, ...exclude])];

  const result = await suggestIdeas(ctx, { dayOfWeek, mealType, eaters: eatersFor(dayOfWeek), request }, settings);
  if (result?.error) return aiFailed(res, result);
  res.json({ data: result, error: null });
}));

// POST /api/mealplans/:id/ai-expand  { dayOfWeek, mealType, idea, assign }
// Writes the full recipe for a chosen idea, saves it, and optionally assigns it.
aiRouter.post('/mealplans/:id/ai-expand', limits.ai, asyncHandler(async (req, res) => {
  const parsed = z.object({
    dayOfWeek: DAY_ENUM,
    mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']),
    assign: z.boolean().default(true),
    idea: z.object({
      name: z.string().trim().min(1).max(200),
      description: z.string().max(500).nullable().optional(),
      cuisine: z.string().max(50).nullable().optional(),
      prepTimeMinutes: z.number().nullable().optional(),
      estimatedCalories: z.number().nullable().optional(),
      estimatedProteinG: z.number().nullable().optional(),
      estimatedCarbsG: z.number().nullable().optional(),
      estimatedFatG: z.number().nullable().optional(),
      estimatedCostPerServing: z.number().nullable().optional(),
      isKidFriendly: z.boolean().optional(),
    }),
  }).safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const { dayOfWeek, mealType, idea, assign } = parsed.data;

  const mealPlanId = parseInt(req.params.id);
  const loaded = await loadPlanContext(req.user, mealPlanId);
  if (!loaded) return planNotFound(res);
  const { ctx, settings, eatersFor } = loaded;
  const eaters = eatersFor(dayOfWeek);

  const result = await expandIdea(ctx, { idea, mealType, eaters }, settings);
  if (result?.error) return aiFailed(res, result);

  const recipe = await saveAiRecipe(req.user.userId, result, mealType, eaters.length);
  if (assign) await assignSlot(mealPlanId, dayOfWeek, mealType, recipe.id);
  res.json({ data: { recipeId: recipe.id, name: recipe.name, assigned: assign }, error: null });
}));

// POST /api/recipes/estimate-macros
aiRouter.post('/recipes/estimate-macros', limits.ai, asyncHandler(async (req, res) => {
  const schema = z.object({
    recipeName: z.string().min(1).max(200),
    ingredients: z.array(z.string().min(1).max(300)).max(60),
    servings: z.number().int().min(1).max(100).default(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      data: null,
      error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' },
    });
  }

  const settings = await getUserSettings(req.user.userId);
  const result = await estimateMacros(parsed.data.recipeName, parsed.data.ingredients, parsed.data.servings, settings);
  if (result?.error) {
    return res.status(502).json({ data: null, error: { message: result.message, code: result.code } });
  }
  res.json({ data: result, error: null });
}));

// POST /api/recipes/ai-suggest
aiRouter.post('/recipes/ai-suggest', limits.ai, asyncHandler(async (req, res) => {
  const schema = z.object({ prompt: z.string().min(1).max(500) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      data: null,
      error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' },
    });
  }

  const settings = await getUserSettings(req.user.userId);
  const result = await suggestRecipesByPrompt(parsed.data.prompt, settings, { foodPreferences: settings?.foodPreferences });
  if (result?.error) {
    return res.status(502).json({ data: null, error: { message: result.message, code: result.code } });
  }
  res.json({ data: result, error: null });
}));

// GET /api/budget/insight
aiRouter.get('/budget/insight', limits.ai, asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const settings = await getUserSettings(userId);

  const now = new Date();
  const thisWeekStart = new Date(now);
  thisWeekStart.setUTCDate(now.getUTCDate() - 7);
  const lastWeekStart = new Date(now);
  lastWeekStart.setUTCDate(now.getUTCDate() - 14);

  const [thisWeekLogs, lastWeekLogs] = await Promise.all([
    prisma.eatingOutLog.findMany({
      where: { userId, date: { gte: thisWeekStart, lt: now } },
    }),
    prisma.eatingOutLog.findMany({
      where: { userId, date: { gte: lastWeekStart, lt: thisWeekStart } },
    }),
  ]);

  const sumAmount = (logs) => logs.reduce((s, l) => s + l.amount, 0);

  const thisWeekPlan = await prisma.mealPlan.findFirst({
    where: { userId, weekStartDate: { gte: thisWeekStart } },
    include: { plannedMeals: true },
  });
  const mealsCooked = thisWeekPlan?.plannedMeals.filter((m) => m.eaten && m.recipeId).length ?? 0;

  const dayCounts = {};
  for (const log of thisWeekLogs) {
    const day = new Date(log.date).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    dayCounts[day] = (dayCounts[day] ?? 0) + 1;
  }
  const topEatingOutDay = Object.keys(dayCounts).sort((a, b) => dayCounts[b] - dayCounts[a])[0] ?? null;

  const budgetSummary = {
    thisWeekGrocerySpend: 0,
    thisWeekEatingOutSpend: sumAmount(thisWeekLogs),
    lastWeekGrocerySpend: 0,
    lastWeekEatingOutSpend: sumAmount(lastWeekLogs),
    mealsCooked,
    mealsEatenOut: thisWeekLogs.length,
    topEatingOutDay,
  };

  const insight = await weeklyInsight(budgetSummary, settings);
  res.json({ data: { insight }, error: null });
}));
