import fetch from 'node-fetch';

const BASE_URL = 'https://api.nal.usda.gov/fdc/v1';
const DEMO_KEY = 'DEMO_KEY';

function resolveKey(apiKey) {
  return apiKey || DEMO_KEY;
}

function extractMacrosFromNutrients(nutrients) {
  const find = (name) => nutrients.find((n) => n.nutrientName === name)?.value ?? null;
  return {
    calories: find('Energy'),
    proteinG: find('Protein'),
    carbsG: find('Carbohydrate, by difference'),
    fatG: find('Total lipid (fat)'),
  };
}

export async function searchFood(name, apiKey) {
  try {
    const key = resolveKey(apiKey);
    const url = `${BASE_URL}/foods/search?query=${encodeURIComponent(name)}&dataType=Foundation,SR%20Legacy&pageSize=5&api_key=${key}`;
    const res = await fetch(url);
    const data = await res.json();

    return (data.foods ?? []).slice(0, 5).map((food) => {
      const nutrients = food.foodNutrients ?? [];
      const find = (name) => nutrients.find((n) => n.nutrientName === name)?.value ?? null;
      return {
        fdcId: food.fdcId,
        description: food.description,
        calories: find('Energy'),
        proteinG: find('Protein'),
        carbsG: find('Carbohydrate, by difference'),
        fatG: find('Total lipid (fat)'),
      };
    });
  } catch {
    return [];
  }
}

export async function getFoodDetail(fdcId, apiKey) {
  try {
    const key = resolveKey(apiKey);
    const res = await fetch(`${BASE_URL}/food/${fdcId}?api_key=${key}`);
    return await res.json();
  } catch {
    return null;
  }
}

export function extractMacrosPer100g(foodDetail) {
  if (!foodDetail) return null;
  try {
    const nutrients = foodDetail.foodNutrients ?? [];
    const macros = extractMacrosFromNutrients(
      nutrients.map((n) => ({
        nutrientName: n.nutrient?.name ?? n.nutrientName,
        value: n.amount ?? n.value,
      }))
    );
    if (Object.values(macros).every((v) => v === null)) return null;
    return macros;
  } catch {
    return null;
  }
}
