import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

export async function requireAuth(req, res, next) {
  let token = req.cookies?.auth_token;

  if (!token) {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) token = auth.slice(7);
  }

  if (!token) {
    return res.status(401).json({
      data: null,
      error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({
      data: null,
      error: { message: 'Invalid or expired token', code: 'UNAUTHORIZED' },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true, email: true, isActive: true, isAdmin: true, passwordChangedAt: true },
  });

  if (!user || !user.isActive) {
    return res.status(401).json({
      data: null,
      error: { message: 'Account is inactive', code: 'ACCOUNT_DEACTIVATED' },
    });
  }

  if (user.passwordChangedAt) {
    const tokenIssuedAt = decoded.iat * 1000;
    if (tokenIssuedAt < user.passwordChangedAt.getTime()) {
      return res.status(401).json({
        data: null,
        error: { message: 'Session expired, please log in again', code: 'UNAUTHORIZED' },
      });
    }
  }

  req.user = { userId: user.id, email: user.email, isAdmin: user.isAdmin };
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ data: null, error: { message: 'Only the instance admin can do that', code: 'FORBIDDEN' } });
  }
  next();
}

const COOKIE_BASE = { httpOnly: true, sameSite: 'strict', path: '/' };
const SESSION_DAYS = 30;

export function signSession(user) {
  return jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: `${SESSION_DAYS}d` });
}

/**
 * Set the session cookie. Secure whenever the request arrived over HTTPS (the
 * Cloudflare tunnel), so plain-http LAN access on :1042 still works.
 */
export function setSessionCookie(req, res, user) {
  res.cookie('auth_token', signSession(user), {
    ...COOKIE_BASE,
    secure: req.secure,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(req, res) {
  res.clearCookie('auth_token', { ...COOKIE_BASE, secure: req.secure });
}
