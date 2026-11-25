// KrogerDeals inside NutriLabs: Kroger sale prices and digital coupons for the
// user's chosen Kroger store. Mounted by src/index.js:
//   /api/deals            signed-in NutriLabs users (requireAuth)
//   /api/deals/internal   coupon worker only (token; blocked by nginx)
import { Router } from 'express';
import cron from 'node-cron';
import { requireAuth } from '../middleware/auth.js';
import { config } from './config.js';
import { api } from './routes/api.js';
import { internal } from './routes/internal.js';
import { errorHandler } from './lib/http.js';
import { ensureStaples, startPriceSync } from './services/priceSync.js';
import { clearDealCache } from './services/deals.js';

export const dealsInternalRouter = Router();
dealsInternalRouter.use(internal);
dealsInternalRouter.use(errorHandler);

export const dealsRouter = Router();
dealsRouter.use(requireAuth, api);
dealsRouter.use((req, res) => res.status(404).json({ data: null, error: { message: 'Not found', code: 'NOT_FOUND' } }));
dealsRouter.use(errorHandler);

export function startDeals() {
  ensureStaples().catch((e) => console.error('[deals] could not seed staples:', e.message));
  // Nightly prices from the official API. Coupons come from the worker's own timer.
  cron.schedule(config.priceSyncCron, () => startPriceSync('nightly').then(clearDealCache), { timezone: config.tz });
  console.log(`[deals] price sync scheduled "${config.priceSyncCron}" (${config.tz})`);
}
