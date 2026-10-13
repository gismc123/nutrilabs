import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getAccessToken, listStores, resolveStore, DEFAULT_RADIUS_MILES } from '../services/kroger.js';
import { searchRecipes } from '../services/spoonacular.js';
import { searchFood } from '../services/usda.js';
import { testConnection as testMealDb } from '../services/themealdb.js';
import { realignMealPlans } from '../lib/weekPlans.js';
import { spoonacularKey, usdaKey } from '../lib/apiKeys.js';
import { pricerGet } from '../lib/pricerClient.js';
import { ADMIN_ONLY_SETTINGS, clearInstanceSettingsCache } from '../lib/instanceSettings.js';

const router = Router();
router.use(requireAuth);

const MASK = '••••••••';

function maskSettings(s) {
  const spoon = spoonacularKey(s);
  const usda = usdaKey(s);
  return {
    ...s,
    spoonacularApiKey: s.spoonacularApiKey ? MASK : null,
    usdaApiKey: s.usdaApiKey ? MASK : null,
    smtpPassword: s.smtpPassword ? MASK : null,
    // Which key requests actually use: 'settings', 'env' (fallback), or none / 'demo'.
    spoonacularConfigured: !!spoon.key,
    spoonacularKeySource: spoon.source,
    usdaConfigured: !!usda.key,
    usdaKeySource: usda.source,
    krogerConfigured: !!(process.env.KROGER_CLIENT_ID && process.env.KROGER_CLIENT_SECRET),
  };
}

