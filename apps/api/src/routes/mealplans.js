import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
router.use(requireAuth);

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER'];
const DAY_TO_NUM = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

function getWeekStart(dateStr, weekStartDay) {
  const d = new Date(dateStr + 'T00:00:00.000Z');
  const startNum = DAY_TO_NUM[weekStartDay] ?? 0;
  const currentDay = d.getUTCDay();
  const diff = (currentDay - startNum + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

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
      };
    }
  }
  return grid;
}

async function getFullPlan(id) {
  return prisma.mealPlan.findUnique({
    where: { id },
    include: {
      dayConfigs: true,
      plannedMeals: { include: { recipe: true } },
    },
  });
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
    include: { dayConfigs: true, plannedMeals: { include: { recipe: true } } },
  });

  let wasCreated = false;
  if (!plan) {
    wasCreated = true;
    const template = await prisma.custodyTemplate.findMany({ where: { userId, isAlternatingWeek: false } });

    plan = await prisma.$transaction(async (tx) => {
      const mp = await tx.mealPlan.create({ data: { userId, weekStartDate: weekStart } });

      const dayCfgs = DAYS.map((day) => {
        const tpl = template.find((t) => t.dayOfWeek === day);
        return { mealPlanId: mp.id, dayOfWeek: day, householdMode: tpl?.householdMode ?? 'SOLO', activeProfileIds: [] };
      });
      await tx.dayConfig.createMany({ data: dayCfgs });

      const meals = DAYS.flatMap((day) =>
        MEAL_TYPES.map((mealType) => ({ mealPlanId: mp.id, dayOfWeek: day, mealType }))
      );
      await tx.plannedMeal.createMany({ data: meals });

      return tx.mealPlan.findUnique({
        where: { id: mp.id },
        include: { dayConfigs: true, plannedMeals: { include: { recipe: true } } },
      });
    });
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
  const data = {};
  if (recipeId !== undefined) data.recipeId = recipeId;
  if (eaten !== undefined) data.eaten = eaten;
  if (eatenAt !== undefined) data.eatenAt = eatenAt ? new Date(eatenAt) : null;

  const meal = await prisma.plannedMeal.update({
    where: { mealPlanId_dayOfWeek_mealType: { mealPlanId, dayOfWeek, mealType } },
    data,
    include: { recipe: true },
  });
  res.json({ data: meal, error: null });
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
      include: { plannedMeals: { where: { recipeId: { not: null } } } },
    }),
  ]);

  if (!target || !source) {
    return res.status(404).json({ data: null, error: { message: 'Meal plan not found', code: 'NOT_FOUND' } });
  }

  await Promise.all(
    source.plannedMeals.map((meal) =>
      prisma.plannedMeal.update({
        where: { mealPlanId_dayOfWeek_mealType: { mealPlanId: targetId, dayOfWeek: meal.dayOfWeek, mealType: meal.mealType } },
        data: { recipeId: meal.recipeId },
      })
    )
  );

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

  await prisma.plannedMeal.updateMany({
    where: { mealPlanId },
    data: { recipeId: null, eaten: false, eatenAt: null },
  });

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
  ).min(1),
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

  await Promise.all(
    parsed.data.meals.map(({ dayOfWeek, mealType, recipeId, eaten }) => {
      const data = {};
      if (recipeId !== undefined) data.recipeId = recipeId;
      if (eaten !== undefined) data.eaten = eaten;
      return prisma.plannedMeal.update({
        where: { mealPlanId_dayOfWeek_mealType: { mealPlanId, dayOfWeek, mealType } },
        data,
      });
    })
  );

  const updated = await getFullPlan(mealPlanId);
  res.json({
    data: { id: updated.id, weekStartDate: updated.weekStartDate, grid: buildGrid(updated.dayConfigs, updated.plannedMeals) },
    error: null,
  });
}));

export default router;
