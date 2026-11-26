// Worker ingest, mounted at /api/deals/internal. nginx returns 404 for this path,
// so only the coupon worker on the Docker network reaches it, and it must also
// send the shared DEALS_WORKER_TOKEN.
import express, { Router } from 'express';
import { config } from '../config.js';
import { asyncHandler, HttpError, ok } from '../lib/http.js';
import { safeEqual } from '../../lib/security.js';
import { ingestCouponRun, reparseAll } from '../services/coupons.js';
import { afterCouponRun } from '../services/priceSync.js';
import { clearDealCache } from '../services/deals.js';
import { prisma } from '../db.js';
import { claimRefresh, finishRefresh } from '../services/refresh.js';

export const internal = Router();

internal.get('/health', asyncHandler(async (req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  ok(res, { ok: true });
}));

internal.use((req, res, next) => {
  if (!config.workerToken || config.workerToken.length < 32 || !safeEqual(req.headers['x-worker-token'], config.workerToken)) {
    return next(new HttpError(401, 'Bad worker token', 'UNAUTHORIZED'));
  }
  next();
});

internal.post('/coupon-runs', express.json({ limit: '25mb' }), asyncHandler(async (req, res) => {
  const result = await ingestCouponRun(req.body || {});
  clearDealCache();
  // Linking can take a minute (targeted product searches); do not hold the worker.
  if (['ok', 'partial'].includes(result.status)) {
    afterCouponRun().then(clearDealCache).catch((e) => console.error('[deals coupon-link]', e));
  }
  ok(res, result);
}));

internal.post('/reparse', asyncHandler(async (req, res) => {
  const n = await reparseAll();
  clearDealCache();
  ok(res, { reparsed: n });
}));

// Host timer, every minute: should the coupon worker run now?
internal.post('/refresh/claim', asyncHandler(async (req, res) => {
  ok(res, await claimRefresh());
}));

internal.post('/refresh/:id/finish', express.json({ limit: '2kb' }), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Bad id', 'INVALID');
  ok(res, await finishRefresh(id, req.body?.exitCode ?? req.query.exitCode));
}));
