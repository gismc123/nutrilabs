// Estimated prices in cents. Walmart and Aldi fallback when Kroger is unavailable.
const PRICE_TABLE = [
  // PRODUCE
  { normalizedName: 'apple',        estimatedPriceWalmart: 149, estimatedPriceAldi: 99  },
  { normalizedName: 'banana',       estimatedPriceWalmart: 59,  estimatedPriceAldi: 39  },
  { normalizedName: 'orange',       estimatedPriceWalmart: 99,  estimatedPriceAldi: 79  },
  { normalizedName: 'lemon',        estimatedPriceWalmart: 69,  estimatedPriceAldi: 49  },
  { normalizedName: 'lime',         estimatedPriceWalmart: 49,  estimatedPriceAldi: 39  },
  { normalizedName: 'tomato',       estimatedPriceWalmart: 149, estimatedPriceAldi: 99  },
  { normalizedName: 'onion',        estimatedPriceWalmart: 99,  estimatedPriceAldi: 69  },
  { normalizedName: 'garlic',       estimatedPriceWalmart: 89,  estimatedPriceAldi: 59  },
  { normalizedName: 'carrot',       estimatedPriceWalmart: 119, estimatedPriceAldi: 79  },
  { normalizedName: 'celery',       estimatedPriceWalmart: 149, estimatedPriceAldi: 99  },
  { normalizedName: 'lettuce',      estimatedPriceWalmart: 199, estimatedPriceAldi: 149 },
  { normalizedName: 'spinach',      estimatedPriceWalmart: 299, estimatedPriceAldi: 229 },
  { normalizedName: 'kale',         estimatedPriceWalmart: 249, estimatedPriceAldi: 179 },
  { normalizedName: 'broccoli',     estimatedPriceWalmart: 199, estimatedPriceAldi: 149 },
  { normalizedName: 'cauliflower',  estimatedPriceWalmart: 299, estimatedPriceAldi: 199 },
  { normalizedName: 'bell pepper',  estimatedPriceWalmart: 149, estimatedPriceAldi: 99  },
  { normalizedName: 'cucumber',     estimatedPriceWalmart: 99,  estimatedPriceAldi: 69  },
  { normalizedName: 'zucchini',     estimatedPriceWalmart: 129, estimatedPriceAldi: 89  },
  { normalizedName: 'potato',       estimatedPriceWalmart: 399, estimatedPriceAldi: 279 },
  { normalizedName: 'sweet potato', estimatedPriceWalmart: 149, estimatedPriceAldi: 99  },
  { normalizedName: 'mushroom',     estimatedPriceWalmart: 249, estimatedPriceAldi: 179 },
  { normalizedName: 'avocado',      estimatedPriceWalmart: 149, estimatedPriceAldi: 99  },
  { normalizedName: 'cilantro',     estimatedPriceWalmart: 99,  estimatedPriceAldi: 69  },
  { normalizedName: 'jalapeño',     estimatedPriceWalmart: 79,  estimatedPriceAldi: 59  },
  { normalizedName: 'jalapeno',     estimatedPriceWalmart: 79,  estimatedPriceAldi: 59  },
  { normalizedName: 'corn',         estimatedPriceWalmart: 89,  estimatedPriceAldi: 59  },
  // PROTEIN
  { normalizedName: 'chicken breast',  estimatedPriceWalmart: 699, estimatedPriceAldi: 549 },
  { normalizedName: 'ground beef',     estimatedPriceWalmart: 799, estimatedPriceAldi: 649 },
  { normalizedName: 'ground turkey',   estimatedPriceWalmart: 599, estimatedPriceAldi: 479 },
  { normalizedName: 'salmon',          estimatedPriceWalmart: 999, estimatedPriceAldi: 799 },
  { normalizedName: 'tuna',            estimatedPriceWalmart: 149, estimatedPriceAldi: 99  },
  { normalizedName: 'shrimp',          estimatedPriceWalmart: 799, estimatedPriceAldi: 599 },
  { normalizedName: 'egg',             estimatedPriceWalmart: 399, estimatedPriceAldi: 279 },
  { normalizedName: 'bacon',           estimatedPriceWalmart: 599, estimatedPriceAldi: 449 },
  { normalizedName: 'sausage',         estimatedPriceWalmart: 399, estimatedPriceAldi: 299 },
  { normalizedName: 'tofu',            estimatedPriceWalmart: 299, estimatedPriceAldi: 229 },
  { normalizedName: 'black bean',      estimatedPriceWalmart: 99,  estimatedPriceAldi: 69  },
  { normalizedName: 'chickpea',        estimatedPriceWalmart: 149, estimatedPriceAldi: 99  },
  { normalizedName: 'lentil',          estimatedPriceWalmart: 199, estimatedPriceAldi: 149 },
  { normalizedName: 'pork',            estimatedPriceWalmart: 699, estimatedPriceAldi: 549 },
  { normalizedName: 'tilapia',         estimatedPriceWalmart: 699, estimatedPriceAldi: 549 },
  // DAIRY
  { normalizedName: 'milk',          estimatedPriceWalmart: 399, estimatedPriceAldi: 299 },
  { normalizedName: 'butter',        estimatedPriceWalmart: 449, estimatedPriceAldi: 329 },
  { normalizedName: 'cheddar',       estimatedPriceWalmart: 399, estimatedPriceAldi: 299 },
  { normalizedName: 'mozzarella',    estimatedPriceWalmart: 349, estimatedPriceAldi: 249 },
  { normalizedName: 'parmesan',      estimatedPriceWalmart: 499, estimatedPriceAldi: 349 },
  { normalizedName: 'yogurt',        estimatedPriceWalmart: 199, estimatedPriceAldi: 149 },
  { normalizedName: 'sour cream',    estimatedPriceWalmart: 199, estimatedPriceAldi: 149 },
  { normalizedName: 'heavy cream',   estimatedPriceWalmart: 299, estimatedPriceAldi: 229 },
  { normalizedName: 'cream cheese',  estimatedPriceWalmart: 299, estimatedPriceAldi: 219 },
  { normalizedName: 'feta',          estimatedPriceWalmart: 399, estimatedPriceAldi: 299 },
  // GRAINS
  { normalizedName: 'rice',        estimatedPriceWalmart: 349, estimatedPriceAldi: 249 },
  { normalizedName: 'pasta',       estimatedPriceWalmart: 199, estimatedPriceAldi: 129 },
  { normalizedName: 'bread',       estimatedPriceWalmart: 249, estimatedPriceAldi: 179 },
  { normalizedName: 'tortilla',    estimatedPriceWalmart: 299, estimatedPriceAldi: 199 },
  { normalizedName: 'oat',         estimatedPriceWalmart: 399, estimatedPriceAldi: 279 },
  { normalizedName: 'flour',       estimatedPriceWalmart: 399, estimatedPriceAldi: 279 },
  { normalizedName: 'quinoa',      estimatedPriceWalmart: 599, estimatedPriceAldi: 449 },
  { normalizedName: 'breadcrumb',  estimatedPriceWalmart: 229, estimatedPriceAldi: 169 },
  { normalizedName: 'noodle',      estimatedPriceWalmart: 199, estimatedPriceAldi: 139 },
  // CANNED
  { normalizedName: 'chicken broth',    estimatedPriceWalmart: 199, estimatedPriceAldi: 149 },
  { normalizedName: 'beef broth',       estimatedPriceWalmart: 199, estimatedPriceAldi: 149 },
  { normalizedName: 'vegetable broth',  estimatedPriceWalmart: 199, estimatedPriceAldi: 149 },
  { normalizedName: 'tomato paste',     estimatedPriceWalmart: 99,  estimatedPriceAldi: 69  },
  { normalizedName: 'diced tomato',     estimatedPriceWalmart: 149, estimatedPriceAldi: 99  },
  { normalizedName: 'coconut milk',     estimatedPriceWalmart: 199, estimatedPriceAldi: 149 },
  { normalizedName: 'salsa',            estimatedPriceWalmart: 299, estimatedPriceAldi: 219 },
  { normalizedName: 'soy sauce',        estimatedPriceWalmart: 299, estimatedPriceAldi: 219 },
  { normalizedName: 'olive oil',        estimatedPriceWalmart: 699, estimatedPriceAldi: 499 },
  { normalizedName: 'hot sauce',        estimatedPriceWalmart: 199, estimatedPriceAldi: 149 },
  // FROZEN
  { normalizedName: 'frozen pea',      estimatedPriceWalmart: 199, estimatedPriceAldi: 149 },
  { normalizedName: 'frozen corn',     estimatedPriceWalmart: 199, estimatedPriceAldi: 149 },
  { normalizedName: 'frozen broccoli', estimatedPriceWalmart: 249, estimatedPriceAldi: 179 },
  { normalizedName: 'edamame',         estimatedPriceWalmart: 299, estimatedPriceAldi: 229 },
];

export function lookupPrice(normalizedName) {
  const n = normalizedName.toLowerCase();
  const entry = PRICE_TABLE.find(
    (item) => n.includes(item.normalizedName) || item.normalizedName.includes(n)
  );
  if (!entry) return null;
  return { walmart: entry.estimatedPriceWalmart, aldi: entry.estimatedPriceAldi };
}
