// Internal listener (port 3102): never published to the host or the tunnel. Only
// the worker container on the compose network can reach it, and it must send
// the shared DEALS_WORKER_TOKEN as well.
import express, { Router } from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { asyncHandler, HttpError, ok } from '../lib/http.js';
import { ingestCouponRun, reparseAll } from '../services/coupons.js';
import { afterCouponRun } from '../services/priceSync.js';
import { clearDealCache } from '../services/deals.js';
import { prisma } from '../db.js';

export const internal = Router();

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

internal.get('/internal/health', asyncHandler(async (req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  ok(res, { ok: true });
}));

internal.use('/internal', (req, res, next) => {
  if (!config.workerToken || config.workerToken.length < 32 || !safeEqual(req.headers['x-worker-token'], config.workerToken)) {
    return next(new HttpError(401, 'Bad worker token', 'UNAUTHORIZED'));
  }
  next();
});

internal.post('/internal/coupon-runs', express.json({ limit: '25mb' }), asyncHandler(async (req, res) => {
  const result = await ingestCouponRun(req.body || {});
  clearDealCache();
  // Linking can take a minute (targeted product searches); do not hold the worker.
  if (['ok', 'partial'].includes(result.status)) {
    afterCouponRun().then(clearDealCache).catch((e) => console.error('[coupon-link]', e));
  }
  ok(res, result);
}));

internal.post('/internal/reparse', asyncHandler(async (req, res) => {
  const n = await reparseAll();
  clearDealCache();
  ok(res, { reparsed: n });
}));
