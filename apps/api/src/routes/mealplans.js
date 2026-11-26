import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { recipesVisible } from '../lib/access.js';
import { DAYS, getWeekStart, createPlanForWeek, PLAN_INCLUDE } from '../lib/weekPlans.js';

const router = Router();
router.use(requireAuth);

function buildGrid(dayConfigs, plannedMeals) {
  const grid = {};
  for (const day of DAYS) {
    const cfg = dayConfigs.find((dc) => dc.dayOfWeek === day);
    grid[day] = {
      householdMode: cfg?.householdMode ?? 'SOLO',
      activeProfileIds: cfg?.activeProfileIds ?? [],
      dayConfigId: cfg?.id ?? null,
      meals: {},
    };
    for (const pm of plannedMeals.filter((m) => m.dayOfWeek === day)) {
      grid[day].meals[pm.mealType] = {
        id: pm.id,
        recipeId: pm.recipeId,
        eaten: pm.eaten,
        eatenAt: pm.eatenAt,
        recipe: pm.recipe ?? null,
        sides: (pm.sides ?? []).map(sideView),
      };
    }
  }
  return grid;
}

function sideView(sd) {
  return {
    id: sd.id,
    recipeId: sd.recipeId,
    name: sd.recipe?.name ?? sd.name,
    recipe: sd.recipe
      ? { id: sd.recipe.id, name: sd.recipe.name, imageUrl: sd.recipe.imageUrl, calories: sd.recipe.calories, costPerServing: sd.recipe.costPerServing }
      : null,
  };
}

async function getFullPlan(id) {
  return prisma.mealPlan.findUnique({ where: { id }, include: PLAN_INCLUDE });
}

// GET /api/mealplans
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const plans = await prisma.mealPlan.findMany({
    where: { userId },
    orderBy: { weekStartDate: 'desc' },
    select: {
      id: true,
      weekStartDate: true,
      _count: { select: { plannedMeals: { where: { recipeId: { not: null } } } } },
    },
  });
  const data = plans.map((p) => ({
    id: p.id,
    weekStartDate: p.weekStartDate,
    assignedMealCount: p._count.plannedMeals,
  }));
  res.json({ data, error: null });
}));

// GET /api/mealplans/week/:date  — must come before /:id
router.get('/week/:date', asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { date } = req.params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ data: null, error: { message: 'Date must be YYYY-MM-DD', code: 'VALIDATION_ERROR' } });
  }

  const settings = await prisma.appSettings.findUnique({ where: { userId } });
  const weekStartDay = settings?.weekStartDay ?? 'SUN';
  const weekStart = getWeekStart(date, weekStartDay);

  let plan = await prisma.mealPlan.findFirst({
    where: { userId, weekStartDate: weekStart },
    include: PLAN_INCLUDE,
  });

  let wasCreated = false;
  if (!plan) {
    wasCreated = true;
    plan = await prisma.$transaction((tx) => createPlanForWeek(tx, userId, weekStart));
  }

  res.json({
    data: {
      id: plan.id,
      weekStartDate: plan.weekStartDate,
      wasCreated,
      grid: buildGrid(plan.dayConfigs, plan.plannedMeals),
    },
    error: null,
  });
}));

// GET /api/mealplans/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const plan = await getFullPlan(id);
  if (!plan || plan.userId !== req.user.userId) {
    return res.status(404).json({ data: null, error: { message: 'Meal plan not found', code: 'NOT_FOUND' } });
  }
  res.json({
    data: {
      id: plan.id,
      weekStartDate: plan.weekStartDate,
      grid: buildGrid(plan.dayConfigs, plan.plannedMeals),
    },
    error: null,
  });
}));

const dayConfigSchema = z.object({
  dayOfWeek: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
  householdMode: z.enum(['SOLO', 'DAD_MODE']),
  activeProfileIds: z.array(z.number().int()).optional(),
});

// PUT /api/mealplans/:id/dayconfig
router.put('/:id/dayconfig', asyncHandler(async (req, res) => {
  const mealPlanId = parseInt(req.params.id);
  const plan = await prisma.mealPlan.findFirst({ where: { id: mealPlanId, userId: req.user.userId } });
  if (!plan) {
    return res.status(404).json({ data: null, error: { message: 'Meal plan not found', code: 'NOT_FOUND' } });
  }

  const parsed = dayConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      data: null,
      error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' },
    });
  }

  const { dayOfWeek, householdMode, activeProfileIds } = parsed.data;
  const updated = await prisma.dayConfig.update({
    where: { mealPlanId_dayOfWeek: { mealPlanId, dayOfWeek } },
    data: { householdMode, ...(activeProfileIds !== undefined && { activeProfileIds }) },
  });
  res.json({ data: updated, error: null });
}));

