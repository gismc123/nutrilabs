import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
router.use(requireAuth);

const profileSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive().optional().nullable(),
  avatarColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  isPlanner: z.literal(false).optional(),
  dietaryNotes: z.string().optional().nullable(),
  foodDislikes: z.string().optional().nullable(),
  calorieTarget: z.number().int().positive().optional().nullable(),
});

router.get('/', asyncHandler(async (req, res) => {
  const profiles = await prisma.profile.findMany({
    where: { userId: req.user.userId },
    orderBy: [{ isPlanner: 'desc' }, { name: 'asc' }],
  });
  res.json({ data: profiles, error: null });
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      data: null,
      error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' },
    });
  }
  const profile = await prisma.profile.create({
    data: { ...parsed.data, isPlanner: false, userId: req.user.userId },
  });
  res.status(201).json({ data: profile, error: null });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const existing = await prisma.profile.findFirst({ where: { id, userId: req.user.userId } });
  if (!existing) {
    return res.status(404).json({ data: null, error: { message: 'Profile not found', code: 'NOT_FOUND' } });
  }

  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      data: null,
      error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' },
    });
  }

  const profile = await prisma.profile.update({
    where: { id },
    data: { ...parsed.data, isPlanner: existing.isPlanner },
  });
  res.json({ data: profile, error: null });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const existing = await prisma.profile.findFirst({ where: { id, userId: req.user.userId } });
  if (!existing) {
    return res.status(404).json({ data: null, error: { message: 'Profile not found', code: 'NOT_FOUND' } });
  }
  if (existing.isPlanner) {
    return res.status(400).json({
      data: null,
      error: { message: 'Cannot delete the planner profile', code: 'CANNOT_DELETE_PLANNER' },
    });
  }
  await prisma.profile.delete({ where: { id } });
  res.json({ data: { deleted: true }, error: null });
}));

export default router;
