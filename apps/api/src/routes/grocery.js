import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getPricesForItems } from '../services/kroger.js';
import {
  buildGroceryList,
  findMatchingStaple,
  mealsWithoutIngredients,
  normalizeIngredientName,
  planFingerprint,
} from '../lib/groceryEngine.js';
import { lookupPrice } from '../lib/priceSeed.js';
import { pricerPost } from '../lib/pricerClient.js';

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

async function loadStapleNames(userId) {
  const staples = await prisma.pantryStaple.findMany({ where: { userId } });
  return staples.map((p) => p.name);
}

function formatListResponse(groceryList, stapleNames = []) {
  const grouped = {};
  const excludedStaples = [];
  for (const item of groceryList.items) {
    if (item.isPantryStaple) {
      excludedStaples.push({
        id: item.id,
        name: item.name,
        staple: findMatchingStaple(item.normalizedName ?? item.name, stapleNames) ?? item.name,
      });
      continue;
    }
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => a.name.localeCompare(b.name));
  }
  excludedStaples.sort((a, b) => a.name.localeCompare(b.name));
  return {
    id: groceryList.id,
    mealPlanId: groceryList.mealPlanId,
    generatedAt: groceryList.generatedAt,
    loggedSpend: groceryList.loggedSpend,
    loggedStore: groceryList.loggedStore,
    loggedAt: groceryList.loggedAt,
    itemsByCategory: grouped,
    excludedStaples,
    krogerPricesAvailable: groceryList.items.some((i) => !i.isPantryStaple && i.estimatedPriceKroger != null),
  };
}

function itemKey(item) {
  return item.normalizedName ?? normalizeIngredientName(item.name);
}

// Rebuilds the items of the plan's list in place (the list row, and any logged
// spend on it, is kept). With preserveChecked, items still on the list keep
// their checked state.
async function regenerate(mealPlan, stapleNames, { preserveChecked }) {
  const { items, excludedStaples } = buildGroceryList(mealPlan, stapleNames);
  const sourceHash = planFingerprint(mealPlan, stapleNames);

  const rows = [...items, ...excludedStaples].map((item) => {
    const price = item.isPantryStaple ? null : lookupPrice(item.normalizedName);
    return {
      name: item.name,
      normalizedName: item.normalizedName,
      quantity: item.quantity ?? null,
      unit: item.unit ?? null,
      category: item.category,
      isPantryStaple: item.isPantryStaple,
      estimatedPriceWalmart: price?.walmart ?? null,
      estimatedPriceAldi: price?.aldi ?? null,
    };
  });

  return prisma.$transaction(async (tx) => {
    const existing = await tx.groceryList.findUnique({
      where: { mealPlanId: mealPlan.id },
      include: { items: true },
    });

    if (!existing) {
      return tx.groceryList.create({
        data: { mealPlanId: mealPlan.id, sourceHash, items: { create: rows } },
        include: { items: true },
      });
    }

    const checkedKeys = new Set(
      preserveChecked ? existing.items.filter((i) => i.checked).map(itemKey) : []
    );
    // Fetched Kroger prices are per product, so they stay valid when quantities change.
    const krogerPrices = new Map(
      existing.items.filter((i) => i.estimatedPriceKroger != null).map((i) => [itemKey(i), i.estimatedPriceKroger])
    );
    await tx.groceryItem.deleteMany({ where: { groceryListId: existing.id } });
    return tx.groceryList.update({
      where: { id: existing.id },
      data: {
        generatedAt: new Date(),
        sourceHash,
        items: {
          create: rows.map((r) => ({
            ...r,
            checked: checkedKeys.has(r.normalizedName),
            estimatedPriceKroger: r.isPantryStaple ? null : krogerPrices.get(r.normalizedName) ?? null,
          })),
        },
      },
      include: { items: true },
    });
  });
}

// GET /api/grocery/:mealPlanId — returns the saved list, regenerating it first
// if the plan's meals, their ingredients, or the pantry staples have changed.
router.get('/:mealPlanId', asyncHandler(async (req, res) => {
  const mealPlanId = parseInt(req.params.mealPlanId);
  const userId = req.user.userId;

  const [mealPlan, stapleNames] = await Promise.all([
    loadFullMealPlan(mealPlanId, userId),
    loadStapleNames(userId),
  ]);
  if (!mealPlan) {
    return res.status(404).json({ data: null, error: { message: 'Meal plan not found', code: 'NOT_FOUND' } });
  }

  const existing = await prisma.groceryList.findUnique({ where: { mealPlanId }, include: { items: true } });
  const isFresh = existing && existing.sourceHash === planFingerprint(mealPlan, stapleNames);
  const list = isFresh ? existing : await regenerate(mealPlan, stapleNames, { preserveChecked: true });

  res.json({
    data: {
      ...formatListResponse(list, stapleNames),
      mealsWithoutIngredients: mealsWithoutIngredients(mealPlan),
      regenerated: !isFresh,
    },
    error: null,
  });
}));

