import fetch from 'node-fetch';
import { macrosFromNutrients, portionsFromDetail } from '../lib/macroCalc.js';

const BASE_URL = 'https://api.nal.usda.gov/fdc/v1';
const DEMO_KEY = 'DEMO_KEY';

function resolveKey(apiKey) {
  return apiKey || DEMO_KEY;
}

async function getJson(url) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    return { error: true, code: 'USDA_UNAVAILABLE', message: `USDA could not be reached (${err.name === 'TimeoutError' ? 'timed out' : err.message})` };
  }
  const data = await res.json().catch(() => null);
  if (res.status === 429) return { error: true, code: 'USDA_RATE_LIMITED', message: 'USDA rate limit reached — add a free API key in Settings → Connections' };
  if (!res.ok || !data) return { error: true, code: 'USDA_ERROR', message: data?.error?.message ?? `USDA returned HTTP ${res.status}` };
  return data;
}

/**
 * Generic foods (Foundation + SR Legacy) for a query: [{ fdcId, description, dataType, per100g }].
 * Returns an error object when USDA fails.
 */
export async function searchFoods(query, apiKey, pageSize = 50) {
  const url = `${BASE_URL}/foods/search?query=${encodeURIComponent(query)}&dataType=Foundation,SR%20Legacy&pageSize=${pageSize}&api_key=${resolveKey(apiKey)}`;
  const data = await getJson(url);
  if (data.error) return data;
  return (data.foods ?? []).map((f) => ({
    fdcId: f.fdcId,
    description: f.description,
    dataType: f.dataType,
    per100g: macrosFromNutrients(f.foodNutrients),
  }));
}

/** One food with per-100 g macros and household portions, or an error object. */
export async function getFood(fdcId, apiKey) {
  const data = await getJson(`${BASE_URL}/food/${encodeURIComponent(fdcId)}?api_key=${resolveKey(apiKey)}`);
  if (data.error) return data;
  return {
    fdcId: data.fdcId,
    description: data.description,
    dataType: data.dataType,
    per100g: macrosFromNutrients(data.foodNutrients),
    portions: portionsFromDetail(data),
  };
}

/** Top 5 foods for a name, flattened: [{ fdcId, description, calories, proteinG, carbsG, fatG }]. */
export async function searchFood(name, apiKey) {
  const foods = await searchFoods(name, apiKey, 5);
  if (foods.error) return [];
  return foods.map((f) => ({ fdcId: f.fdcId, description: f.description, ...(f.per100g ?? {}) }));
}

export async function getFoodDetail(fdcId, apiKey) {
  const food = await getFood(fdcId, apiKey);
  return food.error ? null : food;
}

export function extractMacrosPer100g(food) {
  return food?.per100g ?? null;
}
