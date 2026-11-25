import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { authRouter, requireAuth, clientKey } from './auth.js';
import { api } from './routes/api.js';
import { internal } from './routes/internal.js';
import { errorHandler } from './lib/http.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(here, '..', 'public');

export function createPublicApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback, uniquelocal');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https://www.kroger.com', 'https://*.kroger.com', 'https://*.softcoin.com'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: false, // Cloudflare sets HSTS on the public hostname
  }));
  app.use(rateLimit({ windowMs: 60_000, limit: 300, keyGenerator: clientKey, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  app.use('/api/auth', authRouter);
  app.use('/api', requireAuth, api);
  app.use('/api', (req, res) => res.status(404).json({ data: null, error: { message: 'Not found', code: 'NOT_FOUND' } }));
  // The internal ingest path is never served on the public port.
  app.use('/internal', (req, res) => res.status(404).end());

  // The built web app. It holds no data; every data call above needs a session.
  app.use(express.static(PUBLIC_DIR, {
    index: false,
    dotfiles: 'deny',
    setHeaders(res, file) {
      if (/\/assets\//.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'), (err) => err && res.status(404).end());
  });
  app.use(errorHandler);
  return app;
}

export function createInternalApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(internal);
  app.use(errorHandler);
  return app;
}