const httpUrl = z.string().max(500).url().refine((v) => /^https?:\/\//i.test(v), 'Must be an http(s) URL');
const shortText = z.string().max(200);

const settingsSchema = z.object({
  weekStartDay: z.enum(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']).optional(),
  weeklyBudget: z.number().int().nonnegative().optional(),
  eatingOutReference: z.number().int().nonnegative().optional(),
  ollamaHost: httpUrl.optional(),
  ollamaModel: z.string().min(1).max(100).optional(),
  krogerZip: z.string().regex(/^\d{5}$/).or(z.literal('')).nullable().optional(),
  krogerRadiusMiles: z.number().int().min(1).max(100).optional(),
  krogerLocationId: shortText.nullable().optional(),
  krogerStoreName: shortText.nullable().optional(),
  meijerZip: z.string().regex(/^\d{5}$/).or(z.literal('')).nullable().optional(),
  meijerRadiusMiles: z.number().int().min(1).max(100).optional(),
  meijerStoreId: shortText.nullable().optional(),
  meijerStoreName: shortText.nullable().optional(),
  spoonacularApiKey: shortText.nullable().optional(),
  usdaApiKey: shortText.nullable().optional(),
  dateFormat: z.string().max(20).optional(),
  currency: z.string().max(10).optional(),
  smtpHost: z.string().max(253).regex(/^[a-z0-9.-]*$/i, 'Invalid host name').nullable().optional(),
  smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
  smtpUser: shortText.nullable().optional(),
  smtpPassword: shortText.nullable().optional(),
  smtpFromAddress: z.string().email().max(254).or(z.literal('')).nullable().optional(),
  smtpFromName: z.string().max(100).optional(),
  appBaseUrl: httpUrl.or(z.literal('')).nullable().optional(),
}).strict();

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

  // Instance-wide settings (Ollama, SMTP, base URL) make the server connect
  // somewhere or shape emails, so only the admin may change them.
  const adminFields = ADMIN_ONLY_SETTINGS.filter((k) => k in updates);
  if (adminFields.length && !req.user.isAdmin) {
    return res.status(403).json({ data: null, error: { message: `Only the instance admin can change: ${adminFields.join(', ')}`, code: 'FORBIDDEN' } });
  }

  // Handle clearing vs setting API keys
  if (updates.spoonacularApiKey === '') updates.spoonacularApiKey = null;
  if (updates.usdaApiKey === '') updates.usdaApiKey = null;
  // The masked placeholder coming back from the form means "unchanged".
  if (updates.smtpPassword === MASK) delete updates.smtpPassword;
  for (const k of ['krogerZip', 'meijerZip', 'smtpFromAddress', 'appBaseUrl']) if (updates[k] === '') updates[k] = null;

  const previous = await prisma.appSettings.findUnique({ where: { userId: req.user.userId } });
  const s = await prisma.appSettings.update({ where: { userId: req.user.userId }, data: updates });
  if (adminFields.length) clearInstanceSettingsCache();

  // Existing plans are keyed by their week start date; re-date them so they
  // stay reachable under the new week boundary.
  let weekRealignment = null;
  if (updates.weekStartDay && updates.weekStartDay !== previous?.weekStartDay) {
    weekRealignment = await realignMealPlans(req.user.userId, updates.weekStartDay);
  }

  res.json({ data: { ...maskSettings(s), weekRealignment }, error: null });
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

// GET /api/settings/kroger/stores?zip=&radius= — Kroger-family stores to choose from
router.get('/kroger/stores', asyncHandler(async (req, res) => {
  const clientId = process.env.KROGER_CLIENT_ID;
  const clientSecret = process.env.KROGER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(400).json({ data: null, error: { message: 'Kroger credentials not set in environment variables', code: 'KROGER_NOT_CONFIGURED' } });
  }
  const settings = await prisma.appSettings.findUnique({ where: { userId: req.user.userId } });
  const zip = String(req.query.zip ?? settings?.krogerZip ?? '').trim();
  const radius = parseInt(req.query.radius) || settings?.krogerRadiusMiles || DEFAULT_RADIUS_MILES;
  if (!/^\d{5}$/.test(zip)) {
    return res.status(400).json({ data: null, error: { message: 'Enter a 5-digit ZIP code first', code: 'VALIDATION_ERROR' } });
  }
  const token = await getAccessToken(clientId, clientSecret);
  const stores = await listStores(zip, radius, token);
  res.json({ data: { zip, radius, stores }, error: null });
}));

// GET /api/settings/meijer/stores?zip=&radius= — Meijer stores, looked up by the
// pricer service (Meijer's store API needs a real browser, so this is slow the
// first time for a ZIP and cached afterwards).
router.get('/meijer/stores', asyncHandler(async (req, res) => {
  const settings = await prisma.appSettings.findUnique({ where: { userId: req.user.userId } });
  const zip = String(req.query.zip ?? settings?.meijerZip ?? '').trim();
  const radius = parseInt(req.query.radius) || settings?.meijerRadiusMiles || 25;
  if (!/^\d{5}$/.test(zip)) {
    return res.status(400).json({ data: null, error: { message: 'Enter a 5-digit ZIP code first', code: 'VALIDATION_ERROR' } });
  }
  try {
    const data = await pricerGet('/stores', { retailer: 'meijer', zip, radius });
    const stores = data.stores.map(({ id, lat, lng, ...s }) => ({ locationId: id, ...s }));
    res.json({ data: { zip, radius, stores }, error: null });
  } catch (err) {
    res.status(err.status === 503 ? 503 : 502).json({ data: null, error: { message: err.message, code: 'PRICER_ERROR' } });
  }
}));

// POST /api/settings/test-kroger
router.post('/test-kroger', asyncHandler(async (req, res) => {
  const clientId = process.env.KROGER_CLIENT_ID;
  const clientSecret = process.env.KROGER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.json({ data: { connected: false, message: 'Kroger credentials not set in environment variables' }, error: null });
  }
  try {
    const token = await getAccessToken(clientId, clientSecret);
    const settings = await prisma.appSettings.findUnique({ where: { userId: req.user.userId } });
    if (!settings?.krogerLocationId && !settings?.krogerZip?.trim()) {
      return res.json({ data: { connected: false, message: 'Credentials OK, but no store chosen and no ZIP code set — prices need a store' }, error: null });
    }
    const store = await resolveStore(settings, token);
    if (!store) {
      return res.json({ data: { connected: false, message: `Credentials OK, but no Kroger-family store within ${settings.krogerRadiusMiles} miles of ${settings.krogerZip}` }, error: null });
    }
    // Prove the store actually returns prices, not just that a token was issued.
    const probe = await fetch(`https://api.kroger.com/v1/products?filter.term=milk&filter.locationId=${store.locationId}&filter.limit=1`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const priced = probe.ok && (await probe.json()).data?.[0]?.items?.[0]?.price?.regular != null;
    res.json({
      data: {
        connected: priced,
        message: priced
          ? `Connected — pricing from ${store.name}${store.selected ? '' : ' (nearest store)'}`
          : `Connected, but ${store.name} returned no prices`,
      },
      error: null,
    });
  } catch (err) {
    res.json({ data: { connected: false, message: err.message }, error: null });
  }
}));

const KEY_SOURCE_LABEL = {
  entered: 'the key you entered',
  settings: 'the key saved in Settings',
  env: 'the .env key (fallback)',
  demo: "USDA's shared DEMO_KEY (rate-limited)",
};

// POST /api/settings/test-spoonacular
router.post('/test-spoonacular', asyncHandler(async (req, res) => {
  const settings = await prisma.appSettings.findUnique({ where: { userId: req.user.userId } });
  const resolved = req.body?.apiKey ? { key: req.body.apiKey, source: 'entered' } : spoonacularKey(settings);
  const apiKey = resolved.key;
  if (!apiKey) {
    return res.json({ data: { connected: false, message: 'No Spoonacular API key in Settings or .env' }, error: null });
  }
  try {
    const results = await searchRecipes({ query: 'chicken' }, apiKey);
    if (results?.error) {
      return res.json({ data: { connected: false, message: `${results.message} (${KEY_SOURCE_LABEL[resolved.source]})` }, error: null });
    }
    res.json({ data: { connected: true, message: `Connected using ${KEY_SOURCE_LABEL[resolved.source]} — ${results.results.length} results returned` }, error: null });
  } catch (err) {
    res.json({ data: { connected: false, message: err.message }, error: null });
  }
}));

// POST /api/settings/test-mealdb
router.post('/test-mealdb', asyncHandler(async (req, res) => {
  res.json({ data: await testMealDb(), error: null });
}));

// POST /api/settings/test-usda
router.post('/test-usda', asyncHandler(async (req, res) => {
  const settings = await prisma.appSettings.findUnique({ where: { userId: req.user.userId } });
  const resolved = req.body?.apiKey ? { key: req.body.apiKey, source: 'entered' } : usdaKey(settings);
  const apiKey = resolved.key;
  try {
    const results = await searchFood('apple', apiKey);
    if (!results || results?.error || results.length === 0) {
      return res.json({ data: { connected: false, message: 'USDA connection failed' }, error: null });
    }
    res.json({ data: { connected: true, message: `Connected using ${KEY_SOURCE_LABEL[resolved.source]}` }, error: null });
  } catch (err) {
    res.json({ data: { connected: false, message: err.message }, error: null });
  }
}));

export default router;
