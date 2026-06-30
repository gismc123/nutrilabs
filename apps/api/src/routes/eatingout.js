import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
router.use(requireAuth);

const eatingOutSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']),
  amount: z.number().positive('amount must be positive'),
  householdMode: z.enum(['SOLO', 'DAD_MODE']),
  placeName: z.string().optional(),
  notes: z.string().optional(),
});

// GET /api/eatingout
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { month, householdMode } = req.query;
  const where = { userId };

  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ data: null, error: { message: 'month must be YYYY-MM', code: 'VALIDATION_ERROR' } });
    }
    const [y, m] = month.split('-').map(Number);
    where.date = {
      gte: new Date(Date.UTC(y, m - 1, 1)),
      lte: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)),
    };
  }

  if (householdMode) {
    if (!['SOLO', 'DAD_MODE'].includes(householdMode)) {
      return res.status(400).json({ data: null, error: { message: 'Invalid householdMode', code: 'VALIDATION_ERROR' } });
    }
    where.householdMode = householdMode;
  }

  const logs = await prisma.eatingOutLog.findMany({ where, orderBy: { date: 'desc' } });
  res.json({ data: logs, error: null });
}));

// POST /api/eatingout
router.post('/', asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const parsed = eatingOutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' } });
  }

  const { date, mealType, amount, householdMode, placeName, notes } = parsed.data;
  const log = await prisma.eatingOutLog.create({
    data: {
      userId,
      date: new Date(date + 'T00:00:00.000Z'),
      mealType,
      amount: Math.round(amount * 100),
      householdMode,
      placeName: placeName ?? null,
      notes: notes ?? null,
    },
  });

  res.status(201).json({ data: log, error: null });
}));

// PUT /api/eatingout/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const id = parseInt(req.params.id);

  const existing = await prisma.eatingOutLog.findFirst({ where: { id, userId } });
  if (!existing) {
    return res.status(404).json({ data: null, error: { message: 'Log entry not found', code: 'NOT_FOUND' } });
  }

  const parsed = eatingOutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' } });
  }

  const { date, mealType, amount, householdMode, placeName, notes } = parsed.data;
  const updated = await prisma.eatingOutLog.update({
    where: { id },
    data: {
      date: new Date(date + 'T00:00:00.000Z'),
      mealType,
      amount: Math.round(amount * 100),
      householdMode,
      placeName: placeName ?? null,
      notes: notes ?? null,
    },
  });

  res.json({ data: updated, error: null });
}));

// DELETE /api/eatingout/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const id = parseInt(req.params.id);

  const existing = await prisma.eatingOutLog.findFirst({ where: { id, userId } });
  if (!existing) {
    return res.status(404).json({ data: null, error: { message: 'Log entry not found', code: 'NOT_FOUND' } });
  }

  await prisma.eatingOutLog.delete({ where: { id } });
  res.json({ data: { id }, error: null });
}));

export default router;
