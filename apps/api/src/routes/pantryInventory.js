import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { lookupBarcode, searchProduct } from '../services/openFoodFacts.js';

const router = Router();
router.use(requireAuth);

// ── GET /api/pantry-inventory ─────────────────────────────────────────────────

router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { search } = req.query;
  const where = { userId };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { brand: { contains: search, mode: 'insensitive' } },
    ];
  }
  const items = await prisma.pantryInventoryItem.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ data: items, error: null });
}));

// ── POST /api/pantry-inventory/scan ──────────────────────────────────────────

router.post('/scan', asyncHandler(async (req, res) => {
  const { barcode } = req.body;
  if (!barcode) {
    return res.status(400).json({ data: null, error: { message: 'barcode is required', code: 'VALIDATION_ERROR' } });
  }

  const product = await lookupBarcode(barcode);
  if (!product) {
    return res.status(404).json({ data: null, error: { message: 'Product not found. Try searching by name.', code: 'PRODUCT_NOT_FOUND' } });
  }

  const userId = req.user.userId;
  const existing = await prisma.pantryInventoryItem.findFirst({
    where: { userId, barcode },
  });

  if (existing) {
    const updated = await prisma.pantryInventoryItem.update({
      where: { id: existing.id },
      data: { quantity: { increment: 1 } },
    });
    return res.json({ data: { ...updated, alreadyExisted: true }, error: null });
  }

  const item = await prisma.pantryInventoryItem.create({
    data: {
      userId,
      source: 'SCANNED',
      quantity: 1,
      ...toItemData(product),
    },
  });
  res.status(201).json({ data: item, error: null });
}));

// ── POST /api/pantry-inventory/search ─────────────────────────────────────────

router.post('/search', asyncHandler(async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ data: null, error: { message: 'query is required', code: 'VALIDATION_ERROR' } });
  }
  const results = await searchProduct(query);
  res.json({ data: results, error: null });
}));

// ── POST /api/pantry-inventory (manual add) ───────────────────────────────────

const addItemSchema = z.object({
  name: z.string().min(1),
  brand: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  servingSize: z.string().optional().nullable(),
  servingSizeG: z.number().optional().nullable(),
  calories: z.number().int().optional().nullable(),
  proteinG: z.number().optional().nullable(),
  carbsG: z.number().optional().nullable(),
  fatG: z.number().optional().nullable(),
  ingredients: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  quantity: z.number().default(1),
  unit: z.string().default('serving'),
  openFoodFactsId: z.string().optional().nullable(),
});

router.post('/', asyncHandler(async (req, res) => {
  const parsed = addItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' } });
  }
  const item = await prisma.pantryInventoryItem.create({
    data: { userId: req.user.userId, source: 'MANUAL', ...parsed.data },
  });
  res.status(201).json({ data: item, error: null });
}));

// ── PUT /api/pantry-inventory/:id ─────────────────────────────────────────────

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const existing = await prisma.pantryInventoryItem.findFirst({ where: { id, userId: req.user.userId } });
  if (!existing) {
    return res.status(404).json({ data: null, error: { message: 'Item not found', code: 'NOT_FOUND' } });
  }
  const allowed = ['name', 'brand', 'quantity', 'unit', 'servingSize', 'servingSizeG', 'calories', 'proteinG', 'carbsG', 'fatG'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  const item = await prisma.pantryInventoryItem.update({ where: { id }, data: updates });
  res.json({ data: item, error: null });
}));

// ── DELETE /api/pantry-inventory/:id ─────────────────────────────────────────

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const existing = await prisma.pantryInventoryItem.findFirst({ where: { id, userId: req.user.userId } });
  if (!existing) {
    return res.status(404).json({ data: null, error: { message: 'Item not found', code: 'NOT_FOUND' } });
  }
  await prisma.pantryInventoryItem.delete({ where: { id } });
  res.json({ data: { deleted: true }, error: null });
}));

// ── POST /api/pantry-inventory/:id/add-to-plan ───────────────────────────────

const addToPlanSchema = z.object({
  mealPlanId: z.number().int(),
  dayOfWeek: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']).default('SNACK'),
});

router.post('/:id/add-to-plan', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const item = await prisma.pantryInventoryItem.findFirst({ where: { id, userId: req.user.userId } });
  if (!item) {
    return res.status(404).json({ data: null, error: { message: 'Item not found', code: 'NOT_FOUND' } });
  }

  const parsed = addToPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' } });
  }
  const { mealPlanId, dayOfWeek, mealType } = parsed.data;

  const mealPlan = await prisma.mealPlan.findFirst({ where: { id: mealPlanId, userId: req.user.userId } });
  if (!mealPlan) {
    return res.status(404).json({ data: null, error: { message: 'Meal plan not found', code: 'NOT_FOUND' } });
  }

  let recipe = await prisma.recipe.findFirst({
    where: { name: { equals: item.name, mode: 'insensitive' } },
  });

  if (!recipe) {
    recipe = await prisma.recipe.create({
      data: {
        name: item.name,
        description: item.brand || null,
        mealType: 'SNACK',
        source: 'USER',
        isKidFriendly: true,
        servings: 1,
        calories: item.calories ? Math.round(Number(item.calories)) : null,
        proteinG: item.proteinG ? Math.round(Number(item.proteinG)) : null,
        carbsG: item.carbsG ? Math.round(Number(item.carbsG)) : null,
        fatG: item.fatG ? Math.round(Number(item.fatG)) : null,
      },
    });
  }

  const plannedMeal = await prisma.plannedMeal.upsert({
    where: { mealPlanId_dayOfWeek_mealType: { mealPlanId, dayOfWeek, mealType } },
    update: { recipeId: recipe.id },
    create: { mealPlanId, dayOfWeek, mealType, recipeId: recipe.id },
    include: { recipe: true },
  });

  res.json({ data: plannedMeal, error: null });
}));

function toItemData(product) {
  return {
    name: product.name || 'Unknown Product',
    brand: product.brand || null,
    barcode: product.barcode || null,
    openFoodFactsId: product.openFoodFactsId || null,
    imageUrl: product.imageUrl || null,
    servingSize: product.servingSize || null,
    servingSizeG: product.servingSizeG || null,
    ingredients: product.ingredients || null,
    calories: product.calories != null ? Math.round(product.calories) : null,
    proteinG: product.proteinG || null,
    carbsG: product.carbsG || null,
    fatG: product.fatG || null,
    quantity: 1,
    unit: 'serving',
  };
}

export default router;
