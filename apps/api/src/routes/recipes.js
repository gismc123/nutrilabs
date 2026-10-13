import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { visibleRecipes, canEditRecipe, forbidden } from '../lib/access.js';

const router = Router();
router.use(requireAuth);

const ingredientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().positive().max(100000).optional().nullable(),
  unit: z.string().max(40).optional().nullable(),
  isOptional: z.boolean().default(false),
});

const macro = z.number().int().min(0).max(100000).optional().nullable();

const recipeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']),
  servings: z.number().int().positive().max(100).default(1),
  prepTimeMinutes: z.number().int().positive().max(10000).optional().nullable(),
  costPerServing: z.number().positive().max(10000).optional().nullable(),
  calories: macro,
  proteinG: macro,
  carbsG: macro,
  fatG: macro,
  isKidFriendly: z.boolean().default(true),
  tags: z.array(z.string().max(50)).max(30).default([]),
  instructions: z.string().max(20000).optional().nullable(),
  ingredients: z.array(ingredientSchema).max(100).default([]),
  source: z.enum(['USER', 'AI']).default('USER'),
});

// Edits keep the recipe's existing source unless one is sent explicitly.
const recipeUpdateSchema = recipeSchema.extend({ source: z.enum(['USER', 'AI']).optional() });

router.get('/', asyncHandler(async (req, res) => {
  const { mealType, isKidFriendly, source, tags, search } = req.query;
  const where = { AND: [visibleRecipes(req.user)] };

  if (mealType) where.mealType = mealType;
  if (source) where.source = source;
  if (isKidFriendly !== undefined) where.isKidFriendly = isKidFriendly === 'true';
  if (tags) {
    const tagArray = tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (tagArray.length) where.tags = { hasEvery: tagArray };
  }
  if (search) {
    where.AND.push({ OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ] });
  }

  const recipes = await prisma.recipe.findMany({ where, orderBy: { name: 'asc' } });
  res.json({ data: recipes.map((r) => ({ ...r, editable: canEditRecipe(req.user, r) })), error: null });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const recipe = Number.isInteger(id) && await prisma.recipe.findFirst({
    where: { id, ...visibleRecipes(req.user) },
    include: { ingredients: true },
  });
  if (!recipe) {
    return res.status(404).json({ data: null, error: { message: 'Recipe not found', code: 'NOT_FOUND' } });
  }
  res.json({ data: { ...recipe, editable: canEditRecipe(req.user, recipe) }, error: null });
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = recipeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      data: null,
      error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' },
    });
  }
  const { ingredients, ...data } = parsed.data;
  const recipe = await prisma.recipe.create({
    data: { ...data, userId: req.user.userId, ingredients: { create: ingredients } },
    include: { ingredients: true },
  });
  res.status(201).json({ data: { ...recipe, editable: true }, error: null });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const existing = Number.isInteger(id) && await prisma.recipe.findFirst({ where: { id, ...visibleRecipes(req.user) } });
  if (!existing) {
    return res.status(404).json({ data: null, error: { message: 'Recipe not found', code: 'NOT_FOUND' } });
  }
  if (!canEditRecipe(req.user, existing)) {
    return forbidden(res, 'Shared library recipes can only be changed by the admin');
  }

  const parsed = recipeUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      data: null,
      error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' },
    });
  }

  const { ingredients, ...data } = parsed.data;
  const recipe = await prisma.$transaction(async (tx) => {
    await tx.ingredient.deleteMany({ where: { recipeId: id } });
    return tx.recipe.update({
      where: { id },
      data: { ...data, ingredients: { create: ingredients } },
      include: { ingredients: true },
    });
  });
  res.json({ data: { ...recipe, editable: true }, error: null });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const existing = Number.isInteger(id) && await prisma.recipe.findFirst({ where: { id, ...visibleRecipes(req.user) } });
  if (!existing) {
    return res.status(404).json({ data: null, error: { message: 'Recipe not found', code: 'NOT_FOUND' } });
  }
  if (!canEditRecipe(req.user, existing)) {
    return forbidden(res, 'Shared library recipes can only be changed by the admin');
  }

  await prisma.$transaction(async (tx) => {
    await tx.plannedMeal.updateMany({ where: { recipeId: id }, data: { recipeId: null } });
    await tx.recipe.delete({ where: { id } });
  });
  res.json({ data: { deleted: true }, error: null });
}));

export default router;
