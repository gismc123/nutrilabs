import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from './db.js';
import { config } from './config.js';
import { asyncHandler, HttpError, ok } from './lib/http.js';

const COOKIE = 'kd_session';

// Behind the Cloudflare tunnel every request arrives from cloudflared, so key
// limits on the visitor address Cloudflare reports.
export const clientKey = (req) => req.headers['cf-connecting-ip'] || req.ip;

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: clientKey,
  skipSuccessfulRequests: true,
  message: { data: null, error: { message: 'Too many sign-in attempts. Try again in 15 minutes.', code: 'RATE_LIMITED' } },
});

const credentials = z.object({
  username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9_.@-]+$/, 'letters, numbers, and _ . @ - only'),
  password: z.string().min(10, 'at least 10 characters').max(200),
});

function isHttps(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function setSession(req, res, user) {
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps(req),
    maxAge: config.sessionDays * 86_400_000,
    path: '/',
  });
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) throw new HttpError(401, 'Sign in required', 'UNAUTHORIZED');
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new HttpError(401, 'Your session expired. Sign in again.', 'UNAUTHORIZED');
    }
    const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
    if (!user) throw new HttpError(401, 'Sign in required', 'UNAUTHORIZED');
    req.user = { id: user.id, username: user.username, isAdmin: user.isAdmin };
    next();
  } catch (e) {
    next(e);
  }
}

let dummy;
const dummyHash = () => (dummy ??= bcrypt.hashSync('not-a-real-password', 12));

const publicUser = (u) => ({ id: u.id, username: u.username, isAdmin: u.isAdmin });

export const authRouter = Router();

// Tells the login screen whether to show first-run setup instead.
authRouter.get('/status', asyncHandler(async (req, res) => {
  ok(res, { needsSetup: (await prisma.user.count()) === 0 });
}));

authRouter.post('/setup', loginLimiter, asyncHandler(async (req, res) => {
  const body = credentials.parse(req.body);
  const user = await prisma.$transaction(async (tx) => {
    if ((await tx.user.count()) > 0) throw new HttpError(409, 'Setup is already done. Sign in instead.', 'ALREADY_SETUP');
    return tx.user.create({ data: { username: body.username, passwordHash: await bcrypt.hash(body.password, 12), isAdmin: true } });
  }, { isolationLevel: 'Serializable' });
  setSession(req, res, user);
  ok(res, publicUser(user));
}));

authRouter.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const body = z.object({ username: z.string().trim().max(40), password: z.string().max(200) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { username: body.username } });
  // Compare against a dummy hash for unknown users so timing does not reveal names.
  const hash = user?.passwordHash || dummyHash();
  const valid = await bcrypt.compare(body.password, hash);
  if (!user || !valid) throw new HttpError(401, 'Wrong username or password', 'BAD_CREDENTIALS');
  setSession(req, res, user);
  ok(res, publicUser(user));
}));

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  ok(res, true);
});

authRouter.get('/me', requireAuth, (req, res) => ok(res, req.user));

authRouter.post('/password', requireAuth, loginLimiter, asyncHandler(async (req, res) => {
  const body = z.object({ current: z.string().max(200), next: credentials.shape.password }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!(await bcrypt.compare(body.current, user.passwordHash))) throw new HttpError(400, 'Current password is wrong', 'BAD_CREDENTIALS');
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.next, 12) } });
  ok(res, true);
}));

// Admin adds another household member. There is no open registration.
authRouter.post('/users', requireAuth, asyncHandler(async (req, res) => {
  if (!req.user.isAdmin) throw new HttpError(403, 'Only the admin can add users', 'FORBIDDEN');
  const body = credentials.parse(req.body);
  if (await prisma.user.findUnique({ where: { username: body.username } })) throw new HttpError(409, 'That username is taken', 'TAKEN');
  const user = await prisma.user.create({ data: { username: body.username, passwordHash: await bcrypt.hash(body.password, 12) } });
  ok(res, publicUser(user));
}));