const plannedMealSchema = z.object({
  dayOfWeek: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']),
  recipeId: z.number().int().nullable().optional(),
  eaten: z.boolean().optional(),
  eatenAt: z.string().datetime().nullable().optional(),
});

// PUT /api/mealplans/:id/meals
router.put('/:id/meals', asyncHandler(async (req, res) => {
  const mealPlanId = parseInt(req.params.id);
  const plan = await prisma.mealPlan.findFirst({ where: { id: mealPlanId, userId: req.user.userId } });
  if (!plan) {
    return res.status(404).json({ data: null, error: { message: 'Meal plan not found', code: 'NOT_FOUND' } });
  }

  const parsed = plannedMealSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      data: null,
      error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' },
    });
  }

  const { dayOfWeek, mealType, recipeId, eaten, eatenAt } = parsed.data;
  if (!(await recipesVisible(req.user, [recipeId]))) {
    return res.status(404).json({ data: null, error: { message: 'Recipe not found', code: 'NOT_FOUND' } });
  }
  const data = {};
  if (recipeId !== undefined) data.recipeId = recipeId;
  if (eaten !== undefined) data.eaten = eaten;
  if (eatenAt !== undefined) data.eatenAt = eatenAt ? new Date(eatenAt) : null;

  const meal = await prisma.plannedMeal.upsert({
    where: { mealPlanId_dayOfWeek_mealType: { mealPlanId, dayOfWeek, mealType } },
    update: data,
    create: { mealPlanId, dayOfWeek, mealType, ...data },
  });
  // Removing the main dish clears the slot, sides included. Swapping it keeps them.
  if (recipeId === null) await prisma.plannedMealSide.deleteMany({ where: { plannedMealId: meal.id } });
  const full = await prisma.plannedMeal.findUnique({ where: { id: meal.id }, include: PLAN_INCLUDE.plannedMeals.include });
  res.json({ data: { ...full, sides: full.sides.map(sideView) }, error: null });
}));

// POST /api/mealplans/:id/copy-from/:sourceId
router.post('/:id/copy-from/:sourceId', asyncHandler(async (req, res) => {
  const targetId = parseInt(req.params.id);
  const sourceId = parseInt(req.params.sourceId);
  const userId = req.user.userId;

  const [target, source] = await Promise.all([
    prisma.mealPlan.findFirst({ where: { id: targetId, userId } }),
    prisma.mealPlan.findFirst({
      where: { id: sourceId, userId },
      include: { plannedMeals: { where: { recipeId: { not: null } }, include: { sides: true } } },
    }),
  ]);

  if (!target || !source) {
    return res.status(404).json({ data: null, error: { message: 'Meal plan not found', code: 'NOT_FOUND' } });
  }

  await prisma.$transaction(async (tx) => {
    for (const meal of source.plannedMeals) {
      const slot = await tx.plannedMeal.upsert({
        where: { mealPlanId_dayOfWeek_mealType: { mealPlanId: targetId, dayOfWeek: meal.dayOfWeek, mealType: meal.mealType } },
        update: { recipeId: meal.recipeId },
        create: { mealPlanId: targetId, dayOfWeek: meal.dayOfWeek, mealType: meal.mealType, recipeId: meal.recipeId },
      });
      // The copied meal brings its sides and replaces any the slot had.
      await tx.plannedMealSide.deleteMany({ where: { plannedMealId: slot.id } });
      if (meal.sides.length) {
        await tx.plannedMealSide.createMany({
          data: meal.sides.map((sd) => ({ plannedMealId: slot.id, recipeId: sd.recipeId, name: sd.name, position: sd.position })),
        });
      }
    }
  });

  const updated = await getFullPlan(targetId);
  res.json({
    data: { id: updated.id, weekStartDate: updated.weekStartDate, grid: buildGrid(updated.dayConfigs, updated.plannedMeals) },
    error: null,
  });
}));

// DELETE /api/mealplans/:id/meals — clear all recipe assignments
router.delete('/:id/meals', asyncHandler(async (req, res) => {
  const mealPlanId = parseInt(req.params.id);
  const plan = await prisma.mealPlan.findFirst({ where: { id: mealPlanId, userId: req.user.userId } });
  if (!plan) {
    return res.status(404).json({ data: null, error: { message: 'Meal plan not found', code: 'NOT_FOUND' } });
  }

  await prisma.$transaction([
    prisma.plannedMealSide.deleteMany({ where: { plannedMeal: { mealPlanId } } }),
    prisma.plannedMeal.updateMany({
      where: { mealPlanId },
      data: { recipeId: null, eaten: false, eatenAt: null },
    }),
  ]);

  res.json({ data: { cleared: true }, error: null });
}));

const batchMealSchema = z.object({
  meals: z.array(
    z.object({
      dayOfWeek: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
      mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']),
      recipeId: z.number().int().nullable().optional(),
      eaten: z.boolean().optional(),
    })
  ).min(1).max(60),
});

