import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { ollamaState } from '../lib/ollamaState.js';
import { testConnection } from '../services/ollama.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

const DEFAULT_OLLAMA_HOST = 'http://192.168.1.190:11434';
const CACHE_TTL_MS = 60_000;

router.get('/health', asyncHandler(async (req, res) => {
  let dbConnected = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbConnected = true;
  } catch {}

  // Refresh ollamaState in background if cache is stale
  const stale = Date.now() - ollamaState.lastCheckedAt > CACHE_TTL_MS;
  if (stale) {
    // Fire-and-forget so health responds immediately
    testConnection(DEFAULT_OLLAMA_HOST).then((result) => {
      ollamaState.connected = result.connected;
      ollamaState.lastCheckedAt = Date.now();
    }).catch(() => {});
  }

  res.json({
    data: {
      status: 'ok',
      dbConnected,
      ollamaConnected: ollamaState.connected,
      spoonacularConnected: !!(process.env.SPOONACULAR_API_KEY),
      usdaConnected: true,
      version: '1.0.0',
    },
    error: null,
  });
}));

export default router;
