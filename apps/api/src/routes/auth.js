import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { createUserWithDefaults } from './account.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const setupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

function signToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

router.post('/auth/setup', asyncHandler(async (req, res) => {
  const existing = await prisma.user.count();
  if (existing > 0) {
    return res.status(409).json({
      data: null,
      error: { message: 'Setup already complete', code: 'SETUP_ALREADY_COMPLETE' },
    });
  }

  const parsed = setupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      data: null,
      error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' },
    });
  }

  const { email, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await createUserWithDefaults({ email, passwordHash });

  const token = signToken(user);
  res.cookie('auth_token', token, { ...COOKIE_OPTS, secure: process.env.NODE_ENV === 'production' });
  res.status(201).json({ data: { user, token }, error: null });
}));

router.post('/auth/login', asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      data: null,
      error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' },
    });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({
      data: null,
      error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' },
    });
  }

  if (!user.isActive) {
    return res.status(403).json({
      data: null,
      error: { message: 'This account has been deactivated', code: 'ACCOUNT_DEACTIVATED' },
    });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({
      data: null,
      error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' },
    });
  }

  const token = signToken(user);
  res.cookie('auth_token', token, { ...COOKIE_OPTS, secure: process.env.NODE_ENV === 'production' });
  res.json({ data: { token, userId: user.id, email: user.email }, error: null });
}));

router.post('/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ data: { message: 'Logged out' }, error: null });
});

router.get('/auth/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { id: true, email: true, createdAt: true },
  });
  res.json({ data: user, error: null });
}));

router.get('/auth/setup-status', asyncHandler(async (req, res) => {
  const count = await prisma.user.count();
  res.json({ data: { setupComplete: count > 0 }, error: null });
}));

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.put('/auth/password', requireAuth, asyncHandler(async (req, res) => {
  const parsed = passwordChangeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' } });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ data: null, error: { message: 'Current password is incorrect', code: 'INVALID_CREDENTIALS' } });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: req.user.userId }, data: { passwordHash, passwordChangedAt: new Date() } });
  res.json({ data: { message: 'Password updated successfully' }, error: null });
}));

export default router;
