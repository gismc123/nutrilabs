import prisma from './prisma.js';
import { visibleRecipes } from './access.js';
import { settingsForUser } from './instanceSettings.js';

const PROFILE_FIELDS = (p) => ({
  name: p.name,
  age: p.age,
  dietaryNotes: p.dietaryNotes,
  foodDislikes: p.foodDislikes,
  calorieTarget: p.calorieTarget,
});

/**
 * Everything the AI planner should know about a household, for one meal plan.
 * Returns { settings, plan, ctx, eatersFor(day) } or null when the plan isn't the user's.
 */
export async function loadPlanContext(user, mealPlanId) {
  const userId = user.userId;
  const [plan, settings, profiles, staples, library] = await Promise.all([
    prisma.mealPlan.findFirst({
      where: { id: mealPlanId, userId },
      include: { plannedMeals: { include: { recipe: true } }, dayConfigs: true },
    }),
    settingsForUser(userId),
    prisma.profile.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
    prisma.pantryStaple.findMany({ where: { userId } }),
    // The user's own and imported recipes say most about their taste; newest first.
    prisma.recipe.findMany({
      where: visibleRecipes(user),
      select: { name: true, userId: true, source: true },
      orderBy: { updatedAt: 'desc' },
      take: 60,
    }),
  ]);
  if (!plan) return null;

  // Only recipes the user added themselves (typed or imported) say anything about
  // their taste — the shared starter recipes and AI output don't.
  const likedRecipes = [...new Set(library.filter((r) => r.userId === userId && r.source !== 'AI').map((r) => r.name))].slice(0, 25);
  const weekMeals = [...new Set(plan.plannedMeals.filter((m) => m.recipe).map((m) => m.recipe.name))];

  const budget = settings?.weeklyBudget ?? 12000;
  // Rough per-serving target: the weekly budget spread over 21 meals for the
  // average number of people eating.
  const avgEaters = Math.max(1, plan.dayConfigs.length
    ? plan.dayConfigs.reduce((s, dc) => s + eatersForConfig(dc, profiles).length, 0) / plan.dayConfigs.length
    : 1);
  const costTarget = budget > 0 ? budget / 100 / 21 / avgEaters : null;

  return {
    settings,
    plan,
    ctx: {
      foodPreferences: settings?.foodPreferences?.trim() || null,
      likedRecipes,
      weekMeals,
      pantryStaples: staples.map((s) => s.name),
      costTarget,
    },
    eatersFor: (dayOfWeek) => {
      const eaters = eatersForConfig(plan.dayConfigs.find((dc) => dc.dayOfWeek === dayOfWeek), profiles).map(PROFILE_FIELDS);
      return eaters.length ? eaters : [{ name: 'Adult' }];
    },
  };
}

/** Who eats on a day: explicitly picked profiles, else the planner alone (SOLO) or everyone (DAD_MODE). */
function eatersForConfig(dayConfig, profiles) {
  if (!profiles.length) return [];
  const picked = dayConfig?.activeProfileIds?.length
    ? profiles.filter((p) => dayConfig.activeProfileIds.includes(p.id))
    : [];
  if (picked.length) return picked;
  if (dayConfig?.householdMode === 'DAD_MODE') return profiles;
  return [profiles.find((p) => p.isPlanner) ?? profiles[0]];
}
