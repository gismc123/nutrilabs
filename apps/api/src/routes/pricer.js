import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { buildGroceryList } from '../lib/groceryEngine.js';
import { getWeekStart } from '../lib/weekPlans.js';
import { safeEqual } from '../lib/security.js';

// Read-only feed for the standalone pricer service: for each user with a
// grocery store configured, their store choices and the items on this week's
// and next week's grocery lists. Authenticated with the shared PRICER_TOKEN,
// not a user session.
const router = Router();

function requirePricerToken(req, res, next) {
  const expected = process.env.PRICER_TOKEN;
  if (!expected || expected.length < 32 || !safeEqual(req.headers['x-pricer-token'], expected)) {
    return res.status(401).json({ data: null, error: { message: 'Invalid pricer token', code: 'UNAUTHORIZED' } });
  }
  next();
}

router.get('/feed', requirePricerToken, asyncHandler(async (req, res) => {
  const users = await prisma.appSettings.findMany({
    where: {
      user: { isActive: true },
      OR: [{ krogerZip: { not: null } }, { krogerLocationId: { not: null } }, { meijerStoreId: { not: null } }],
    },
  });

  const profiles = [];
  for (const s of users) {
    const thisWeek = getWeekStart(new Date(), s.weekStartDay);
    const nextWeek = new Date(thisWeek.getTime() + 7 * 86_400_000);
    const [plans, staples] = await Promise.all([
      prisma.mealPlan.findMany({
        where: { userId: s.userId, weekStartDate: { in: [thisWeek, nextWeek] } },
        include: { plannedMeals: { include: { recipe: { include: { ingredients: true } } } } },
      }),
      prisma.pantryStaple.findMany({ where: { userId: s.userId } }),
    ]);

    const items = new Map();
    for (const plan of plans) {
      const { items: planItems } = buildGroceryList(plan, staples.map((p) => p.name));
      for (const i of planItems) {
        if (!items.has(i.normalizedName)) items.set(i.normalizedName, { name: i.name, normalizedName: i.normalizedName, category: i.category });
      }
    }

    profiles.push({
      userId: s.userId,
      stores: {
        kroger: s.krogerLocationId || s.krogerZip
          ? { id: s.krogerLocationId, name: s.krogerStoreName, zip: s.krogerZip, radius: s.krogerRadiusMiles }
          : null,
        meijer: s.meijerStoreId ? { id: s.meijerStoreId, name: s.meijerStoreName } : null,
      },
      items: [...items.values()],
    });
  }

  res.json({ data: { generatedAt: new Date().toISOString(), profiles }, error: null });
}));

export default router;
