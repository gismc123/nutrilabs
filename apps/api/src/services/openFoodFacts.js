import fetch from 'node-fetch';

const BASE = 'https://world.openfoodfacts.org';
const HEADERS = { 'User-Agent': 'NutriLabs/1.0 (self-hosted meal planner)' };

function parseServingSizeG(product) {
  const direct = product.nutriments?.['serving_size'];
  if (direct) return parseFloat(direct) || null;
  const s = product.serving_size || '';
  const match = s.match(/(\d+(?:\.\d+)?)\s*g/i);
  return match ? parseFloat(match[1]) : null;
}

function macroFromNutriments(nutriments, key100, keyServing, servingSizeG) {
  if (nutriments?.[keyServing] != null) return parseFloat(nutriments[keyServing]);
  if (nutriments?.[key100] != null && servingSizeG) {
    return parseFloat(nutriments[key100]) * (servingSizeG / 100);
  }
  return null;
}

function extractProduct(code, product) {
  const servingSizeG = parseServingSizeG(product);
  const n = product.nutriments || {};
  return {
    name: product.product_name_en || product.product_name || null,
    brand: product.brands || null,
    barcode: code,
    openFoodFactsId: code,
    imageUrl: product.image_front_url || product.image_url || null,
    servingSize: product.serving_size || null,
    servingSizeG: servingSizeG,
    ingredients: product.ingredients_text_en || product.ingredients_text || null,
    calories: macroFromNutriments(n, 'energy-kcal_100g', 'energy-kcal_serving', servingSizeG),
    proteinG: macroFromNutriments(n, 'proteins_100g', 'proteins_serving', servingSizeG),
    carbsG: macroFromNutriments(n, 'carbohydrates_100g', 'carbohydrates_serving', servingSizeG),
    fatG: macroFromNutriments(n, 'fat_100g', 'fat_serving', servingSizeG),
  };
}

export async function lookupBarcode(barcode) {
  try {
    const res = await fetch(`${BASE}/api/v0/product/${barcode}.json`, { headers: HEADERS });
    const json = await res.json();
    if (json.status !== 1 || !json.product) return null;
    return extractProduct(barcode, json.product);
  } catch {
    return null;
  }
}

export async function searchProduct(query) {
  try {
    const url = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=10`;
    const res = await fetch(url, { headers: HEADERS });
    const json = await res.json();
    return (json.products || []).map((p) => ({
      barcode: p.code || null,
      name: p.product_name_en || p.product_name || null,
      brand: p.brands || null,
      imageUrl: p.image_front_url || p.image_url || null,
      calories: p.nutriments?.['energy-kcal_serving'] || p.nutriments?.['energy-kcal_100g'] || null,
    }));
  } catch {
    return [];
  }
}
