import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { searchFood, getFoodDetail, extractMacrosPer100g } from '../services/usda.js';
import { calculateRecipe, findCandidates, chooseMatch, setUnitGrams, resetMatch } from '../services/macroCalculator.js';
import { usdaKey } from '../lib/apiKeys.js';
import { limits } from '../lib/security.js';

const router = Router();
router.use(requireAuth, limits.external);

async function getApiKey(userId) {
  const settings = await prisma.appSettings.findUnique({ where: { userId } });
  return usdaKey(settings).key;
}

function validationError(res, parsed) {
  return res.status(400).json({ data: null, error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' } });
}

function upstreamError(res, result) {
  return res.status(result.code === 'NOT_FOUND' ? 404 : 502).json({ data: null, error: { message: result.message, code: result.code } });
}

// GET /api/nutrition/ingredient?name=...
router.get('/ingredient', asyncHandler(async (req, res) => {
  const { name } = req.query;
  if (typeof name !== 'string' || !name.trim()) {
    return res.json({ data: [], error: null });
  }
  const apiKey = await getApiKey(req.user.userId);
  const results = await searchFood(name, apiKey);
  res.json({ data: results, error: null });
}));

// GET /api/nutrition/fdcid/:fdcId
router.get('/fdcid/:fdcId', asyncHandler(async (req, res) => {
  const fdcId = parseInt(req.params.fdcId);
  if (!(fdcId > 0)) return res.status(400).json({ data: null, error: { message: 'Invalid fdcId', code: 'VALIDATION_ERROR' } });
  const apiKey = await getApiKey(req.user.userId);
  const detail = await getFoodDetail(fdcId, apiKey);
  const macros = extractMacrosPer100g(detail);
  res.json({ data: macros, error: null });
}));

const calculateSchema = z.object({
  servings: z.number().int().min(1).max(100),
  ingredients: z.array(z.object({
    name: z.string().min(1).max(200),
    quantity: z.number().positive().max(100000).nullable().optional(),
    unit: z.string().max(40).nullable().optional(),
    isOptional: z.boolean().optional(),
  })).max(60),
});

// POST /api/nutrition/calculate  { servings, ingredients } — quantities are for the whole recipe
router.post('/calculate', asyncHandler(async (req, res) => {
  const parsed = calculateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const apiKey = await getApiKey(req.user.userId);
  const ingredients = parsed.data.ingredients.map((i) => ({
    name: i.name, quantity: i.quantity ?? null, unit: i.unit || null, isOptional: !!i.isOptional,
  }));
  const result = await calculateRecipe({ ingredients, servings: parsed.data.servings }, apiKey, req.user.userId);
  res.json({ data: result, error: null });
}));

// GET /api/nutrition/candidates?name=&q= — USDA foods to pick from for an ingredient
router.get('/candidates', asyncHandler(async (req, res) => {
  const { name, q } = req.query;
  if (typeof name !== 'string' || !name || name.length > 200 || (q != null && (typeof q !== 'string' || q.length > 200))) return res.status(400).json({ data: null, error: { message: 'name is required', code: 'VALIDATION_ERROR' } });
  const apiKey = await getApiKey(req.user.userId);
  const result = await findCandidates(name, q || null, apiKey, req.user.userId);
  if (result.error) return upstreamError(res, result);
  res.json({ data: result, error: null });
}));

const matchSchema = z.object({ name: z.string().min(1).max(200), fdcId: z.number().int().positive().nullable() });

// PUT /api/nutrition/matches  { name, fdcId } — fdcId null means "don't count this ingredient"
router.put('/matches', asyncHandler(async (req, res) => {
  const parsed = matchSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const apiKey = await getApiKey(req.user.userId);
  const result = await chooseMatch(parsed.data.name, parsed.data.fdcId, apiKey, req.user.userId);
  if (result.error) return upstreamError(res, result);
  res.json({ data: result, error: null });
}));

const gramsSchema = z.object({
  name: z.string().min(1).max(200),
  unit: z.string().max(40).nullable().optional(),
  grams: z.number().positive().max(10000),
});

// PUT /api/nutrition/matches/grams  { name, unit, grams } — "1 bunch of parsley = 30 g"
router.put('/matches/grams', asyncHandler(async (req, res) => {
  const parsed = gramsSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed);
  const result = await setUnitGrams(parsed.data.name, parsed.data.unit, parsed.data.grams, req.user.userId);
  if (result.error) return upstreamError(res, result);
  res.json({ data: result, error: null });
}));

// DELETE /api/nutrition/matches?name= — back to automatic matching
router.delete('/matches', asyncHandler(async (req, res) => {
  if (typeof req.query.name !== 'string' || !req.query.name || req.query.name.length > 200) return res.status(400).json({ data: null, error: { message: 'name is required', code: 'VALIDATION_ERROR' } });
  await resetMatch(req.query.name, req.user.userId);
  res.json({ data: { reset: true }, error: null });
}));

export default router;
