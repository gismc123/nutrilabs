import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getPricesForItems } from '../services/kroger.js';
import { buildGroceryList } from '../lib/groceryEngine.js';
import { lookupPrice } from '../lib/priceSeed.js';

const router = Router();
router.use(requireAuth);

async function loadFullMealPlan(mealPlanId, userId) {
  return prisma.mealPlan.findFirst({
    where: { id: mealPlanId, userId },
    include: {
      plannedMeals: {
        include: { recipe: { include: { ingredients: true } } },
      },
    },
  });
}

function formatListResponse(groceryList) {
  const grouped = {};
  for (const item of groceryList.items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => a.name.localeCompare(b.name));
  }
  return {
    id: groceryList.id,
    mealPlanId: groceryList.mealPlanId,
    generatedAt: groceryList.generatedAt,
    loggedSpend: groceryList.loggedSpend,
    loggedStore: groceryList.loggedStore,
    loggedAt: groceryList.loggedAt,
    itemsByCategory: grouped,
    krogerPricesAvailable: groceryList.items.some((i) => i.estimatedPriceKroger != null),
  };
}

async function doGenerate(mealPlanId, userId) {
  const mealPlan = await loadFullMealPlan(mealPlanId, userId);
  if (!mealPlan) return null;

  const pantryStaples = await prisma.pantryStaple.findMany({ where: { userId } });
  const { items, excludedStaples } = buildGroceryList(mealPlan, pantryStaples.map((p) => p.name));

  const itemsWithPrices = items.map((item) => {
    const price = lookupPrice(item.normalizedName);
    return {
      name: item.name,
      quantity: item.quantity ?? null,
      unit: item.unit ?? null,
      category: item.category,
      isPantryStaple: false,
      estimatedPriceWalmart: price?.walmart ?? null,
      estimatedPriceAldi: price?.aldi ?? null,
    };
  });

  const newList = await prisma.$transaction(async (tx) => {
    const existing = await tx.groceryList.findUnique({ where: { mealPlanId } });
    if (existing) {
      await tx.groceryList.delete({ where: { id: existing.id } });
    }
    return tx.groceryList.create({
      data: { mealPlanId, items: { create: itemsWithPrices } },
      include: { items: true },
    });
  });

  return { list: newList, excludedStaples };
}

// GET /api/grocery/:mealPlanId
router.get('/:mealPlanId', asyncHandler(async (req, res) => {
  const mealPlanId = parseInt(req.params.mealPlanId);
  const userId = req.user.userId;

  const existing = await prisma.groceryList.findUnique({
    where: { mealPlanId },
    include: { items: true, mealPlan: { select: { userId: true } } },
  });

  if (existing) {
    if (existing.mealPlan.userId !== userId) {
      return res.status(404).json({ data: null, error: { message: 'Grocery list not found', code: 'NOT_FOUND' } });
    }
    return res.json({ data: formatListResponse(existing), error: null });
  }

  const result = await doGenerate(mealPlanId, userId);
  if (!result) {
    return res.status(404).json({ data: null, error: { message: 'Meal plan not found', code: 'NOT_FOUND' } });
  }
  res.json({ data: { ...formatListResponse(result.list), excludedStaples: result.excludedStaples }, error: null });
}));

// POST /api/grocery/:mealPlanId/generate
router.post('/:mealPlanId/generate', asyncHandler(async (req, res) => {
  const mealPlanId = parseInt(req.params.mealPlanId);
  const userId = req.user.userId;

  const result = await doGenerate(mealPlanId, userId);
  if (!result) {
    return res.status(404).json({ data: null, error: { message: 'Meal plan not found', code: 'NOT_FOUND' } });
  }
  res.json({ data: { ...formatListResponse(result.list), excludedStaples: result.excludedStaples }, error: null });
}));

const updateItemSchema = z.object({
  checked: z.boolean().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
});

