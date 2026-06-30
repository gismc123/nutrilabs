import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sendPasswordResetEmail, testSmtpConnection } from '../services/mailer.js';

const router = Router();

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

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const PANTRY_STAPLES = [
  'olive oil', 'salt', 'black pepper', 'garlic powder', 'onion powder',
  'paprika', 'cumin', 'chili powder', 'Italian seasoning', 'soy sauce',
  'chicken broth', 'vegetable broth', 'cooking spray', 'sugar', 'flour',
  'baking powder', 'baking soda', 'vanilla extract', 'cinnamon',
];

async function createUserWithDefaults({ email, passwordHash, displayName }) {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: displayName || null,
      isActive: true,
      settings: { create: {} },
    },
    select: { id: true, email: true, displayName: true, createdAt: true },
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
  email: z.string().email(),
  password: z.string().min(8),
  confirmPassword: z.string(),
  displayName: z.string().min(2).max(50),
});

router.post('/register', asyncHandler(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' } });
  }
  const { email, password, confirmPassword, displayName } = parsed.data;
  if (password !== confirmPassword) {
    return res.status(400).json({ data: null, error: { message: 'Passwords do not match', code: 'PASSWORD_MISMATCH' } });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ data: null, error: { message: 'Email already in use', code: 'EMAIL_TAKEN' } });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await createUserWithDefaults({ email, passwordHash, displayName });

  const token = signToken(user);
  res.cookie('auth_token', token, { ...COOKIE_OPTS, secure: process.env.NODE_ENV === 'production' });
  res.status(201).json({ data: { user, token, setupRequired: true }, error: null });
}));

// ── POST /api/account/forgot-password ─────────────────────────────────────────

const forgotSchema = z.object({ email: z.string().email() });

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.json({ data: { message: 'If an account exists with that email, a reset link has been sent.' }, error: null });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    include: { settings: true },
  });

  if (user && user.isActive) {
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    let smtpSettings = user.settings;
    if (!smtpSettings?.smtpHost) {
      const firstAdmin = await prisma.appSettings.findFirst({
        where: { smtpHost: { not: null } },
      });
      smtpSettings = firstAdmin || smtpSettings;
    }

    const baseUrl = smtpSettings?.appBaseUrl || process.env.APP_BASE_URL || 'http://localhost:1042';
    const resetLink = `${baseUrl}/reset-password?token=${token}`;

    const result = await sendPasswordResetEmail(user.email, resetLink, smtpSettings || {});
    if (!result.success) {
      console.error('[mailer] Failed to send reset email:', result.error);
    }
  }

  res.json({ data: { message: 'If an account exists with that email, a reset link has been sent.' }, error: null });
}));

// ── POST /api/account/reset-password ──────────────────────────────────────────

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
  confirmPassword: z.string(),
});

router.post('/reset-password', asyncHandler(async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' } });
  }
  const { token, newPassword, confirmPassword } = parsed.data;

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ data: null, error: { message: 'Passwords do not match', code: 'PASSWORD_MISMATCH' } });
  }

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });
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
      data: { passwordHash, passwordChangedAt: now },
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
  password: z.string().min(1),
  confirmPhrase: z.string(),
});

router.post('/deactivate', requireAuth, asyncHandler(async (req, res) => {
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

  res.clearCookie('auth_token');
  res.json({ data: { message: 'Account deactivated. You have 30 days to reactivate.' }, error: null });
}));

// ── GET /api/account/reactivate ───────────────────────────────────────────────

router.get('/reactivate', asyncHandler(async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.redirect('/login');
  }

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });
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

router.post('/smtp-test', requireAuth, asyncHandler(async (req, res) => {
  const settings = await prisma.appSettings.findUnique({ where: { userId: req.user.userId } });
  const smtpSettings = {
    smtpHost: req.body.smtpHost || settings?.smtpHost,
    smtpPort: req.body.smtpPort || settings?.smtpPort,
    smtpUser: req.body.smtpUser || settings?.smtpUser,
    smtpPassword: req.body.smtpPassword || settings?.smtpPassword,
    smtpFromAddress: req.body.smtpFromAddress || settings?.smtpFromAddress,
    smtpFromName: req.body.smtpFromName || settings?.smtpFromName,
  };
  const result = await testSmtpConnection(smtpSettings);
  res.json({ data: result, error: null });
}));

export { createUserWithDefaults };
export default router;
