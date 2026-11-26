// Coupon refresh scheduling. The coupon worker runs on the host (it needs a
// browser window), so the API cannot start it. Instead a host timer asks the API
// every minute whether to run (claim) and reports back when done (finish). Every
// coupon refresh, nightly or from the Store tab, goes through here, so the API
// enforces one refresh per MIN_GAP across both.
import { prisma } from '../db.js';
import { config } from '../config.js';
import { HttpError } from '../lib/http.js';

export const MIN_GAP_MS = 4 * 3600_000;
const STALE_RUNNING_MS = 20 * 60_000; // a claimed run that never reported back
const NIGHTLY_WINDOW_MS = 3 * 3600_000; // the poller may pick up the nightly run this late
const DEFAULT_DURATION_S = 90;
const MAX_AHEAD_MS = 7 * 86_400_000;

let lastPollAt = null; // last time the host timer checked in (memory only)
const bootedAt = Date.now(); // until the timer's first check-in after a restart, assume it is fine

// ---- time zone helpers (no dependency: Intl only) ----------------------------

function zoneParts(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute'), s: get('second') };
}

function zoneOffsetMs(date, tz) {
  const p = zoneParts(date, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}

// The instant that is h:min local time on the local calendar day y-m-d in tz.
export function zonedTime(y, m, d, h, min, tz) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  let t = guess - zoneOffsetMs(new Date(guess), tz);
  t = guess - zoneOffsetMs(new Date(t), tz); // second pass settles DST edges
  return new Date(t);
}

function parseHm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return { h: 3, min: 45 };
  return { h: Number(m[1]), min: Number(m[2]) };
}

// The nightly slot on or before `now` (today's if already passed, else yesterday's),
// and the next one after `now`.
export function nightlySlots(now = new Date(), tz = config.tz, hm = config.couponSyncTime) {
  const { h, min } = parseHm(hm);
  const p = zoneParts(now, tz);
  const today = zonedTime(p.y, p.m, p.d, h, min, tz);
  const shift = (base, days) => {
    const q = zoneParts(new Date(base.getTime() + days * 86_400_000 + 12 * 3600_000), tz);
    return zonedTime(q.y, q.m, q.d, h, min, tz);
  };
  return today <= now ? { last: today, next: shift(today, 1) } : { last: shift(today, -1), next: today };
}

// ---- state --------------------------------------------------------------------

