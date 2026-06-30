# PHASE-5 — Grocery List & Budget API

## Context

You are building NutriLabs, a self-hosted meal planning and grocery budgeting web app. This is Phase 5 of 8. Phases 1-4 built the scaffold, database, core API, and external service integrations. Your job in this phase is to build the grocery list generation engine and the budget tracking API. No frontend work happens in this phase.

Read `README.md` in this roadmap folder before starting for global conventions that apply to all phases.

---

## File locations

Add new route files:
```
apps/api/src/routes/
├── grocery.js
├── budget.js
└── eatingout.js
```

Add a utility module:
```
apps/api/src/lib/
├── prisma.js          # already exists
└── groceryEngine.js   # new -- grocery list generation logic
```

---

## Grocery engine (lib/groceryEngine.js)

This module contains the business logic for building a grocery list from a meal plan. It is a pure logic module -- it takes data as input and returns structured output. It does not make database calls directly.

### Function: normalizeIngredientName(name)
Normalizes an ingredient name for deduplication:
- Lowercase
- Remove preparation qualifiers: diced, chopped, minced, sliced, shredded, grated, cooked, frozen, canned, fresh, dried, raw, boneless, skinless, day-old
- Remove parenthetical notes
- Trim whitespace
- Examples: "2 cups diced onion" -> "onion", "boneless skinless chicken breast" -> "chicken breast"

### Function: consolidateIngredients(ingredientList)
Takes a flat array of ingredient objects (each with name, quantity, unit, from multiple recipes). Groups by normalized name. For ingredients with matching units, sums quantities. For ingredients with mismatched units (same normalized name, different unit), keep as separate entries. Returns a deduplicated array.

### Function: categorizeIngredient(normalizedName)
Returns a GroceryItem category enum value based on the ingredient name:
- PRODUCE: common vegetables and fruits
- PROTEIN: meat, poultry, fish, eggs, beans, lentils, tofu
- DAIRY: milk, cheese, yogurt, butter, cream, sour cream
- GRAINS: bread, rice, pasta, oats, tortillas, quinoa, flour, breadcrumbs
- CANNED: canned goods, broth, sauces, salsa, condiments, soy sauce
- FROZEN: anything with "frozen" in name, or peas and carrots
- MISC: everything else

Use keyword matching. When in doubt, default to MISC.

### Function: buildGroceryList(mealPlan, allRecipes, pantryStaples)
Takes:
- `mealPlan`: the full week plan with PlannedMeals each containing their Recipe and Ingredient data
- `pantryStaples`: array of normalized pantry staple name strings

Steps:
1. Collect all ingredients from all PlannedMeals that have a recipe assigned
2. Scale ingredient quantities if the recipe's planned servings differ from base servings (use 1x base servings -- serving scaling is a future feature)
3. Run all ingredients through `normalizeIngredientName` and `consolidateIngredients`
4. Check each consolidated ingredient against `pantryStaples` using case-insensitive fuzzy match (an ingredient is a pantry staple if the pantry staple name is contained within the normalized ingredient name or vice versa)
5. Separate the list into `items` (to buy) and `excludedStaples` (matched to pantry)
6. Run each item through `categorizeIngredient`
7. Return `{ items: [...], excludedStaples: [...] }`

Each returned item has: name (display name -- the most common non-normalized form from that group), normalizedName, quantity, unit, category, isPantryStaple: false.
Each excludedStaple has: name, normalizedName, isPantryStaple: true.

---

## Seeded price table

Create a static JavaScript module `apps/api/src/lib/priceSeed.js` containing a hardcoded price table for common grocery items. This table provides fallback Walmart and Aldi price estimates when Kroger live prices are unavailable.

Include at minimum 60 common items covering all categories. Each entry has: normalizedName, estimatedPriceWalmart (cents), estimatedPriceAldi (cents).

A price lookup function `lookupPrice(normalizedName)` should return `{ walmart, aldi }` or null if not found. Use partial string matching -- if the normalized name contains any key from the table, return that entry's prices.

---

## Grocery routes (routes/grocery.js)

All require auth. All grocery lists are linked to a meal plan owned by the authenticated user.

**GET /api/grocery/:mealPlanId**
Look up the GroceryList for the given mealPlanId. If none exists, call the generate logic (same as POST generate) and return the new list. If one exists, return it with all GroceryItems. Include `krogerPricesAvailable: boolean` in the response.