// PUT /api/grocery/:listId/item/:itemId
router.put('/:listId/item/:itemId', asyncHandler(async (req, res) => {
  const listId = parseInt(req.params.listId);
  const itemId = parseInt(req.params.itemId);
  const userId = req.user.userId;

  const groceryList = await prisma.groceryList.findFirst({
    where: { id: listId, mealPlan: { userId } },
  });
  if (!groceryList) {
    return res.status(404).json({ data: null, error: { message: 'Grocery list not found', code: 'NOT_FOUND' } });
  }

  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' } });
  }

  const existing = await prisma.groceryItem.findFirst({ where: { id: itemId, groceryListId: listId } });
  if (!existing) {
    return res.status(404).json({ data: null, error: { message: 'Item not found', code: 'NOT_FOUND' } });
  }

  const { checked, quantity, unit } = parsed.data;
  const data = {};
  if (checked !== undefined) data.checked = checked;
  if (quantity !== undefined) data.quantity = quantity;
  if (unit !== undefined) data.unit = unit;

  const item = await prisma.groceryItem.update({ where: { id: itemId }, data });
  res.json({ data: item, error: null });
}));

const logSpendSchema = z.object({
  amount: z.number().positive(),
  store: z.string().min(1),
});

// POST /api/grocery/:listId/log-spend
router.post('/:listId/log-spend', asyncHandler(async (req, res) => {
  const listId = parseInt(req.params.listId);
  const userId = req.user.userId;

  const groceryList = await prisma.groceryList.findFirst({
    where: { id: listId, mealPlan: { userId } },
  });
  if (!groceryList) {
    return res.status(404).json({ data: null, error: { message: 'Grocery list not found', code: 'NOT_FOUND' } });
  }

  const parsed = logSpendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' } });
  }

  const { amount, store } = parsed.data;
  const updated = await prisma.groceryList.update({
    where: { id: listId },
    data: { loggedSpend: Math.round(amount * 100), loggedStore: store, loggedAt: new Date() },
    include: { items: true },
  });

  res.json({ data: formatListResponse(updated), error: null });
}));

// GET /api/grocery/:listId/prices
router.get('/:listId/prices', asyncHandler(async (req, res) => {
  const listId = parseInt(req.params.listId);
  const userId = req.user.userId;

  const groceryList = await prisma.groceryList.findFirst({
    where: { id: listId, mealPlan: { userId } },
    include: { items: true },
  });
  if (!groceryList) {
    return res.status(404).json({ data: null, error: { message: 'Grocery list not found', code: 'NOT_FOUND' } });
  }

  const settings = await prisma.appSettings.findUnique({ where: { userId } });
  const uncheckedItems = groceryList.items.filter((i) => !i.checked);
  const { items: updatedItems, krogerPricesAvailable } = await getPricesForItems(
    uncheckedItems,
    settings?.krogerZip ?? null
  );

  if (krogerPricesAvailable) {
    await Promise.all(
      updatedItems
        .filter((item) => item.estimatedPriceKroger != null)
        .map((item) =>
          prisma.groceryItem.update({
            where: { id: item.id },
            data: { estimatedPriceKroger: item.estimatedPriceKroger },
          })
        )
    );
  }

  const refreshed = await prisma.groceryList.findUnique({
    where: { id: listId },
    include: { items: true },
  });

  res.json({
    data: { ...formatListResponse(refreshed), krogerPricesAvailable, lastFetchedAt: new Date().toISOString() },
    error: null,
  });
}));

// DELETE /api/grocery/:listId/item/:itemId
router.delete('/:listId/item/:itemId', asyncHandler(async (req, res) => {
  const listId = parseInt(req.params.listId);
  const itemId = parseInt(req.params.itemId);
  const userId = req.user.userId;

  const groceryList = await prisma.groceryList.findFirst({
    where: { id: listId, mealPlan: { userId } },
  });
  if (!groceryList) {
    return res.status(404).json({ data: null, error: { message: 'Grocery list not found', code: 'NOT_FOUND' } });
  }

  const item = await prisma.groceryItem.findFirst({ where: { id: itemId, groceryListId: listId } });
  if (!item) {
    return res.status(404).json({ data: null, error: { message: 'Item not found', code: 'NOT_FOUND' } });
  }

  await prisma.groceryItem.delete({ where: { id: itemId } });
  res.json({ data: { deleted: true }, error: null });
}));

export default router;
