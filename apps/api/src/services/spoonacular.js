import fetch from 'node-fetch';
import prisma from '../lib/prisma.js';

const BASE_URL = 'https://api.spoonacular.com';

// Last known quota from Spoonacular response headers
const quota = { pointsUsed: null, pointsLeft: null, pointsUsedByRequest: null };

function parseQuotaHeaders(headers) {
  const request = parseFloat(headers.get('x-api-quota-request'));
  const used = parseFloat(headers.get('x-api-quota-used'));
  const left = parseFloat(headers.get('x-api-quota-left'));
  if (!isNaN(used)) quota.pointsUsed = used;
  if (!isNaN(left)) quota.pointsLeft = left;
  if (!isNaN(request)) quota.pointsUsedByRequest = request;
}

export function getLastQuota() {
  return { ...quota };
}

export async function searchRecipes(params, apiKey) {
  if (!apiKey) {
    return { error: true, code: 'SPOONACULAR_NOT_CONFIGURED' };
  }

  const url = new URL(`${BASE_URL}/recipes/complexSearch`);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('number', '12');
  url.searchParams.set('addRecipeNutrition', 'true');
  url.searchParams.set('addRecipeInformation', 'true');
  if (params.query) url.searchParams.set('query', params.query);
  if (params.type) url.searchParams.set('type', params.type.toLowerCase());
  if (params.diet) url.searchParams.set('diet', params.diet);
  if (params.maxReadyTime) url.searchParams.set('maxReadyTime', String(params.maxReadyTime));
  if (params.maxPricePerServing) url.searchParams.set('maxPricePerServing', String(params.maxPricePerServing));

  const res = await fetch(url.toString());
  parseQuotaHeaders(res.headers);
  const data = await res.json();

  const results = (data.results ?? []).map((r) => {
    const nutrients = r.nutrition?.nutrients ?? [];
    const find = (name) => nutrients.find((n) => n.name === name)?.amount ?? null;
    return {
      id: r.id,
      title: r.title,
      image: r.image,
      readyInMinutes: r.readyInMinutes,
      pricePerServing: r.pricePerServing,
      calories: find('Calories'),
      proteinG: find('Protein'),
      carbsG: find('Carbohydrates'),
      fatG: find('Fat'),
      diets: r.diets ?? [],
      cuisines: r.cuisines ?? [],
    };
  });

  return { results, quota: getLastQuota() };
}

export async function getRecipeDetail(spoonacularId, apiKey) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const cached = await prisma.recipeImportCache.findUnique({
    where: { spoonacularId },
  });
  if (cached && cached.fetchedAt > sevenDaysAgo) {
    return JSON.parse(cached.rawJson);
  }

  if (!apiKey) {
    return { error: true, code: 'SPOONACULAR_NOT_CONFIGURED' };
  }

  const url = `${BASE_URL}/recipes/${spoonacularId}/information?includeNutrition=true&apiKey=${apiKey}`;
  const res = await fetch(url);
  parseQuotaHeaders(res.headers);
  const data = await res.json();
  const rawJson = JSON.stringify(data);

  await prisma.recipeImportCache.upsert({
    where: { spoonacularId },
    update: { rawJson, fetchedAt: new Date() },
    create: { spoonacularId, rawJson },
  });

  return data;
}

export function mapToNutriLabsRecipe(spoonacularData) {
  const d = spoonacularData;
  const nutrients = d.nutrition?.nutrients ?? [];
  const findNutrient = (name) => nutrients.find((n) => n.name === name)?.amount ?? null;

  const ingredientsArr = (d.extendedIngredients ?? []).map((ing) => ({
    name: ing.name,
    quantity: ing.measures?.us?.amount ?? null,
    unit: ing.measures?.us?.unitShort ?? null,
  }));

  const steps = d.analyzedInstructions?.[0]?.steps ?? [];
  const instructions = steps.map((s) => s.step).join('\n') || null;

  const dishTypes = (d.dishTypes ?? []).map((t) => t.toLowerCase());
  let mealType = 'DINNER';
  if (dishTypes.includes('breakfast') || dishTypes.includes('morning meal') || dishTypes.includes('brunch')) {
    mealType = 'BREAKFAST';
  } else if (dishTypes.includes('lunch') || dishTypes.includes('salad') || dishTypes.includes('soup')) {
    mealType = 'LUNCH';
  }

  const tags = [];
  if (d.vegan) tags.push('vegan');
  if (d.vegetarian) tags.push('vegetarian');
  if (d.glutenFree) tags.push('gluten-free');
  if (d.dairyFree) tags.push('dairy-free');
  for (const cuisine of (d.cuisines ?? [])) tags.push(cuisine);

  const spicyCuisines = ['Indian', 'Thai', 'Mexican', 'Korean', 'Vietnamese'];
  const hasSpicyCuisine = (d.cuisines ?? []).some((c) => spicyCuisines.includes(c));
  const isKidFriendly = (d.veryHealthy === true || d.cheap === true) && !hasSpicyCuisine;

  return {
    name: d.title,
    prepTimeMinutes: d.readyInMinutes ?? null,
    costPerServing: d.pricePerServing != null ? d.pricePerServing / 100 : null,
    calories: findNutrient('Calories') != null ? Math.round(findNutrient('Calories')) : null,
    proteinG: findNutrient('Protein') != null ? Math.round(findNutrient('Protein')) : null,
    carbsG: findNutrient('Carbohydrates') != null ? Math.round(findNutrient('Carbohydrates')) : null,
    fatG: findNutrient('Fat') != null ? Math.round(findNutrient('Fat')) : null,
    mealType,
    ingredients: ingredientsArr,
    instructions,
    tags,
    isKidFriendly,
    source: 'SPOONACULAR',
    spoonacularId: d.id,
  };
}
