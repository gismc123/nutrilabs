// Map Kroger department names (shared by products and coupons) to bundle groups.
const GROUPS = {
  produce: ['Produce'],
  protein: ['Meat & Seafood', 'Deli'],
  dairy: ['Dairy'],
  frozen: ['Frozen'],
  bakery: ['Bakery'],
  pantry: ['Canned & Packaged', 'Pasta', 'Baking Goods', 'Condiment & Sauces', 'Breakfast', 'International', 'Snacks', 'Candy', 'Natural & Organic'],
  drinks: ['Beverages'],
};
export const GROUP_ORDER = ['produce', 'protein', 'dairy', 'pantry', 'frozen', 'bakery', 'drinks'];
const BY_DEPT = Object.fromEntries(Object.entries(GROUPS).flatMap(([g, depts]) => depts.map((d) => [d, g])));

export const GROUP_LABELS = {
  produce: 'Produce', protein: 'Protein', dairy: 'Dairy and eggs', pantry: 'Pantry',
  frozen: 'Frozen', bakery: 'Bakery', drinks: 'Drinks', other: 'Other',
};

// Natural & Organic is a weak signal: "Natural & Organic, Dairy" is dairy.
export function groupFor(categories = []) {
  const strong = categories.filter((c) => c !== 'Natural & Organic').map((c) => BY_DEPT[c]).filter(Boolean);
  for (const g of GROUP_ORDER) if (strong.includes(g)) return g;
  if (categories.includes('Natural & Organic')) return 'pantry';
  return 'other';
}

const NON_FOOD = new Set(['Health', 'Personal Care', 'Beauty', 'Baby', 'Pet Care', 'Cleaning Products', 'Hardware',
  'Garden & Patio', 'Home Decor', 'Tobacco', 'Gift Cards', 'Sporting Goods', 'Adult Beverage']);

// Grocery departments a meal budget should spend on. "Natural & Organic" also
// covers vitamins and soap, so any non-food department wins.
export function isFood(categories = []) {
  if (categories.some((c) => NON_FOOD.has(c))) return false;
  return categories.some((c) => BY_DEPT[c]);
}
