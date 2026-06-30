export function caloriesFromMacros(protein, carbs, fat) {
  return protein * 4 + carbs * 4 + fat * 9;
}

export function macroPercents(protein, carbs, fat) {
  const total = caloriesFromMacros(protein, carbs, fat);
  if (total === 0) return { proteinPct: 0, carbsPct: 0, fatPct: 0 };
  return {
    proteinPct: Math.round((protein * 4 / total) * 100),
    carbsPct: Math.round((carbs * 4 / total) * 100),
    fatPct: Math.round((fat * 9 / total) * 100),
  };
}
