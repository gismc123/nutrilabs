import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth, setSessionCookie, clearSessionCookie } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { limits, normalizeEmail } from '../lib/security.js';
import { createUserWithDefaults, passwordSchema, findUserByEmail } from './account.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

const setupSchema = z.object({
  email: z.string().email().max(254),
  password: passwordSchema,
});

// Compared against when the email is unknown, so a miss takes as long as a wrong
// password and response timing doesn't reveal which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync('nutrilabs-timing-equalizer', 12);

router.post('/auth/setup', limits.register, asyncHandler(async (req, res) => {
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
  // The first account administers the instance.
  const user = await createUserWithDefaults({ email: normalizeEmail(email), passwordHash, isAdmin: true });

  setSessionCookie(req, res, user);
  res.status(201).json({ data: { user }, error: null });
}));

router.post('/auth/login', limits.loginByIp, limits.loginByEmail, asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      data: null,
      error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' },
    });
  }

  const { email, password } = parsed.data;
  const user = await findUserByEmail(email);
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    return res.status(401).json({
      data: null,
      error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' },
    });
  }

  // Only revealed to someone who knows the password.
  if (!user.isActive) {
    return res.status(403).json({
      data: null,
      error: { message: 'This account has been deactivated', code: 'ACCOUNT_DEACTIVATED' },
    });
  }

  setSessionCookie(req, res, user);
  res.json({ data: { userId: user.id, email: user.email }, error: null });
}));

router.post('/auth/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.json({ data: { message: 'Logged out' }, error: null });
});

router.get('/auth/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { id: true, email: true, isAdmin: true, createdAt: true },
  });
  res.json({ data: user, error: null });
}));

router.get('/auth/setup-status', asyncHandler(async (req, res) => {
  const count = await prisma.user.count();
  res.json({ data: { setupComplete: count > 0 }, error: null });
}));

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

router.put('/auth/password', requireAuth, limits.loginByIp, asyncHandler(async (req, res) => {
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
  // passwordChangedAt invalidates every older session, including this one, so
  // issue a fresh cookie for the current browser.
  const updated = await prisma.user.update({ where: { id: req.user.userId }, data: { passwordHash, passwordChangedAt: new Date(Date.now() - 1000) } });
  setSessionCookie(req, res, updated);
  res.json({ data: { message: 'Password updated successfully' }, error: null });
}));

export default router;
