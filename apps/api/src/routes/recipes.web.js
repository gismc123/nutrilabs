import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { limits } from '../lib/security.js';
import { settingsForUser } from '../lib/instanceSettings.js';
import {
  fetchPage, extractJsonLdRecipe, recipeFromJsonLd, mapSchemaRecipe, pageText, parseIngredientLine,
  mealTypeFrom, metaContent, ImportError,
} from '../services/recipeScraper.js';
import { extractRecipeFromText } from '../services/ollama.js';
import { safeImageUrl } from '../lib/security.js';

const router = Router();
router.use(requireAuth, limits.external);

const previewSchema = z.object({
  url: z.string().trim().max(2000).optional(),
  text: z.string().trim().min(20).max(30_000).optional(),
  // From the "Save to NutriLabs" bookmarklet: the page's JSON-LD blocks, read in the user's browser.
  jsonld: z.array(z.string().max(300_000)).max(20).optional(),
  pageUrl: z.string().trim().max(2000).optional(),
}).refine((v) => v.url || v.text || v.jsonld?.length, 'Paste a recipe link or the recipe text');

const httpOnly = (u) => {
  try {
    const url = new URL(u);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

/** Turn the AI extractor's answer into the same shape as a structured import. */
function mapAiRecipe(ai, { sourceUrl = null, imageUrl = null } = {}) {
  const ingredients = (ai.ingredientLines ?? []).map(parseIngredientLine).filter(Boolean).slice(0, 100);
  const steps = (ai.instructions ?? []).map((s) => String(s).trim()).filter(Boolean);
  const name = String(ai.name ?? '').trim().slice(0, 200);
  return {
    name,
    description: ai.description ? String(ai.description).trim().slice(0, 2000) : null,
    mealType: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'].includes(ai.mealType) ? ai.mealType : mealTypeFrom([], name),
    servings: Math.min(100, Math.max(1, Math.round(Number(ai.servings) || 4))),
    prepTimeMinutes: Number(ai.totalTimeMinutes) > 0 ? Math.round(Number(ai.totalTimeMinutes)) : null,
    calories: null, proteinG: null, carbsG: null, fatG: null,
    instructions: steps.map((s, i) => `${i + 1}. ${s.replace(/^\d+[.)]\s*/, '')}`).join('\n').slice(0, 20000) || null,
    imageUrl,
    tags: [],
    isKidFriendly: true,
    ingredients,
    sourceUrl,
  };
}

// POST /api/recipes/web/preview  { url } or { text }
// Reads a recipe without saving it; the client shows it for review, then saves via POST /api/recipes.
router.post('/preview', asyncHandler(async (req, res) => {
  const parsed = previewSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: { message: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' } });
  }
  const { url, text, jsonld, pageUrl } = parsed.data;

  let recipe = null;
  let method = null;
  let aiInput = text ?? null;
  let page = null;

  if (jsonld?.length) {
    const node = jsonld.map(recipeFromJsonLd).find(Boolean);
    if (!node) {
      return res.status(422).json({ data: null, error: { message: 'That page has no recipe data the bookmark can read — copy the recipe text and paste it instead', code: 'NO_RECIPE' } });
    }
    recipe = mapSchemaRecipe(node, pageUrl ? httpOnly(pageUrl) : null);
    method = 'bookmarklet';
  }

  try {
    if (url && !recipe) {
      page = await fetchPage(url);
      const node = extractJsonLdRecipe(page.html);
      if (node) {
        recipe = mapSchemaRecipe(node, page.finalUrl);
        method = 'structured';
      } else {
        aiInput = pageText(page.html);
      }
    }
  } catch (err) {
    if (!(err instanceof ImportError)) throw err;
    return res.status(422).json({ data: null, error: { message: err.message, code: err.code } });
  }

  if (!recipe) {
    if (!aiInput || aiInput.length < 50) {
      return res.status(422).json({ data: null, error: { message: 'No recipe found on that page', code: 'NO_RECIPE' } });
    }
    const settings = await settingsForUser(req.user.userId);
    const ai = await extractRecipeFromText(aiInput, settings);
    if (ai?.error) {
      return res.status(502).json({
        data: null,
        error: { message: `That page has no standard recipe data, and the AI fallback failed: ${ai.message}`, code: ai.code },
      });
    }
    if (!ai.found || !ai.name || !(ai.ingredientLines ?? []).length) {
      return res.status(422).json({ data: null, error: { message: 'No recipe found on that page', code: 'NO_RECIPE' } });
    }
    recipe = mapAiRecipe(ai, {
      sourceUrl: page?.finalUrl ?? null,
      imageUrl: page ? safeImageUrl(metaContent(page.html, 'og:image')) : null,
    });
    method = 'ai';
  }

  if (!recipe.name || !recipe.ingredients.length) {
    return res.status(422).json({ data: null, error: { message: 'That page\'s recipe had no ingredients', code: 'NO_RECIPE' } });
  }

  const existing = recipe.sourceUrl
    ? await prisma.recipe.findFirst({ where: { userId: req.user.userId, sourceUrl: recipe.sourceUrl }, select: { id: true, name: true } })
    : null;

  res.json({ data: { recipe, method, existingRecipeId: existing?.id ?? null }, error: null });
}));

export default router;
