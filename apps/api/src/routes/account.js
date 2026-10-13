import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth, requireAdmin, setSessionCookie, clearSessionCookie } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sendPasswordResetEmail, testSmtpConnection } from '../services/mailer.js';
import { limits, hashToken, normalizeEmail } from '../lib/security.js';
import { getInstanceSettings } from '../lib/instanceSettings.js';

const router = Router();

// bcrypt only reads the first 72 bytes; the cap also bounds hashing cost.
export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password must be at most 128 characters');

/** Case-insensitive lookup (older accounts may have been stored with capitals). */
export function findUserByEmail(email) {
  return prisma.user.findFirst({ where: { email: { equals: normalizeEmail(email), mode: 'insensitive' } } });
}

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const PANTRY_STAPLES = [
  'olive oil', 'salt', 'black pepper', 'garlic powder', 'onion powder',
  'paprika', 'cumin', 'chili powder', 'Italian seasoning', 'soy sauce',
  'chicken broth', 'vegetable broth', 'cooking spray', 'sugar', 'flour',
  'baking powder', 'baking soda', 'vanilla extract', 'cinnamon',
];

async function createUserWithDefaults({ email, passwordHash, displayName, isAdmin = false }) {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: displayName || null,
      isActive: true,
      isAdmin,
      settings: { create: {} },
    },
    select: { id: true, email: true, displayName: true, isAdmin: true, createdAt: true },
  });

  await prisma.profile.create({
    data: {
      userId: user.id,
      name: displayName || email.split('@')[0],
      avatarColor: '#2E7D32',
      isPlanner: true,
    },
  });

  await prisma.custodyTemplate.createMany({
    data: DAYS.map((dayOfWeek) => ({
      userId: user.id,
      dayOfWeek,
      householdMode: 'SOLO',
      isAlternatingWeek: false,
    })),
  });

  await prisma.pantryStaple.createMany({
    data: PANTRY_STAPLES.map((name) => ({ userId: user.id, name })),
  });

  return user;
}

// ── POST /api/account/register ────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: passwordSchema,
  confirmPassword: z.string().max(128),
  displayName: z.string().trim().min(2).max(50),
});

router.post('/register', limits.register, asyncHandler(async (req, res) => {
  if (process.env.ALLOW_REGISTRATION === 'false') {
    return res.status(403).json({ data: null, error: { message: 'Registration is closed on this server', code: 'REGISTRATION_CLOSED' } });
  }
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' } });
  }
  const { email, password, confirmPassword, displayName } = parsed.data;
  if (password !== confirmPassword) {
    return res.status(400).json({ data: null, error: { message: 'Passwords do not match', code: 'PASSWORD_MISMATCH' } });
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    return res.status(409).json({ data: null, error: { message: 'Email already in use', code: 'EMAIL_TAKEN' } });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await createUserWithDefaults({ email: normalizeEmail(email), passwordHash, displayName });

  setSessionCookie(req, res, user);
  res.status(201).json({ data: { user, setupRequired: true }, error: null });
}));

// ── POST /api/account/forgot-password ─────────────────────────────────────────

const forgotSchema = z.object({ email: z.string().email().max(254) });

router.post('/forgot-password', limits.passwordReset, limits.passwordResetByEmail, asyncHandler(async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.json({ data: { message: 'If an account exists with that email, a reset link has been sent.' }, error: null });
  }

  const user = await findUserByEmail(parsed.data.email);

  if (user && user.isActive) {
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    // Only the hash is stored; the token itself exists only in the email.
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
    });

    // Instance SMTP and base URL only (.env or the admin's settings) — never a
    // regular user's, who could otherwise point reset links at their own server.
    const instance = await getInstanceSettings();
    const resetLink = `${instance.appBaseUrl.replace(/\/+$/, '')}/reset-password?token=${token}`;

    const result = await sendPasswordResetEmail(user.email, resetLink, instance);
    if (!result.success) {
      console.error('[mailer] Failed to send reset email:', result.error);
    }
  }

  res.json({ data: { message: 'If an account exists with that email, a reset link has been sent.' }, error: null });
}));

// ── POST /api/account/reset-password ──────────────────────────────────────────

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(128),
  newPassword: passwordSchema,
  confirmPassword: z.string().max(128),
});

router.post('/reset-password', limits.passwordReset, asyncHandler(async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' } });
  }
  const { token, newPassword, confirmPassword } = parsed.data;

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ data: null, error: { message: 'Passwords do not match', code: 'PASSWORD_MISMATCH' } });
  }

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!resetToken) {
    return res.status(400).json({ data: null, error: { message: 'Invalid or expired reset link', code: 'TOKEN_INVALID' } });
  }
  if (resetToken.usedAt) {
    return res.status(400).json({ data: null, error: { message: 'Reset link already used', code: 'TOKEN_INVALID' } });
  }
  if (resetToken.expiresAt < new Date()) {
    return res.status(400).json({ data: null, error: { message: 'Reset link has expired', code: 'TOKEN_EXPIRED' } });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      // Signs out every existing session (a second's slack so a login right after still works).
      data: { passwordHash, passwordChangedAt: new Date(now.getTime() - 1000) },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: now },
    }),
  ]);

  res.json({ data: { message: 'Password updated successfully' }, error: null });
}));

// ── POST /api/account/deactivate ──────────────────────────────────────────────

const deactivateSchema = z.object({
  password: z.string().min(1).max(128),
  confirmPhrase: z.string().max(100),
});

router.post('/deactivate', requireAuth, limits.loginByIp, asyncHandler(async (req, res) => {
  const parsed = deactivateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' } });
  }
  if (parsed.data.confirmPhrase !== 'delete my account') {
    return res.status(400).json({ data: null, error: { message: 'Confirmation phrase does not match', code: 'CONFIRM_PHRASE_MISMATCH' } });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ data: null, error: { message: 'Incorrect password', code: 'INVALID_CREDENTIALS' } });
  }

  const now = new Date();
  const purgeAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: req.user.userId },
    data: { isActive: false, deactivatedAt: now, scheduledPurgeAt: purgeAt },
  });

  clearSessionCookie(req, res);
  res.json({ data: { message: 'Account deactivated. You have 30 days to reactivate.' }, error: null });
}));

// ── GET /api/account/reactivate ───────────────────────────────────────────────

router.get('/reactivate', limits.passwordReset, asyncHandler(async (req, res) => {
  const { token } = req.query;
  if (typeof token !== 'string' || !token || token.length > 128) {
    return res.redirect('/login');
  }

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return res.redirect('/login?error=invalid_reactivation');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { isActive: true, deactivatedAt: null, scheduledPurgeAt: null },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  res.redirect('/login?reactivated=1');
}));

// ── POST /api/account/smtp-test ───────────────────────────────────────────────

// Admin only: it makes the server open a connection to the given host.
router.post('/smtp-test', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const instance = await getInstanceSettings();
  const body = req.body ?? {};
  const smtpSettings = {
    smtpHost: body.smtpHost || instance.smtpHost,
    smtpPort: Number(body.smtpPort) || instance.smtpPort,
    smtpUser: body.smtpUser || instance.smtpUser,
    smtpPassword: body.smtpPassword || instance.smtpPassword,
    smtpFromAddress: body.smtpFromAddress || instance.smtpFromAddress,
    smtpFromName: body.smtpFromName || instance.smtpFromName,
  };
  const result = await testSmtpConnection(smtpSettings);
  res.json({ data: result, error: null });
}));

export { createUserWithDefaults };
export default router;
