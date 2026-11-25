// NutriLabs grocery list items for Deals: the same items the Shop page builds for
// this week's and next week's meal plans, minus pantry staples. Read straight from
// the NutriLabs tables, read-only.
import { prisma } from '../db.js';
import { buildGroceryList } from '../../lib/groceryEngine.js';
import { getWeekStart } from '../../lib/weekPlans.js';

export async function groceryItemsForUser(userId) {
  const settings = await prisma.appSettings.findUnique({ where: { userId }, select: { weekStartDay: true } });
  const thisWeek = getWeekStart(new Date(), settings?.weekStartDay ?? 'SUN');
  const nextWeek = new Date(thisWeek.getTime() + 7 * 86_400_000);
  const [plans, staples] = await Promise.all([
    prisma.mealPlan.findMany({
      where: { userId, weekStartDate: { in: [thisWeek, nextWeek] } },
      include: { plannedMeals: { include: { recipe: { include: { ingredients: true } } } } },
    }),
    prisma.pantryStaple.findMany({ where: { userId } }),
  ]);
  const items = new Map();
  for (const plan of plans) {
    const { items: planItems } = buildGroceryList(plan, staples.map((p) => p.name));
    for (const i of planItems) {
      if (!items.has(i.normalizedName)) items.set(i.normalizedName, { name: i.name, category: i.category });
    }
  }
  return [...items.values()];
}

// Every active user with a Kroger store: their list items, for the nightly price run.
export async function groceryItemsForAllUsers() {
  const users = await prisma.appSettings.findMany({
    where: { krogerLocationId: { not: null }, user: { isActive: true } },
    select: { userId: true },
  });
  const all = [];
  for (const u of users) all.push(...(await groceryItemsForUser(u.userId)));
  return all;
}
