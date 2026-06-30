import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  testConnection,
  getAvailableModels,
  suggestMeals,
  suggestMealForSlot,
  estimateMacros,
  weeklyInsight,
  suggestRecipesByPrompt,
} from '../services/ollama.js';
import { ollamaState } from '../lib/ollamaState.js';

async function getUserSettings(userId) {
  return prisma.appSettings.findUnique({ where: { userId } });
}

// ── /api/ollama/* ─────────────────────────────────────────────────────────────

const ollamaRouter = Router();
ollamaRouter.use(requireAuth);

// GET /api/ollama/models
ollamaRouter.get('/models', asyncHandler(async (req, res) => {
  const settings = await getUserSettings(req.user.userId);
  const models = await getAvailableModels(settings?.ollamaHost ?? 'http://192.168.1.190:11434');
  res.json({ data: models, error: null });
}));

// POST /api/ollama/test
ollamaRouter.post('/test', asyncHandler(async (req, res) => {
  const settings = await getUserSettings(req.user.userId);
  const result = await testConnection(settings?.ollamaHost ?? 'http://192.168.1.190:11434');
  ollamaState.connected = result.connected;
  ollamaState.lastCheckedAt = Date.now();
  res.json({ data: result, error: null });
}));

export default ollamaRouter;

// ── AI routes mounted at /api (mealplans, recipes, budget) ────────────────────

export const aiRouter = Router();
aiRouter.use(requireAuth);

// POST /api/mealplans/:id/ai-suggest
aiRouter.post('/mealplans/:id/ai-suggest', asyncHandler(async (req, res) => {
  const mealPlanId = parseInt(req.params.id);
  const userId = req.user.userId;

  const [plan, settings, profiles, staples] = await Promise.all([
    prisma.mealPlan.findFirst({
      where: { id: mealPlanId, userId },
      include: { plannedMeals: { include: { recipe: true } }, dayConfigs: true },
    }),
    getUserSettings(userId),
    prisma.profile.findMany({ where: { userId } }),
    prisma.pantryStaple.findMany({ where: { userId } }),
  ]);

  if (!plan) {
    return res.status(404).json({ data: null, error: { message: 'Meal plan not found', code: 'NOT_FOUND' } });
  }

  const existingMeals = plan.plannedMeals
    .filter((m) => m.recipe)
    .map((m) => m.recipe.name);

  const activeProfiles = profiles.map((p) => ({
    name: p.name,
    age: p.age,
    dietaryNotes: p.dietaryNotes,
    foodDislikes: p.foodDislikes,
    calorieTarget: p.calorieTarget,
  }));

  const context = {
    activeProfiles,
    weeklyBudget: settings?.weeklyBudget ?? 12000,
    existingMeals,
    pantryStaples: staples.map((s) => s.name),
    nutritionGoals: {
      calorieTarget: profiles.reduce((sum, p) => sum + (p.calorieTarget ?? 0), 0) || null,
      proteinPct: 25,
      carbsPct: 50,
      fatPct: 25,
    },
  };

  const result = await suggestMeals(context, settings);
  if (result?.error) {
    return res.status(502).json({ data: null, error: { message: result.message, code: result.code } });
  }
  res.json({ data: result, error: null });
}));

// POST /api/mealplans/:id/ai-suggest-slot
aiRouter.post('/mealplans/:id/ai-suggest-slot', asyncHandler(async (req, res) => {
  const mealPlanId = parseInt(req.params.id);
  const userId = req.user.userId;

  const slotSchema = z.object({
    dayOfWeek: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
    mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']),
  });

  const parsed = slotSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      data: null,
      error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' },
    });
  }

  const { dayOfWeek, mealType } = parsed.data;

  const [plan, settings, profiles, staples] = await Promise.all([
    prisma.mealPlan.findFirst({
      where: { id: mealPlanId, userId },
      include: { plannedMeals: { include: { recipe: true } }, dayConfigs: true },
    }),
    getUserSettings(userId),
    prisma.profile.findMany({ where: { userId } }),
    prisma.pantryStaple.findMany({ where: { userId } }),
  ]);

  if (!plan) {
    return res.status(404).json({ data: null, error: { message: 'Meal plan not found', code: 'NOT_FOUND' } });
  }

  const dayConfig = plan.dayConfigs.find((dc) => dc.dayOfWeek === dayOfWeek);
  const recipesAlreadyThisWeek = plan.plannedMeals
    .filter((m) => m.recipe)
    .map((m) => m.recipe.name);

  const slotContext = {
    dayOfWeek,
    mealType,
    householdMode: dayConfig?.householdMode ?? 'SOLO',
    activeProfiles: profiles.map((p) => ({
      name: p.name,
      age: p.age,
      dietaryNotes: p.dietaryNotes,
      foodDislikes: p.foodDislikes,
      calorieTarget: p.calorieTarget,
    })),
    remainingCaloriesForDay: null,
    weeklyBudgetRemaining: settings?.weeklyBudget ?? 12000,
    recipesAlreadyThisWeek,
    pantryStaples: staples.map((s) => s.name),
  };

  const result = await suggestMealForSlot(slotContext, settings);
  if (result?.error) {
    return res.status(502).json({ data: null, error: { message: result.message, code: result.code } });
  }
  res.json({ data: result, error: null });
}));

// POST /api/recipes/estimate-macros
aiRouter.post('/recipes/estimate-macros', asyncHandler(async (req, res) => {
  const schema = z.object({
    recipeName: z.string().min(1),
    ingredients: z.array(z.string().min(1)),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      data: null,
      error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' },
    });
  }

  const settings = await getUserSettings(req.user.userId);
  const result = await estimateMacros(parsed.data.recipeName, parsed.data.ingredients, settings);
  if (result?.error) {
    return res.status(502).json({ data: null, error: { message: result.message, code: result.code } });
  }
  res.json({ data: result, error: null });
}));

// POST /api/recipes/ai-suggest
aiRouter.post('/recipes/ai-suggest', asyncHandler(async (req, res) => {
  const schema = z.object({ prompt: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      data: null,
      error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' },
    });
  }

  const settings = await getUserSettings(req.user.userId);
  const result = await suggestRecipesByPrompt(parsed.data.prompt, settings);
  if (result?.error) {
    return res.status(502).json({ data: null, error: { message: result.message, code: result.code } });
  }
  res.json({ data: result, error: null });
}));

// GET /api/budget/insight
aiRouter.get('/budget/insight', asyncHandler(async (req, res) => {
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
