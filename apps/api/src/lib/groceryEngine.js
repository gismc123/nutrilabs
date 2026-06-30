const PREP_QUALIFIERS = [
  'diced', 'chopped', 'minced', 'sliced', 'shredded', 'grated',
  'cooked', 'frozen', 'canned', 'fresh', 'dried', 'raw',
  'boneless', 'skinless', 'day-old',
];

export function normalizeIngredientName(name) {
  let n = name.toLowerCase();
  n = n.replace(/\(.*?\)/g, '');
  for (const q of PREP_QUALIFIERS) {
    const escaped = q.replace(/-/g, '[- ]');
    n = n.replace(new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, 'g'), ' ');
  }
  return n.replace(/\s+/g, ' ').trim();
}

export function consolidateIngredients(ingredientList) {
  const groups = new Map();

  for (const ing of ingredientList) {
    const key = `${ing.normalizedName}|||${ing.unit ?? ''}`;
    if (groups.has(key)) {
      const existing = groups.get(key);
      if (existing.quantity !== null || ing.quantity !== null) {
        existing.quantity = (existing.quantity ?? 0) + (ing.quantity ?? 0);
      }
      existing._nameFreq[ing.name] = (existing._nameFreq[ing.name] ?? 0) + 1;
    } else {
      groups.set(key, {
        name: ing.name,
        normalizedName: ing.normalizedName,
        quantity: ing.quantity ?? null,
        unit: ing.unit ?? null,
        _nameFreq: { [ing.name]: 1 },
      });
    }
  }

  return Array.from(groups.values()).map((item) => {
    const mostCommon = Object.entries(item._nameFreq).sort((a, b) => b[1] - a[1])[0][0];
    const { _nameFreq, ...rest } = item;
    return { ...rest, name: mostCommon };
  });
}

const CATEGORY_KEYWORDS = {
  PRODUCE: [
    'apple', 'banana', 'berry', 'grape', 'orange', 'lemon', 'lime', 'peach',
    'pear', 'plum', 'mango', 'pineapple', 'melon', 'strawberry', 'blueberry',
    'raspberry', 'tomato', 'potato', 'onion', 'garlic', 'carrot', 'celery',
    'lettuce', 'spinach', 'kale', 'cabbage', 'broccoli', 'cauliflower',
    'bell pepper', 'pepper', 'cucumber', 'zucchini', 'squash', 'asparagus',
    'avocado', 'mushroom', 'corn', 'green bean', 'cilantro', 'parsley',
    'basil', 'ginger', 'jalapeño', 'jalapeno', 'scallion', 'leek', 'shallot',
    'radish', 'beet', 'artichoke', 'eggplant', 'sweet potato', 'yam',
  ],
  PROTEIN: [
    'chicken', 'beef', 'pork', 'turkey', 'lamb', 'fish', 'salmon', 'tuna',
    'shrimp', 'egg', 'bean', 'lentil', 'tofu', 'tempeh', 'sausage', 'bacon',
    'ham', 'tilapia', 'cod', 'halibut', 'steak', 'chickpea',
  ],
  DAIRY: [
    'milk', 'cheese', 'yogurt', 'butter', 'cream', 'sour cream', 'mozzarella',
    'cheddar', 'parmesan', 'feta', 'ricotta', 'cottage cheese', 'half and half',
  ],
  GRAINS: [
    'bread', 'rice', 'pasta', 'oat', 'tortilla', 'quinoa', 'flour',
    'breadcrumb', 'noodle', 'spaghetti', 'penne', 'linguine', 'fettuccine',
    'couscous', 'barley', 'cracker', 'cereal', 'cornmeal', 'panko',
  ],
  CANNED: [
    'broth', 'stock', 'sauce', 'salsa', 'tomato paste', 'coconut milk',
    'diced tomato', 'crushed tomato', 'tomato sauce', 'soy sauce', 'vinegar',
    'oil', 'ketchup', 'mustard', 'mayonnaise', 'mayo', 'pickle', 'olive',
    'capers', 'anchovy', 'sriracha', 'hot sauce', 'worcestershire', 'fish sauce',
    'oyster sauce', 'hoisin', 'teriyaki',
  ],
  FROZEN: ['frozen', 'ice cream', 'edamame'],
};

export function categorizeIngredient(normalizedName) {
  const n = normalizedName.toLowerCase();

  if (n.includes('frozen')) return 'FROZEN';

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === 'FROZEN') continue;
    for (const kw of keywords) {
      if (n.includes(kw)) return category;
    }
  }

  return 'MISC';
}

export function buildGroceryList(mealPlan, pantryStaples) {
  const rawIngredients = [];
  for (const pm of mealPlan.plannedMeals) {
    if (!pm.recipe?.ingredients) continue;
    for (const ing of pm.recipe.ingredients) {
      rawIngredients.push({
        name: ing.name,
        quantity: ing.quantity ? parseFloat(ing.quantity) : null,
        unit: ing.unit ?? null,
      });
    }
  }

  const normalized = rawIngredients.map((ing) => ({
    ...ing,
    normalizedName: normalizeIngredientName(ing.name) || ing.name.toLowerCase(),
  }));

  const consolidated = consolidateIngredients(normalized);

  const items = [];
  const excludedStaples = [];

  for (const ing of consolidated) {
    const nn = ing.normalizedName;
    const isStaple = pantryStaples.some((staple) => {
      const s = staple.toLowerCase();
      return s.includes(nn) || nn.includes(s);
    });

    if (isStaple) {
      excludedStaples.push({ name: ing.name, normalizedName: nn, isPantryStaple: true });
    } else {
      items.push({
        name: ing.name,
        normalizedName: nn,
        quantity: ing.quantity,
        unit: ing.unit,
        category: categorizeIngredient(nn),
        isPantryStaple: false,
      });
    }
  }

  return { items, excludedStaples };
}
