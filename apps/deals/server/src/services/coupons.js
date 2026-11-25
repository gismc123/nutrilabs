// Store one coupon run from the worker. The worker only reads Kroger; all parsing
// happens here so a parser fix can be replayed over the stored raw JSON.
import { prisma } from '../db.js';
import { parseCoupon } from './couponParser.js';
import { isGroceryCoupon } from './matcher.js';

const OK_STATUSES = new Set(['ok', 'partial']);

export async function ingestCouponRun(report) {
  const run = await prisma.syncRun.create({
    data: {
      kind: 'coupons',
      startedAt: new Date(report.startedAt || Date.now()),
      finishedAt: new Date(report.finishedAt || Date.now()),
      status: String(report.status || 'failed').slice(0, 30),
      signedIn: !!report.signedIn,
      error: report.error ? String(report.error).slice(0, 2000) : null,
      note: report.note ? String(report.note).slice(0, 500) : null,
    },
  });

  const raws = Array.isArray(report.coupons) ? report.coupons : [];
  const counts = { received: raws.length, created: 0, updated: 0, expired: 0, removed: 0, skipped: 0 };

  if (OK_STATUSES.has(run.status) && raws.length) {
    const now = new Date();
    const seen = new Set();
    for (const raw of raws) {
      if (!raw || raw.id == null) { counts.skipped++; continue; }
      const { grocery, ...c } = parseCoupon(raw, { signedIn: report.signedIn });
      seen.add(c.id);
      const existing = await prisma.coupon.findUnique({ where: { id: c.id }, select: { id: true, clipped: true } });
      const status = c.expiryDate && c.expiryDate < now ? 'expired' : 'active';
      const data = {
        ...c,
        // Signed out we cannot see clip state, so keep what we knew.
        clipped: report.signedIn ? c.clipped : existing?.clipped ?? false,
        status,
        lastSeenAt: now,
        capturedAt: now,
        raw,
      };
      if (existing) {
        await prisma.coupon.update({ where: { id: c.id }, data });
        counts.updated++;
      } else {
        await prisma.coupon.create({ data: { ...data, firstSeenAt: now, matchStatus: isGroceryCoupon(c) ? 'pending' : 'not_grocery' } });
        counts.created++;
      }
    }

    // Coupons missing from a complete run are gone. Guard against a short or
    // partial read wiping the list: require a full run that saw at least 60% of
    // what was active before.
    const activeBefore = await prisma.coupon.count({ where: { status: 'active', id: { notIn: [...seen] } } });
    const previouslyActive = activeBefore + seen.size;
    if (run.status === 'ok' && seen.size >= 0.6 * previouslyActive) {
      const missing = await prisma.coupon.findMany({ where: { status: 'active', id: { notIn: [...seen] } }, select: { id: true, expiryDate: true } });
      for (const m of missing) {
        const status = m.expiryDate && m.expiryDate < now ? 'expired' : 'removed';
        await prisma.coupon.update({ where: { id: m.id }, data: { status } });
        counts[status]++;
      }
    }
  }
  // Time-based expiry runs on every run, even failed ones.
  const exp = await prisma.coupon.updateMany({ where: { status: 'active', expiryDate: { lt: new Date() } }, data: { status: 'expired' } });
  counts.expired += exp.count;

  await prisma.syncRun.update({ where: { id: run.id }, data: { counts } });
  return { runId: run.id, status: run.status, counts };
}

// Re-parse every stored coupon from its raw JSON (after a parser fix).
export async function reparseAll() {
  const rows = await prisma.coupon.findMany({ select: { id: true, raw: true, clipped: true } });
  for (const r of rows) {
    const { grocery, ...c } = parseCoupon(r.raw);
    await prisma.coupon.update({ where: { id: r.id }, data: { ...c, clipped: r.clipped } });
  }
  return rows.length;
}