// POST /api/grocery/:mealPlanId/generate — explicit rebuild; clears checked state.
router.post('/:mealPlanId/generate', asyncHandler(async (req, res) => {
  const mealPlanId = parseInt(req.params.mealPlanId);
  const userId = req.user.userId;

  const [mealPlan, stapleNames] = await Promise.all([
    loadFullMealPlan(mealPlanId, userId),
    loadStapleNames(userId),
  ]);
  if (!mealPlan) {
    return res.status(404).json({ data: null, error: { message: 'Meal plan not found', code: 'NOT_FOUND' } });
  }

  const list = await regenerate(mealPlan, stapleNames, { preserveChecked: false });
  res.json({
    data: {
      ...formatListResponse(list, stapleNames),
      mealsWithoutIngredients: mealsWithoutIngredients(mealPlan),
      regenerated: true,
    },
    error: null,
  });
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
  const uncheckedItems = groceryList.items.filter((i) => !i.checked && !i.isPantryStaple);
  const { items: updatedItems, krogerPricesAvailable, pricedCount, store, message } = await getPricesForItems(
    uncheckedItems,
    settings
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
    data: {
      ...formatListResponse(refreshed),
      krogerPricesAvailable,
      krogerPricedCount: pricedCount,
      krogerRequestedCount: uncheckedItems.length,
      krogerStore: store,
      krogerMessage: message,
      lastFetchedAt: new Date().toISOString(),
    },
    error: null,
  });
}));

// GET /api/grocery/:listId/store-prices?refresh=1 — prices for every item at
// each store the price service covers: Kroger and Meijer live (from the stores
// chosen in Settings), ALDI and Sam's Club from their last weekly update.
// refresh=1 re-fetches Kroger/Meijer instead of using today's cached prices.
router.get('/:listId/store-prices', asyncHandler(async (req, res) => {
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
  const items = groceryList.items.filter((i) => !i.isPantryStaple);
  const stores = {
    kroger: settings?.krogerLocationId || settings?.krogerZip
      ? { id: settings.krogerLocationId, name: settings.krogerStoreName, zip: settings.krogerZip, radius: settings.krogerRadiusMiles }
      : null,
    meijer: settings?.meijerStoreId ? { id: settings.meijerStoreId, name: settings.meijerStoreName } : null,
  };
  const retailers = ['kroger', 'meijer', 'aldi', 'samsclub'].filter((r) => r === 'aldi' || r === 'samsclub' || stores[r]);

  if (!items.length) return res.json({ data: { retailers: [], prices: {} }, error: null });

  let result;
  try {
    result = await pricerPost('/quotes', {
      items: items.map((i) => ({ name: i.name })),
      stores,
      retailers,
      refresh: req.query.refresh === '1',
    });
  } catch (err) {
    return res.status(err.status === 503 ? 503 : 502).json({ data: null, error: { message: err.message, code: 'PRICER_ERROR' } });
  }

  // quotes[retailer] is in item order; re-key by grocery item id.
  const prices = {};
  items.forEach((item, idx) => {
    prices[item.id] = Object.fromEntries(retailers.map((r) => [r, result.quotes[r]?.[idx] ?? null]));
  });

  const retailerInfo = result.retailers.map((r) => {
    const quotes = items.map((_, idx) => result.quotes[r.id]?.[idx]).filter(Boolean);
    const priced = quotes.filter((q) => q.status === 'ok');
    const updated = quotes.map((q) => q.fetchedAt).filter(Boolean).sort();
    return {
      ...r,
      pricedCount: priced.length,
      itemCount: items.length,
      totalCents: Math.round(priced.reduce((sum, q) => sum + q.price, 0) * 100),
      oldestUpdate: updated[0] ?? null,
      newestUpdate: updated[updated.length - 1] ?? null,
    };
  });

  res.json({ data: { retailers: retailerInfo, prices }, error: null });
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
