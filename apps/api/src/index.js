import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import { errorHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import accountRouter from './routes/account.js';
import profilesRouter from './routes/profiles.js';
import recipesRouter from './routes/recipes.js';
import recipesExternalRouter from './routes/recipes.external.js';
import recipesMealDbRouter from './routes/recipes.mealdb.js';
import mealplansRouter from './routes/mealplans.js';
import settingsRouter from './routes/settings.js';
import ollamaRouter, { aiRouter } from './routes/ollama.js';
import nutritionRouter from './routes/nutrition.js';
import groceryRouter from './routes/grocery.js';
import budgetRouter from './routes/budget.js';
import eatingoutRouter from './routes/eatingout.js';
import pantryInventoryRouter from './routes/pantryInventory.js';
import pricerRouter from './routes/pricer.js';
import { startPurgeJob } from './jobs/purgeAccounts.js';
import { limits } from './lib/security.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be set to at least 32 random characters — refusing to start.');
  process.exit(1);
}

const app = express();
const PORT = 3001;

app.disable('x-powered-by');
// Requests arrive through nginx (and the Cloudflare tunnel) on private Docker
// networks: trust those hops so req.ip is the real client and req.secure
// reflects the original HTTPS.
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  });
  next();
});
app.use(limits.global);
app.use(cors({
  origin: process.env.BASE_URL || 'http://localhost:1042',
  credentials: true,
}));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

app.use('/api', healthRouter);
// Before the routers mounted at /api that require a user session: the feed
// authenticates with the pricer's shared token instead.
app.use('/api/pricer', pricerRouter);
app.use('/api', authRouter);
app.use('/api/account', accountRouter);
app.use('/api/profiles', profilesRouter);
app.use('/api/recipes/mealdb', recipesMealDbRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api/recipes', recipesExternalRouter);
app.use('/api/mealplans', mealplansRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/ollama', ollamaRouter);
app.use('/api', aiRouter);
app.use('/api/nutrition', nutritionRouter);
app.use('/api/grocery', groceryRouter);
app.use('/api/budget', budgetRouter);
app.use('/api/eatingout', eatingoutRouter);
app.use('/api/pantry-inventory', pantryInventoryRouter);

app.use(errorHandler);

startPurgeJob();

app.listen(PORT, () => {
  console.log(`NutriLabs API running on port ${PORT}`);
});
