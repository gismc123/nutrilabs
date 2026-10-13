import prisma from './prisma.js';

export const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
export const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER'];
const DAY_TO_NUM = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

function toUtcDate(date) {
  if (typeof date === 'string') return new Date(date.slice(0, 10) + 'T00:00:00.000Z');
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

/** First day (UTC midnight) of the week containing `date`, for a given week start day. */
export function getWeekStart(date, weekStartDay) {
  const d = toUtcDate(date);
  const startNum = DAY_TO_NUM[weekStartDay] ?? 0;
  const diff = (d.getUTCDay() - startNum + 7) % 7;
  return addDays(d, -diff);
}

const PLAN_INCLUDE = { dayConfigs: true, plannedMeals: { include: { recipe: true } } };

/** Create an empty plan for a week: day configs from the custody template, empty B/L/D slots. */
export async function createPlanForWeek(tx, userId, weekStart) {
  const template = await tx.custodyTemplate.findMany({ where: { userId, isAlternatingWeek: false } });
  const mp = await tx.mealPlan.create({ data: { userId, weekStartDate: weekStart } });

  await tx.dayConfig.createMany({
    data: DAYS.map((day) => ({
      mealPlanId: mp.id,
      dayOfWeek: day,
      householdMode: template.find((t) => t.dayOfWeek === day)?.householdMode ?? 'SOLO',
      activeProfileIds: [],
    })),
  });
  await tx.plannedMeal.createMany({
    data: DAYS.flatMap((day) => MEAL_TYPES.map((mealType) => ({ mealPlanId: mp.id, dayOfWeek: day, mealType }))),
  });

  return tx.mealPlan.findUnique({ where: { id: mp.id }, include: PLAN_INCLUDE });
}

/**
 * Move plans whose weekStartDate doesn't fall on `weekStartDay` onto correctly
 * aligned weeks. Each planned meal goes to the week that contains its actual
 * calendar date. A meal whose target slot is already filled is a conflict: the
 * old plan is then kept so nothing is lost. Grocery lists with logged spend move
 * with the plan; unlogged lists are dropped (they regenerate from the plan).
 */
export async function realignMealPlans(userId, weekStartDay) {
  const startNum = DAY_TO_NUM[weekStartDay];

  return prisma.$transaction(async (tx) => {
    const plans = await tx.mealPlan.findMany({
      where: { userId },
      include: { plannedMeals: true, dayConfigs: true, groceryList: true },
      orderBy: { weekStartDate: 'asc' },
    });

    const aligned = new Map();
    const misaligned = [];
    for (const p of plans) {
      if (p.weekStartDate.getUTCDay() === startNum) aligned.set(isoDay(p.weekStartDate), p);
      else misaligned.push(p);
    }

    const summary = { plansRealigned: misaligned.length, mealsMoved: 0, plansRemoved: 0, plansKept: [], conflicts: [] };
    const created = new Set();

    async function targetFor(weekStart) {
      const key = isoDay(weekStart);
      if (!aligned.has(key)) {
        const plan = await createPlanForWeek(tx, userId, weekStart);
        aligned.set(key, { ...plan, groceryList: null });
        created.add(plan.id);
      }
      return aligned.get(key);
    }

    for (const source of misaligned) {
      const sourceStart = source.weekStartDate;
      let keepSource = false;

      for (const day of DAYS) {
        const meals = source.plannedMeals.filter((m) => m.dayOfWeek === day && (m.recipeId != null || m.eaten));
        if (!meals.length) continue;

        const date = addDays(sourceStart, (DAY_TO_NUM[day] - sourceStart.getUTCDay() + 7) % 7);
        const target = await targetFor(getWeekStart(date, weekStartDay));

        const cfg = source.dayConfigs.find((dc) => dc.dayOfWeek === day);
        if (cfg && created.has(target.id)) {
          await tx.dayConfig.update({
            where: { mealPlanId_dayOfWeek: { mealPlanId: target.id, dayOfWeek: day } },
            data: { householdMode: cfg.householdMode, activeProfileIds: cfg.activeProfileIds },
          });
        }

        for (const meal of meals) {
          const slot = target.plannedMeals.find((m) => m.dayOfWeek === day && m.mealType === meal.mealType);
          const data = { recipeId: meal.recipeId, eaten: meal.eaten, eatenAt: meal.eatenAt };
          if (slot && (slot.recipeId != null || slot.eaten)) {
            keepSource = true;
            summary.conflicts.push({ fromPlanId: source.id, toPlanId: target.id, dayOfWeek: day, mealType: meal.mealType });
            continue;
          }
          if (slot) {
            await tx.plannedMeal.update({ where: { id: slot.id }, data });
            Object.assign(slot, data);
          } else {
            const createdSlot = await tx.plannedMeal.create({
              data: { mealPlanId: target.id, dayOfWeek: day, mealType: meal.mealType, ...data },
            });
            target.plannedMeals.push(createdSlot);
          }
          summary.mealsMoved++;
        }
      }

      const list = source.groceryList;
      if (list && list.loggedSpend != null) {
        // Logged spend belongs to the week that holds most of the old week's days.
        const target = await targetFor(getWeekStart(addDays(sourceStart, 3), weekStartDay));
        if (target.groceryList) {
          keepSource = true;
        } else {
          target.groceryList = await tx.groceryList.update({ where: { id: list.id }, data: { mealPlanId: target.id } });
        }
      } else if (list) {
        await tx.groceryList.delete({ where: { id: list.id } });
      }

      if (keepSource) {
        summary.plansKept.push(source.id);
      } else {
        await tx.mealPlan.delete({ where: { id: source.id } });
        summary.plansRemoved++;
      }
    }

    return summary;
  }, { timeout: 30_000 });
}
