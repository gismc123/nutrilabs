import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
router.use(requireAuth);

function utcMonthBounds(year, month) {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  return { start, end };
}

function mondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 = Sun
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function monthStats(userId, start, end) {
  const [groceryLists, eatingOutLogs, eatenMeals] = await Promise.all([
    prisma.groceryList.findMany({
      where: { mealPlan: { userId }, loggedAt: { gte: start, lte: end }, loggedSpend: { not: null } },
      select: { loggedSpend: true },
    }),
    prisma.eatingOutLog.findMany({
      where: { userId, date: { gte: start, lte: end } },
      select: { amount: true },
    }),
    prisma.plannedMeal.findMany({
      where: { mealPlan: { userId }, eaten: true, eatenAt: { gte: start, lte: end } },
      select: { id: true },
    }),
  ]);

  return {
    grocerySpend: groceryLists.reduce((s, g) => s + (g.loggedSpend ?? 0), 0),
    eatingOutSpend: eatingOutLogs.reduce((s, e) => s + e.amount, 0),
    mealsCooked: eatenMeals.length,
    mealsEatenOut: eatingOutLogs.length,
  };
}

// GET /api/budget/summary
router.get('/summary', asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  const thisBounds = utcMonthBounds(y, m);
  const lastBounds = utcMonthBounds(y, m - 1);

  const [thisMonth, lastMonth, allGrocery, allEatingOut, allEaten, settings] = await Promise.all([
    monthStats(userId, thisBounds.start, thisBounds.end),
    monthStats(userId, lastBounds.start, lastBounds.end),
    prisma.groceryList.findMany({
      where: { mealPlan: { userId }, loggedSpend: { not: null } },
      select: { loggedSpend: true },
    }),
    prisma.eatingOutLog.findMany({ where: { userId }, select: { amount: true } }),
    prisma.plannedMeal.findMany({ where: { mealPlan: { userId }, eaten: true }, select: { id: true } }),
    prisma.appSettings.findUnique({ where: { userId } }),
  ]);

  const totalGrocerySpend = allGrocery.reduce((s, g) => s + (g.loggedSpend ?? 0), 0);
  const totalEatingOutSpend = allEatingOut.reduce((s, e) => s + e.amount, 0);
  const eatingOutReference = settings?.eatingOutReference ?? 1200;
  const totalSaved = Math.max(0, allEaten.length * eatingOutReference - totalGrocerySpend);

  res.json({
    data: {
      thisMonth,
      lastMonth,
      allTime: { totalGrocerySpend, totalEatingOutSpend, totalSaved },
      weeklyBudget: settings?.weeklyBudget ?? 12000,
      eatingOutReference,
    },
    error: null,
  });
}));

// GET /api/budget/week — current week stats based on user's weekStartDay setting
router.get('/week', asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const settings = await prisma.appSettings.findUnique({ where: { userId } });
  const weeklyBudget = settings?.weeklyBudget ?? 12000;

  const DAY_TO_NUM = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
  const weekStartDay = settings?.weekStartDay ?? 'SUN';
  const now = new Date();
  const startNum = DAY_TO_NUM[weekStartDay] ?? 0;
  const currentDay = now.getUTCDay();
  const diff = (currentDay - startNum + 7) % 7;
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - diff);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  const [groceryLists, eatingOutLogs, mealPlan] = await Promise.all([
    prisma.groceryList.findMany({
      where: { mealPlan: { userId }, loggedAt: { gte: weekStart, lte: weekEnd }, loggedSpend: { not: null } },
      select: { loggedSpend: true },
    }),
    prisma.eatingOutLog.findMany({
      where: { userId, date: { gte: weekStart, lte: weekEnd } },
      select: { amount: true },
    }),
    prisma.mealPlan.findFirst({
      where: { userId, weekStartDate: weekStart },
      include: { plannedMeals: { where: { eaten: true, recipeId: { not: null } } } },
    }),
  ]);

  res.json({
    data: {
      weekStartDate: weekStart.toISOString().slice(0, 10),
      weeklyBudget,
      grocerySpend: groceryLists.reduce((s, g) => s + (g.loggedSpend ?? 0), 0),
      eatingOutSpend: eatingOutLogs.reduce((s, e) => s + e.amount, 0),
      mealsCooked: mealPlan?.plannedMeals.length ?? 0,
      mealsEatenOut: eatingOutLogs.length,
    },
    error: null,
  });
}));

// GET /api/budget/weekly — last 12 full weeks, most recent first
router.get('/weekly', asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const thisWeekStart = mondayOfWeek(new Date());

  const weeks = Array.from({ length: 12 }, (_, i) => {
    const weekStart = new Date(thisWeekStart);
    weekStart.setUTCDate(weekStart.getUTCDate() - (i + 1) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);
    return { weekStart, weekEnd };
  });

  const weekData = await Promise.all(
    weeks.map(async ({ weekStart, weekEnd }) => {
      const [groceryLists, eatingOutLogs, eatenMeals] = await Promise.all([
        prisma.groceryList.findMany({
          where: { mealPlan: { userId }, loggedAt: { gte: weekStart, lte: weekEnd }, loggedSpend: { not: null } },
          select: { loggedSpend: true },
        }),
        prisma.eatingOutLog.findMany({
          where: { userId, date: { gte: weekStart, lte: weekEnd } },
          select: { amount: true },
        }),
        prisma.plannedMeal.findMany({
          where: { mealPlan: { userId }, eaten: true, eatenAt: { gte: weekStart, lte: weekEnd } },
          select: { id: true },
        }),
      ]);

      return {
        weekStartDate: weekStart.toISOString().slice(0, 10),
        grocerySpend: groceryLists.reduce((s, g) => s + (g.loggedSpend ?? 0), 0),
        eatingOutSpend: eatingOutLogs.reduce((s, e) => s + e.amount, 0),
        mealsCooked: eatenMeals.length,
        mealsEatenOut: eatingOutLogs.length,
      };
    })
  );

  res.json({ data: weekData, error: null });
}));

export default router;
