import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getAccessToken } from '../services/kroger.js';
import { searchRecipes } from '../services/spoonacular.js';
import { searchFood } from '../services/usda.js';

const router = Router();
router.use(requireAuth);

const MASK = '••••••••';

function maskSettings(s) {
  return {
    ...s,
    spoonacularApiKey: s.spoonacularApiKey ? MASK : null,
    usdaApiKey: s.usdaApiKey ? MASK : null,
    spoonacularConfigured: !!s.spoonacularApiKey,
    usdaConfigured: !!(s.usdaApiKey || process.env.USDA_API_KEY),
    krogerConfigured: !!(process.env.KROGER_CLIENT_ID && process.env.KROGER_CLIENT_SECRET),
  };
}

const settingsSchema = z.object({
  weekStartDay: z.enum(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']).optional(),
  weeklyBudget: z.number().int().nonnegative().optional(),
  eatingOutReference: z.number().int().nonnegative().optional(),
  ollamaHost: z.string().url().optional(),
  ollamaModel: z.string().min(1).optional(),
  krogerZip: z.string().nullable().optional(),
  spoonacularApiKey: z.string().nullable().optional(),
  usdaApiKey: z.string().nullable().optional(),
  dateFormat: z.string().optional(),
  currency: z.string().optional(),
  smtpHost: z.string().nullable().optional(),
  smtpPort: z.number().int().nullable().optional(),
  smtpUser: z.string().nullable().optional(),
  smtpPassword: z.string().nullable().optional(),
  smtpFromAddress: z.string().nullable().optional(),
  smtpFromName: z.string().optional(),
  appBaseUrl: z.string().nullable().optional(),
});

router.get('/', asyncHandler(async (req, res) => {
  const s = await prisma.appSettings.findUnique({ where: { userId: req.user.userId } });
  if (!s) return res.status(404).json({ data: null, error: { message: 'Settings not found', code: 'NOT_FOUND' } });
  res.json({ data: maskSettings(s), error: null });
}));

router.put('/', asyncHandler(async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      data: null,
      error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' },
    });
  }

  const updates = { ...parsed.data };

  // Handle clearing vs setting API keys
  if (updates.spoonacularApiKey === '') updates.spoonacularApiKey = null;
  if (updates.usdaApiKey === '') updates.usdaApiKey = null;

  const s = await prisma.appSettings.update({ where: { userId: req.user.userId }, data: updates });
  res.json({ data: maskSettings(s), error: null });
}));

// ── Custody template ──────────────────────────────────────────────────────────

const custodyTemplateSchema = z.array(
  z.object({
    dayOfWeek: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
    householdMode: z.enum(['SOLO', 'DAD_MODE']),
    isAlternatingWeek: z.boolean().default(false),
  })
);

router.get('/custody-template', asyncHandler(async (req, res) => {
  const rows = await prisma.custodyTemplate.findMany({ where: { userId: req.user.userId } });
  const byDay = Object.fromEntries(rows.map((r) => [r.dayOfWeek, r]));
  res.json({ data: byDay, error: null });
}));

router.put('/custody-template', asyncHandler(async (req, res) => {
  const parsed = custodyTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      data: null,
      error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' },
    });
  }

  const userId = req.user.userId;
  const rows = parsed.data.map((r) => ({ ...r, userId }));

  await prisma.$transaction(async (tx) => {
    await tx.custodyTemplate.deleteMany({ where: { userId } });
    await tx.custodyTemplate.createMany({ data: rows });
  });

  const updated = await prisma.custodyTemplate.findMany({ where: { userId } });
  const byDay = Object.fromEntries(updated.map((r) => [r.dayOfWeek, r]));
  res.json({ data: byDay, error: null });
}));

// ── Pantry staples ────────────────────────────────────────────────────────────

router.get('/pantry', asyncHandler(async (req, res) => {
  const staples = await prisma.pantryStaple.findMany({
    where: { userId: req.user.userId },
    orderBy: { name: 'asc' },
  });
  res.json({ data: staples, error: null });
}));

router.post('/pantry', asyncHandler(async (req, res) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      data: null,
      error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' },
    });
  }
  const staple = await prisma.pantryStaple.upsert({
    where: { userId_name: { userId: req.user.userId, name: parsed.data.name } },
    update: {},
    create: { userId: req.user.userId, name: parsed.data.name },
  });
  res.status(201).json({ data: staple, error: null });
}));

router.delete('/pantry/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  const existing = await prisma.pantryStaple.findFirst({ where: { id, userId: req.user.userId } });
  if (!existing) {
    return res.status(404).json({ data: null, error: { message: 'Pantry staple not found', code: 'NOT_FOUND' } });
  }
  await prisma.pantryStaple.delete({ where: { id } });
  res.json({ data: { deleted: true }, error: null });
}));

// ── Test connections ──────────────────────────────────────────────────────────

// POST /api/settings/test-kroger
router.post('/test-kroger', asyncHandler(async (req, res) => {
  const clientId = process.env.KROGER_CLIENT_ID;
  const clientSecret = process.env.KROGER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.json({ data: { connected: false, message: 'Kroger credentials not set in environment variables' }, error: null });
  }
  try {
    const token = await getAccessToken(clientId, clientSecret);
    res.json({ data: { connected: !!token, message: 'Connected to Kroger API' }, error: null });
  } catch (err) {
    res.json({ data: { connected: false, message: err.message }, error: null });
  }
}));

// POST /api/settings/test-spoonacular
router.post('/test-spoonacular', asyncHandler(async (req, res) => {
  const settings = await prisma.appSettings.findUnique({ where: { userId: req.user.userId } });
  const apiKey = req.body?.apiKey || settings?.spoonacularApiKey;
  if (!apiKey) {
    return res.json({ data: { connected: false, message: 'No Spoonacular API key configured' }, error: null });
  }
  try {
    const results = await searchRecipes({ query: 'chicken' }, apiKey);
    if (results?.error) {
      return res.json({ data: { connected: false, message: 'API key invalid or daily quota exceeded' }, error: null });
    }
    res.json({ data: { connected: true, message: `Connected — ${results.length} results returned` }, error: null });
  } catch (err) {
    res.json({ data: { connected: false, message: err.message }, error: null });
  }
}));

// POST /api/settings/test-usda
router.post('/test-usda', asyncHandler(async (req, res) => {
  const settings = await prisma.appSettings.findUnique({ where: { userId: req.user.userId } });
  const apiKey = req.body?.apiKey || settings?.usdaApiKey || null;
  try {
    const results = await searchFood('apple', apiKey);
    if (!results || results?.error || results.length === 0) {
      return res.json({ data: { connected: false, message: 'USDA connection failed' }, error: null });
    }
    const keyLabel = apiKey ? 'API key' : 'DEMO_KEY';
    res.json({ data: { connected: true, message: `Connected using ${keyLabel}` }, error: null });
  } catch (err) {
    res.json({ data: { connected: false, message: err.message }, error: null });
  }
}));

export default router;
