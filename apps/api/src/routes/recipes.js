import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
router.use(requireAuth);

const ingredientSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive().optional().nullable(),
  unit: z.string().optional().nullable(),
  isOptional: z.boolean().default(false),
});

const recipeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']),
  servings: z.number().int().positive().default(1),
  prepTimeMinutes: z.number().int().positive().optional().nullable(),
  costPerServing: z.number().positive().optional().nullable(),
  calories: z.number().int().optional().nullable(),
  proteinG: z.number().int().optional().nullable(),
  carbsG: z.number().int().optional().nullable(),
  fatG: z.number().int().optional().nullable(),
  isKidFriendly: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  instructions: z.string().optional().nullable(),
  ingredients: z.array(ingredientSchema).default([]),
});

router.get('/', asyncHandler(async (req, res) => {
  const { mealType, isKidFriendly, source, tags, search } = req.query;
  const where = {};

  if (mealType) where.mealType = mealType;
  if (source) where.source = source;
  if (isKidFriendly !== undefined) where.isKidFriendly = isKidFriendly === 'true';
  if (tags) {
    const tagArray = tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (tagArray.length) where.tags = { hasEvery: tagArray };
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const recipes = await prisma.recipe.findMany({ where, orderBy: { name: 'asc' } });
  res.json({ data: recipes, error: null });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const recipe = await prisma.recipe.findUnique({
    where: { id: parseInt(req.params.id) },
    include: { ingredients: true },
  });
  if (!recipe) {
    return res.status(404).json({ data: null, error: { message: 'Recipe not found', code: 'NOT_FOUND' } });
  }
  res.json({ data: recipe, error: null });
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
    data: { ...data, source: 'USER', ingredients: { create: ingredients } },
    include: { ingredients: true },
  });
  res.status(201).json({ data: recipe, error: null });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const existing = await prisma.recipe.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ data: null, error: { message: 'Recipe not found', code: 'NOT_FOUND' } });
  }

  const parsed = recipeSchema.safeParse(req.body);
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
  res.json({ data: recipe, error: null });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const existing = await prisma.recipe.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ data: null, error: { message: 'Recipe not found', code: 'NOT_FOUND' } });
  }

  await prisma.$transaction(async (tx) => {
    await tx.plannedMeal.updateMany({ where: { recipeId: id }, data: { recipeId: null } });
    await tx.recipe.delete({ where: { id } });
  });
  res.json({ data: { deleted: true }, error: null });
}));

export default router;
