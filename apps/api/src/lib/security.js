import crypto from 'node:crypto';

/** Constant-time string comparison (for shared secrets like PRICER_TOKEN). */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Tokens that are emailed (password reset) are stored only as this hash. */
export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

/** The URL if it is http(s), else null — keeps javascript:/data: URLs out of links. */
export function safeHttpUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Fixed-window rate limiter kept in memory (one API process). `key` picks what is
 * counted: the client IP by default, or e.g. the email being tried.
 */
export function rateLimit({ windowMs, max, key = (req) => req.ip, message = 'Too many requests — please wait and try again' }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, Math.min(windowMs, 60_000)).unref();

  return (req, res, next) => {
    const k = key(req);
    if (k == null) return next();
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(k, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ data: null, error: { message, code: 'RATE_LIMITED' } });
    }
    next();
  };
}

const MINUTE = 60_000;

// Shared limiter instances: each keeps its own counters.
export const limits = {
  // Credential guessing: per IP, and per target email so a botnet can't spread out.
  loginByIp: rateLimit({ windowMs: 15 * MINUTE, max: 20 }),
  loginByEmail: rateLimit({ windowMs: 15 * MINUTE, max: 8, key: (req) => (req.body?.email ? `e:${normalizeEmail(req.body.email)}` : null) }),
  register: rateLimit({ windowMs: 60 * MINUTE, max: 5 }),
  passwordReset: rateLimit({ windowMs: 60 * MINUTE, max: 5 }),
  passwordResetByEmail: rateLimit({ windowMs: 60 * MINUTE, max: 3, key: (req) => (req.body?.email ? `e:${normalizeEmail(req.body.email)}` : null) }),
  // Expensive upstream calls (local LLM, USDA quota), per signed-in user.
  ai: rateLimit({ windowMs: 10 * MINUTE, max: 30, key: (req) => `u:${req.user?.userId ?? req.ip}`, message: 'AI request limit reached — try again in a few minutes' }),
  external: rateLimit({ windowMs: MINUTE, max: 60, key: (req) => `u:${req.user?.userId ?? req.ip}` }),
  // Everything else: a generous per-IP ceiling against floods.
  global: rateLimit({ windowMs: MINUTE, max: 600 }),
};