async function lastCouponStart() {
  const [run, req] = await Promise.all([
    prisma.dealSyncRun.findFirst({ where: { kind: 'coupons' }, orderBy: { startedAt: 'desc' } }),
    prisma.dealRefreshRequest.findFirst({ where: { startedAt: { not: null } }, orderBy: { startedAt: 'desc' } }),
  ]);
  const times = [run?.startedAt, req?.startedAt].filter(Boolean).map((t) => t.getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

// Average of recent completed refreshes, start of container to stored result.
async function typicalDurationSec() {
  const done = await prisma.dealRefreshRequest.findMany({
    where: { status: 'done', startedAt: { not: null }, finishedAt: { not: null } },
    orderBy: { finishedAt: 'desc' }, take: 5,
  });
  const secs = done.map((r) => (r.finishedAt - r.startedAt) / 1000).filter((s) => s > 5 && s < 1800);
  if (secs.length) return Math.round(secs.reduce((a, b) => a + b, 0) / secs.length);
  return DEFAULT_DURATION_S;
}

async function expireStale(now) {
  await prisma.dealRefreshRequest.updateMany({
    where: { status: 'running', startedAt: { lt: new Date(now - STALE_RUNNING_MS) } },
    data: { status: 'failed', finishedAt: now, message: 'The refresh never reported back. It may have crashed.' },
  });
}

export async function refreshStatus(now = new Date()) {
  await expireStale(now);
  const [lastStart, running, scheduled, recent, duration, lastRun] = await Promise.all([
    lastCouponStart(),
    prisma.dealRefreshRequest.findFirst({ where: { status: 'running' }, orderBy: { startedAt: 'desc' } }),
    prisma.dealRefreshRequest.findFirst({ where: { status: 'scheduled' }, orderBy: { runAt: 'asc' } }),
    prisma.dealRefreshRequest.findMany({ where: { status: { not: 'scheduled' } }, orderBy: { createdAt: 'desc' }, take: 6 }),
    typicalDurationSec(),
    prisma.dealSyncRun.findFirst({ where: { kind: 'coupons', finishedAt: { not: null } }, orderBy: { startedAt: 'desc' } }),
  ]);
  const earliest = lastStart ? new Date(lastStart.getTime() + MIN_GAP_MS) : now;
  const { next } = nightlySlots(now);
  const nightlySkipReason = nightlySkip(next, lastStart, scheduled);
  const timerSeen = lastPollAt ? now - lastPollAt < 5 * 60_000 : now - bootedAt < 3 * 60_000;
  return {
    minGapHours: MIN_GAP_MS / 3600_000,
    typicalDurationSec: duration,
    lastRun: lastRun && {
      startedAt: lastRun.startedAt, finishedAt: lastRun.finishedAt, status: lastRun.status,
      coupons: lastRun.counts?.received ?? null,
    },
    running: running && {
      id: running.id, kind: running.kind, startedAt: running.startedAt,
      expectedFinishAt: new Date(running.startedAt.getTime() + duration * 1000),
      secondsLeft: Math.max(0, Math.round((running.startedAt.getTime() + duration * 1000 - now) / 1000)),
    },
    scheduled: scheduled && { id: scheduled.id, runAt: scheduled.runAt, due: scheduled.runAt <= now },
    nextNightly: { runAt: next, skipReason: nightlySkipReason },
    earliestAllowed: earliest > now ? earliest : now,
    canSchedule: !running && !scheduled,
    timer: { seen: Boolean(timerSeen), lastPollAt },
    recent: recent.map((r) => ({
      id: r.id, kind: r.kind, status: r.status, runAt: r.runAt, startedAt: r.startedAt, finishedAt: r.finishedAt, message: r.message,
    })),
  };
}

// Why the nightly run at `slot` would be skipped, or null if it will run.
function nightlySkip(slot, lastStart, scheduled) {
  if (lastStart && slot - lastStart < MIN_GAP_MS) return 'A refresh already ran within 4 hours of it.';
  if (scheduled && Math.abs(scheduled.runAt - slot) < MIN_GAP_MS) return 'Your scheduled refresh covers it.';
  return null;
}

// ---- user actions -------------------------------------------------------------

export async function scheduleRefresh({ runAt, userId }, now = new Date()) {
  await expireStale(now);
  const when = runAt ? new Date(runAt) : now;
  if (Number.isNaN(when.getTime())) throw new HttpError(400, 'That time is not valid.', 'VALIDATION_ERROR');
  if (when < new Date(now - 60_000)) throw new HttpError(400, 'Pick a time in the future.', 'VALIDATION_ERROR');
  if (when - now > MAX_AHEAD_MS) throw new HttpError(400, 'Pick a time within the next 7 days.', 'VALIDATION_ERROR');
  const busy = await prisma.dealRefreshRequest.findFirst({ where: { status: { in: ['running', 'scheduled'] } } });
  if (busy) {
    throw new HttpError(409, busy.status === 'running' ? 'A refresh is running now.' : 'A refresh is already scheduled. Cancel it first to pick a new time.', 'REFRESH_BUSY');
  }
  const lastStart = await lastCouponStart();
  const earliest = lastStart ? new Date(lastStart.getTime() + MIN_GAP_MS) : null;
  const start = when < now ? now : when;
  if (earliest && start < earliest) {
    throw new HttpError(429, 'Coupons can refresh once every 4 hours. Pick a later time.', 'REFRESH_TOO_SOON');
  }
  return prisma.dealRefreshRequest.create({ data: { kind: 'manual', runAt: start, status: 'scheduled', requestedBy: userId } });
}

export async function cancelRefresh(id) {
  const r = await prisma.dealRefreshRequest.updateMany({
    where: { id, status: 'scheduled' },
    data: { status: 'canceled', finishedAt: new Date() },
  });
  if (!r.count) throw new HttpError(404, 'No scheduled refresh to cancel.', 'NOT_FOUND');
  return { canceled: true };
}

// ---- host timer ---------------------------------------------------------------

// Called every minute by the host timer. Returns { run: true, id } when the
// worker should start now; the request is marked running before it returns.
export async function claimRefresh(now = new Date()) {
  lastPollAt = now;
  await expireStale(now);
  if (await prisma.dealRefreshRequest.findFirst({ where: { status: 'running' } })) return { run: false, reason: 'running' };
  const lastStart = await lastCouponStart();
  const gapOk = !lastStart || now - lastStart >= MIN_GAP_MS;

  const due = await prisma.dealRefreshRequest.findFirst({ where: { status: 'scheduled', runAt: { lte: now } }, orderBy: { runAt: 'asc' } });
  if (due) {
    if (!gapOk) {
      // Only reachable if someone ran the worker by hand in between.
      await prisma.dealRefreshRequest.update({ where: { id: due.id }, data: { status: 'skipped', finishedAt: now, message: 'Skipped: coupons were refreshed less than 4 hours before.' } });
      return { run: false, reason: 'too_soon' };
    }
    const claimed = await prisma.dealRefreshRequest.updateMany({ where: { id: due.id, status: 'scheduled' }, data: { status: 'running', startedAt: now } });
    return claimed.count ? { run: true, id: due.id, kind: 'manual' } : { run: false, reason: 'race' };
  }

  // Nightly: once per slot, within its pickup window.
  const { last: slot } = nightlySlots(now);
  if (now - slot > NIGHTLY_WINDOW_MS) return { run: false, reason: 'idle' };
  const existing = await prisma.dealRefreshRequest.findFirst({ where: { kind: 'nightly', runAt: slot } });
  if (existing) return { run: false, reason: 'idle' };
  const scheduled = await prisma.dealRefreshRequest.findFirst({ where: { status: 'scheduled' }, orderBy: { runAt: 'asc' } });
  const skip = nightlySkip(slot, lastStart, scheduled);
  if (skip) {
    await prisma.dealRefreshRequest.create({ data: { kind: 'nightly', runAt: slot, status: 'skipped', finishedAt: now, message: `Skipped: ${skip}` } });
    return { run: false, reason: 'nightly_skipped' };
  }
  const r = await prisma.dealRefreshRequest.create({ data: { kind: 'nightly', runAt: slot, status: 'running', startedAt: now } });
  return { run: true, id: r.id, kind: 'nightly' };
}

const EXIT_MESSAGES = {
  2: 'The Kroger login expired. Public coupons were still read if allowed.',
  3: 'The worker failed. Check the log on the server.',
  4: 'The worker could not reach NutriLabs.',
  5: 'No screen was available for the browser.',
};

export async function finishRefresh(id, exitCode, now = new Date()) {
  const code = Number(exitCode);
  const status = code === 0 || code === 2 ? 'done' : 'failed';
  const r = await prisma.dealRefreshRequest.updateMany({
    where: { id, status: 'running' },
    data: { status, finishedAt: now, exitCode: Number.isFinite(code) ? code : null, message: code === 0 ? null : (EXIT_MESSAGES[code] || `The worker exited with code ${exitCode}.`) },
  });
  return { updated: r.count };
}
