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
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({
      data: null,
      error: { message: 'Invalid or expired token', code: 'UNAUTHORIZED' },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true, email: true, isActive: true, passwordChangedAt: true },
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

  req.user = { userId: decoded.userId, email: decoded.email };
  next();
}