**POST /api/grocery/:mealPlanId/generate**
Regenerate the grocery list for the given meal plan. Steps:
1. Load the full MealPlan with all PlannedMeals, their Recipes, and all Ingredients
2. Load the user's PantryStaples
3. Call `buildGroceryList` from the grocery engine
4. For each item in the result, call `lookupPrice` from the price seed table to set `estimatedPriceWalmart` and `estimatedPriceAldi`
5. Delete any existing GroceryList for this mealPlanId and all its GroceryItems (in a transaction)
6. Create a new GroceryList and all GroceryItems in a single Prisma transaction
7. Return the new list with items grouped by category, sorted alphabetically within each category

**PUT /api/grocery/:listId/item/:itemId**
Update a single GroceryItem. Accept: `checked` (boolean), `quantity` (decimal), `unit` (string). Verify the list belongs to the current user's meal plan. Return the updated item.

**POST /api/grocery/:listId/log-spend**
Log the actual checkout total. Accept: `amount` (decimal dollars -- convert to cents before saving), `store` (string). Update `loggedSpend`, `loggedStore`, `loggedAt` on the GroceryList. Return the updated list.

**GET /api/grocery/:listId/prices**
Fetch Kroger live prices for all unchecked items in the list. Calls the Kroger service's `searchProducts` for each item. Update `estimatedPriceKroger` on matched items. Return the updated list with `krogerPricesAvailable: true` and a `lastFetchedAt` timestamp. If Kroger is unconfigured, return the list unchanged with `krogerPricesAvailable: false`.

---

## Budget routes (routes/budget.js)

All require auth. All data is scoped to the authenticated user.

**GET /api/budget/summary**
Returns a summary object with:
- `thisMonth`: { grocerySpend (sum of loggedSpend from GroceryLists where loggedAt is in current calendar month), eatingOutSpend (sum of amount from EatingOutLog for current month), mealsCooked (count of eaten PlannedMeals for current month), mealsEatenOut (count of EatingOutLog entries for current month) }
- `lastMonth`: same fields for the previous calendar month
- `allTime`: { totalGrocerySpend, totalEatingOutSpend, totalSaved (calculated as: (mealsCooked * eatingOutReference) - totalGrocerySpend, floored at 0) }
- `weeklyBudget`: from AppSettings
- `eatingOutReference`: from AppSettings

All monetary values returned in cents.

**GET /api/budget/weekly**
Returns the last 12 full weeks of data as an array of weekly summaries, most recent first. Each item:
- `weekStartDate`
- `grocerySpend`: sum of loggedSpend for GroceryLists in that week
- `eatingOutSpend`: sum of EatingOutLog amounts in that week
- `mealsCooked`: count of eaten PlannedMeals in that week
- `mealsEatenOut`: count of EatingOutLog entries in that week

---

## Eating out log routes (routes/eatingout.js)

All require auth. All data scoped to the authenticated user.

**GET /api/eatingout**
Return all EatingOutLog entries for the user, most recent first. Support optional query params: `month` (YYYY-MM format to filter by month), `householdMode`.

**POST /api/eatingout**
Create an entry. Validate: date (required, YYYY-MM-DD), mealType (required enum), amount (required, decimal dollars -- convert to cents), householdMode (required enum), placeName (optional string), notes (optional string).

**PUT /api/eatingout/:id**
Update an entry. Same validation as POST. Verify ownership.

**DELETE /api/eatingout/:id**
Delete an entry. Verify ownership.

---

## Completion check

Phase 5 is complete when:
1. `POST /api/grocery/1/generate` builds a correct deduplicated grocery list from the seeded meal plan
2. Pantry staples are correctly excluded from the list and appear in `excludedStaples`
3. `PUT /api/grocery/:listId/item/:itemId` correctly marks items as checked
4. `POST /api/grocery/:listId/log-spend` saves the spend correctly and appears in budget summary
5. `GET /api/budget/summary` returns correct totals
6. `GET /api/budget/weekly` returns 12 weeks of data (zeros for weeks with no data)
7. Eating out log CRUD all work correctly
8. The price seed table correctly populates Walmart and Aldi estimates for the 15 seed recipe ingredients

After confirming, proceed to PHASE-6.md.
