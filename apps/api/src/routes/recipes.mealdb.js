import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { visibleRecipes } from '../lib/access.js';
import { limits, safeHttpUrl } from '../lib/security.js';
import { getFilters, searchMeals, getMeal, toSummary, mapToNutriLabsRecipe } from '../services/themealdb.js';

const router = Router();
router.use(requireAuth, limits.external);

function sendError(res, result) {
  return res.status(502).json({ data: null, error: { message: result.message ?? result.code, code: result.code } });
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** mealDbId → recipe id, for the given TheMealDB ids already in this user's library. */
async function libraryIds(user, mealDbIds) {
  if (!mealDbIds.length) return new Map();
  const rows = await prisma.recipe.findMany({
    where: { mealDbId: { in: mealDbIds }, ...visibleRecipes(user) },
    select: { id: true, mealDbId: true },
  });
  return new Map(rows.map((r) => [r.mealDbId, r.id]));
}

// GET /api/recipes/mealdb/filters
router.get('/filters', asyncHandler(async (req, res) => {
  const filters = await getFilters();
  if (filters.error) return sendError(res, filters);
  res.json({ data: filters, error: null });
}));

// GET /api/recipes/mealdb/search?query=&category=&country=
router.get('/search', asyncHandler(async (req, res) => {
  const text = (v) => (typeof v === 'string' ? v.slice(0, 100) : undefined);
  const result = await searchMeals({ query: text(req.query.query), category: text(req.query.category), country: text(req.query.country) });
  if (result.error) return sendError(res, result);

  const inLibrary = await libraryIds(req.user, result.results.map((r) => r.id));
  const results = result.results.map((r) => ({ ...r, libraryRecipeId: inLibrary.get(r.id) ?? null }));
  res.json({ data: { results }, error: null });
}));

// GET /api/recipes/mealdb/:mealDbId — preview of what an import would create
router.get('/:mealDbId', asyncHandler(async (req, res) => {
  const mealDbId = parseId(req.params.mealDbId);
  if (!mealDbId) return res.status(400).json({ data: null, error: { message: 'Invalid TheMealDB id', code: 'VALIDATION_ERROR' } });

  const meal = await getMeal(mealDbId);
  if (meal?.error) return sendError(res, meal);
  if (!meal) return res.status(404).json({ data: null, error: { message: 'Recipe not found on TheMealDB', code: 'NOT_FOUND' } });

  const inLibrary = await libraryIds(req.user, [mealDbId]);
  res.json({
    data: {
      ...toSummary(meal),
      image: safeHttpUrl(meal.strMealThumb),
      youtubeUrl: safeHttpUrl(meal.strYoutube),
      sourceUrl: safeHttpUrl(meal.strSource),
      recipe: mapToNutriLabsRecipe(meal),
      libraryRecipeId: inLibrary.get(mealDbId) ?? null,
    },
    error: null,
  });
}));

const importSchema = z.object({
  servings: z.number().int().min(1).max(50).optional(),
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']).optional(),
  isKidFriendly: z.boolean().optional(),
});

// POST /api/recipes/mealdb/:mealDbId/import  { servings?, mealType?, isKidFriendly? }
router.post('/:mealDbId/import', asyncHandler(async (req, res) => {
  const mealDbId = parseId(req.params.mealDbId);
  if (!mealDbId) return res.status(400).json({ data: null, error: { message: 'Invalid TheMealDB id', code: 'VALIDATION_ERROR' } });
  const parsed = importSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' } });
  }

  const existing = await prisma.recipe.findFirst({ where: { mealDbId, ...visibleRecipes(req.user) } });
  if (existing) return res.json({ data: { id: existing.id, alreadyImported: true }, error: null });

  const meal = await getMeal(mealDbId);
  if (meal?.error) return sendError(res, meal);
  if (!meal) return res.status(404).json({ data: null, error: { message: 'Recipe not found on TheMealDB', code: 'NOT_FOUND' } });

  const { ingredients, ...recipeData } = mapToNutriLabsRecipe(meal);
  try {
    const recipe = await prisma.recipe.create({
      data: {
        ...recipeData,
        ...parsed.data,
        userId: req.user.userId,
        ingredients: { create: ingredients.map(({ original, ...ing }) => ing) },
      },
    });
    res.status(201).json({ data: { id: recipe.id, alreadyImported: false }, error: null });
  } catch (err) {
    // A double-click can race two imports; the unique mealDbId keeps one.
    if (err.code !== 'P2002') throw err;
    const winner = await prisma.recipe.findFirst({ where: { mealDbId, userId: req.user.userId } });
    res.json({ data: { id: winner.id, alreadyImported: true }, error: null });
  }
}));

export default router;