// POST /api/mealplans/:id/meals/batch — batch assign multiple meals
router.post('/:id/meals/batch', asyncHandler(async (req, res) => {
  const mealPlanId = parseInt(req.params.id);
  const plan = await prisma.mealPlan.findFirst({ where: { id: mealPlanId, userId: req.user.userId } });
  if (!plan) {
    return res.status(404).json({ data: null, error: { message: 'Meal plan not found', code: 'NOT_FOUND' } });
  }

  const parsed = batchMealSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      data: null,
      error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' },
    });
  }

  if (!(await recipesVisible(req.user, parsed.data.meals.map((m) => m.recipeId)))) {
    return res.status(404).json({ data: null, error: { message: 'Recipe not found', code: 'NOT_FOUND' } });
  }

  await Promise.all(
    parsed.data.meals.map(async ({ dayOfWeek, mealType, recipeId, eaten }) => {
      const data = {};
      if (recipeId !== undefined) data.recipeId = recipeId;
      if (eaten !== undefined) data.eaten = eaten;
      const meal = await prisma.plannedMeal.upsert({
        where: { mealPlanId_dayOfWeek_mealType: { mealPlanId, dayOfWeek, mealType } },
        update: data,
        create: { mealPlanId, dayOfWeek, mealType, ...data },
      });
      if (recipeId === null) await prisma.plannedMealSide.deleteMany({ where: { plannedMealId: meal.id } });
    })
  );

  const updated = await getFullPlan(mealPlanId);
  res.json({
    data: { id: updated.id, weekStartDate: updated.weekStartDate, grid: buildGrid(updated.dayConfigs, updated.plannedMeals) },
    error: null,
  });
}));

// ── Sides ─────────────────────────────────────────────────────────────────────

const MAX_SIDES = 6;
const sideSchema = z.object({
  dayOfWeek: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']),
  recipeId: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(80).optional(),
}).refine((v) => Boolean(v.recipeId) !== Boolean(v.name), { message: 'Give a recipe or a name for the side, not both' });

// POST /api/mealplans/:id/sides: add a side to a planned meal
router.post('/:id/sides', asyncHandler(async (req, res) => {
  const mealPlanId = parseInt(req.params.id);
  const plan = await prisma.mealPlan.findFirst({ where: { id: mealPlanId, userId: req.user.userId } });
  if (!plan) {
    return res.status(404).json({ data: null, error: { message: 'Meal plan not found', code: 'NOT_FOUND' } });
  }
  const parsed = sideSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' } });
  }
  const { dayOfWeek, mealType, recipeId, name } = parsed.data;
  if (recipeId && !(await recipesVisible(req.user, [recipeId]))) {
    return res.status(404).json({ data: null, error: { message: 'Recipe not found', code: 'NOT_FOUND' } });
  }
  const meal = await prisma.plannedMeal.findUnique({
    where: { mealPlanId_dayOfWeek_mealType: { mealPlanId, dayOfWeek, mealType } },
    include: { sides: true },
  });
  if (!meal?.recipeId) {
    return res.status(409).json({ data: null, error: { message: 'Pick the main dish first, then add sides', code: 'NO_MAIN' } });
  }
  if (meal.sides.length >= MAX_SIDES) {
    return res.status(409).json({ data: null, error: { message: `A meal can have up to ${MAX_SIDES} sides`, code: 'TOO_MANY_SIDES' } });
  }
  if (recipeId && (recipeId === meal.recipeId || meal.sides.some((sd) => sd.recipeId === recipeId))) {
    return res.status(409).json({ data: null, error: { message: 'That recipe is already on this meal', code: 'DUPLICATE_SIDE' } });
  }
  const position = meal.sides.reduce((m, sd) => Math.max(m, sd.position), -1) + 1;
  const side = await prisma.plannedMealSide.create({
    data: { plannedMealId: meal.id, recipeId: recipeId ?? null, name: recipeId ? null : name, position },
    include: { recipe: true },
  });
  res.status(201).json({ data: sideView(side), error: null });
}));

// DELETE /api/mealplans/:id/sides/:sideId
router.delete('/:id/sides/:sideId', asyncHandler(async (req, res) => {
  const mealPlanId = parseInt(req.params.id);
  const sideId = parseInt(req.params.sideId);
  const removed = Number.isInteger(sideId) && await prisma.plannedMealSide.deleteMany({
    where: { id: sideId, plannedMeal: { mealPlanId, mealPlan: { userId: req.user.userId } } },
  });
  if (!removed?.count) {
    return res.status(404).json({ data: null, error: { message: 'Side not found', code: 'NOT_FOUND' } });
  }
  res.json({ data: { deleted: true }, error: null });
}));

export default router;
