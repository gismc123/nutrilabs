import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { searchFood, getFoodDetail, extractMacrosPer100g } from '../services/usda.js';

const router = Router();
router.use(requireAuth);

async function getApiKey(userId) {
  const settings = await prisma.appSettings.findUnique({ where: { userId } });
  return settings?.usdaApiKey ?? null;
}

// GET /api/nutrition/ingredient?name=...
router.get('/ingredient', asyncHandler(async (req, res) => {
  const { name } = req.query;
  if (!name) {
    return res.json({ data: [], error: null });
  }
  const apiKey = await getApiKey(req.user.userId);
  const results = await searchFood(name, apiKey);
  res.json({ data: results, error: null });
}));

// GET /api/nutrition/fdcid/:fdcId
router.get('/fdcid/:fdcId', asyncHandler(async (req, res) => {
  const { fdcId } = req.params;
  const apiKey = await getApiKey(req.user.userId);
  const detail = await getFoodDetail(fdcId, apiKey);
  const macros = extractMacrosPer100g(detail);
  res.json({ data: macros, error: null });
}));

export default router;
