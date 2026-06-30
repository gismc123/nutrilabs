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
import mealplansRouter from './routes/mealplans.js';
import settingsRouter from './routes/settings.js';
import ollamaRouter, { aiRouter } from './routes/ollama.js';
import nutritionRouter from './routes/nutrition.js';
import groceryRouter from './routes/grocery.js';
import budgetRouter from './routes/budget.js';
import eatingoutRouter from './routes/eatingout.js';
import pantryInventoryRouter from './routes/pantryInventory.js';
import { startPurgeJob } from './jobs/purgeAccounts.js';

const app = express();
const PORT = 3001;

app.use(cors({
  origin: process.env.BASE_URL || 'http://localhost:1042',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

app.use('/api', healthRouter);
app.use('/api', authRouter);
app.use('/api/account', accountRouter);
app.use('/api/profiles', profilesRouter);
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
