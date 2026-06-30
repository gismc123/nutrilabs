import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  searchRecipes,
  getRecipeDetail,
  mapToNutriLabsRecipe,
  getLastQuota,
} from '../services/spoonacular.js';

const router = Router();
router.use(requireAuth);

async function getApiKey(userId) {
  const settings = await prisma.appSettings.findUnique({ where: { userId } });
  return settings?.spoonacularApiKey ?? null;
}

// GET /api/recipes/search/external
router.get('/search/external', asyncHandler(async (req, res) => {
  const apiKey = await getApiKey(req.user.userId);
  const { query, type, diet, maxReadyTime, maxCost } = req.query;

  const result = await searchRecipes(
    {
      query,
      type,
      diet,
      maxReadyTime: maxReadyTime ? parseInt(maxReadyTime) : undefined,
      maxPricePerServing: maxCost ? parseInt(maxCost) : undefined,
    },
    apiKey
  );

  if (result?.error) {
    return res.status(result.code === 'SPOONACULAR_NOT_CONFIGURED' ? 400 : 429).json({
      data: null,
      error: { message: result.code, code: result.code },
    });
  }

  res.json({ data: { results: result.results, quota: result.quota }, error: null });
}));

// GET /api/recipes/search/external/:spoonacularId
router.get('/search/external/:spoonacularId', asyncHandler(async (req, res) => {
  const spoonacularId = parseInt(req.params.spoonacularId);
  const apiKey = await getApiKey(req.user.userId);

  const detail = await getRecipeDetail(spoonacularId, apiKey);
  if (detail?.error) {
    return res.status(detail.code === 'SPOONACULAR_NOT_CONFIGURED' ? 400 : 429).json({
      data: null,
      error: { message: detail.code, code: detail.code },
    });
  }

  const mapped = mapToNutriLabsRecipe(detail);
  res.json({ data: mapped, error: null });
}));

// POST /api/recipes/import/:spoonacularId
router.post('/import/:spoonacularId', asyncHandler(async (req, res) => {
  const spoonacularId = parseInt(req.params.spoonacularId);

  const existing = await prisma.recipe.findUnique({ where: { spoonacularId } });
  if (existing) {
    return res.json({ data: { id: existing.id, alreadyImported: true }, error: null });
  }

  const apiKey = await getApiKey(req.user.userId);
  const detail = await getRecipeDetail(spoonacularId, apiKey);
  if (detail?.error) {
    return res.status(detail.code === 'SPOONACULAR_NOT_CONFIGURED' ? 400 : 429).json({
      data: null,
      error: { message: detail.code, code: detail.code },
    });
  }

  const mapped = mapToNutriLabsRecipe(detail);
  const { ingredients, ...recipeData } = mapped;

  const recipe = await prisma.$transaction(async (tx) => {
    return tx.recipe.create({
      data: {
        ...recipeData,
        source: 'SPOONACULAR',
        ingredients: { create: ingredients },
      },
      include: { ingredients: true },
    });
  });

  res.status(201).json({ data: { id: recipe.id, alreadyImported: false }, error: null });
}));

// GET /api/recipes/spoonacular-quota
router.get('/spoonacular-quota', asyncHandler(async (req, res) => {
  res.json({ data: getLastQuota(), error: null });
}));

export default router;
