# PHASE-4 — External Service Integrations

## Context

You are building NutriLabs, a self-hosted meal planning and grocery budgeting web app. This is Phase 4 of 8. Phases 1-3 built the scaffold, database, and core API. Your job in this phase is to build all four external service integrations -- Ollama, Spoonacular, USDA FoodData Central, and Kroger -- as service modules and mount their routes. Every integration must degrade gracefully when unavailable or unconfigured.

Read `README.md` in this roadmap folder before starting for global conventions that apply to all phases.

---

## File locations

Create all service modules in `apps/api/src/services/`:

```
apps/api/src/services/
├── ollama.js
├── spoonacular.js
├── usda.js
└── kroger.js
```

Add new route files to `apps/api/src/routes/`:
```
apps/api/src/routes/
├── ollama.js
├── recipes.external.js    # Spoonacular search and import routes
└── nutrition.js           # USDA nutrition routes
```

Mount all new routes in `apps/api/src/index.js`.

---

## Ollama service (services/ollama.js)

Ollama runs at the host and port stored in the user's AppSettings (`ollamaHost`). The model is stored in AppSettings (`ollamaModel`). Both values must be read from the database per request (not from env vars at startup) so the user can change them through the Settings UI without restarting the container.

All Ollama functions must:
- Set a 30-second timeout on all HTTP requests
- Return a structured error object `{ error: true, code: 'OLLAMA_UNAVAILABLE', message }` if the request fails for any reason (connection refused, timeout, invalid response)
- Never throw -- always return
- Instruct Ollama to respond with JSON only in every prompt
- Parse and validate the JSON response before returning -- if parsing fails, return an error object

### Function: testConnection(ollamaHost)
Sends a GET request to `{ollamaHost}/api/tags`. Returns `{ connected: true, models: [...] }` on success or `{ connected: false, error }` on failure.

### Function: getAvailableModels(ollamaHost)
Calls `GET {ollamaHost}/api/tags`. Returns an array of model name strings. Returns empty array on failure.

### Function: suggestMeals(context, settings)
`context` contains: activeProfiles (array of { name, age, dietaryNotes, foodDislikes, calorieTarget }), weeklyBudget (dollars), existingMeals (array of recipe names already in the plan), pantryStaples (array of strings), nutritionGoals ({ calorieTarget, proteinPct, carbsPct, fatPct }).

Builds a prompt instructing Ollama to return a JSON array of 21 meal suggestions (7 days x 3 meals) where each item has: dayOfWeek, mealType, name, description, estimatedCalories, estimatedProteinG, estimatedCarbsG, estimatedFatG, estimatedCostPerServing, isKidFriendly (boolean), reason (one sentence).

Calls `POST {ollamaHost}/api/generate` with the model from settings and `stream: false`.

Returns the parsed array on success or an error object on failure.

### Function: suggestMealForSlot(slotContext, settings)
`slotContext` contains: dayOfWeek, mealType, householdMode, activeProfiles, remainingCaloriesForDay, weeklyBudgetRemaining, recipesAlreadyThisWeek, pantryStaples.

Builds a prompt instructing Ollama to return a JSON array of exactly 3 meal options. Each option has: name, description, estimatedCalories, estimatedProteinG, estimatedCarbsG, estimatedFatG, estimatedCostPerServing, isKidFriendly, reason.

Returns the parsed array or an error object.

### Function: estimateMacros(recipeName, ingredients)
`ingredients` is an array of strings (e.g. "2 cups rolled oats", "1 tbsp honey").

Builds a prompt instructing Ollama to return a JSON object with: calories, proteinG, carbsG, fatG, costPerServingEstimate. All values are per serving.

Returns the parsed object or an error object.

### Function: weeklyInsight(budgetSummary, settings)
`budgetSummary` contains: thisWeekGrocerySpend, thisWeekEatingOutSpend, lastWeekGrocerySpend, lastWeekEatingOutSpend, mealsCooked, mealsEatenOut, topEatingOutDay.

Builds a prompt instructing Ollama to return a JSON object with a single key `insight` containing one sentence (max 20 words) summarizing the user's week in a positive, motivating tone.

Returns the insight string or a fallback empty string on failure.

---

## Ollama routes (routes/ollama.js)

All require auth. Read `ollamaHost` and `ollamaModel` from the current user's AppSettings for each request.

**GET /api/ollama/models** -- Calls `getAvailableModels`. Returns the model list.

**POST /api/ollama/test** -- Calls `testConnection`. Returns connection status and model list. Also updates `/api/health` cached state.

**POST /api/mealplans/:id/ai-suggest** -- Builds context from the meal plan (load profiles, pantry staples, existing meals, AppSettings). Calls `suggestMeals`. Returns suggestions array. Does not save anything to the database -- the client handles accepting/rejecting suggestions.

**POST /api/mealplans/:id/ai-suggest-slot** -- Accepts `{ dayOfWeek, mealType }` in body. Builds slot context. Calls `suggestMealForSlot`. Returns 3 options.

**POST /api/recipes/estimate-macros** -- Accepts `{ recipeName, ingredients }`. Calls `estimateMacros`. Returns macro estimates.

**GET /api/budget/insight** -- Builds budget summary from the last 2 weeks of data for the current user. Calls `weeklyInsight`. Returns the insight string.

Update `GET /api/health` to call `testConnection` with the current user's `ollamaHost` (use the seeded default if no user is authenticated) and return the real `ollamaConnected` boolean.

---

## Spoonacular service (services/spoonacular.js)

The Spoonacular API key is stored in AppSettings (`spoonacularApiKey`). Read it from the database per request.

Implement a simple in-memory daily request counter. It is a module-level object: `{ count: 0, resetDate: todayDateString }`. On every outbound Spoonacular request, check if `resetDate` is today -- if not, reset count to 0 and update resetDate. Increment count on each request. If count >= 140, do not make the request and return `{ error: true, code: 'SPOONACULAR_DAILY_LIMIT_APPROACHING' }`.

All functions return `{ error: true, code: 'SPOONACULAR_NOT_CONFIGURED' }` if the API key is null or empty.

### Function: searchRecipes(params, apiKey)
Calls `GET https://api.spoonacular.com/recipes/complexSearch` with:
- `query`: the search term
- `type`: meal type if provided (breakfast, lunch, dinner, snack -- lowercase)
- `diet`: diet filter if provided
- `maxReadyTime`: integer minutes if provided
- `maxPricePerServing`: integer cents if provided
- `number`: 12
- `addRecipeNutrition`: true
- `addRecipeInformation`: true
- `apiKey`: the provided key

Returns a cleaned array. Each item: id, title, image, readyInMinutes, pricePerServing (cents), calories, proteinG, carbsG, fatG, diets (array), cuisines (array).

### Function: getRecipeDetail(spoonacularId, apiKey)
First queries the RecipeImportCache table for a row where `spoonacularId` matches and `fetchedAt` is within the last 7 days. If found, parse and return `rawJson`. If not found, call `GET https://api.spoonacular.com/recipes/{id}/information?includeNutrition=true&apiKey={key}`. Store the raw response string in RecipeImportCache (upsert by spoonacularId). Return the parsed response.

### Function: mapToNutriLabsRecipe(spoonacularData)
A pure transformation function (no database calls). Maps Spoonacular response fields to NutriLabs Recipe + Ingredient shape:
- `title` -> `name`
- `readyInMinutes` -> `prepTimeMinutes`
- `pricePerServing / 100` -> `costPerServing` (Spoonacular returns cents as integer)
- From `nutrition.nutrients` array: find nutrient named "Calories" -> `calories`, "Protein" -> `proteinG`, "Carbohydrates" -> `carbsG`, "Fat" -> `fatG`
- `extendedIngredients` array -> ingredients array with `name`, `quantity` (from `measures.us.amount`), `unit` (from `measures.us.unitShort`)
- `analyzedInstructions[0].steps` -> join step strings with newlines into `instructions`
- `dishTypes` array -> derive `mealType`: if includes "breakfast" use BREAKFAST, if includes "lunch", "salad", or "soup" use LUNCH, otherwise DINNER
- Build `tags` array from: dietary flags (vegan, vegetarian, glutenFree, dairyFree) that are true, plus cuisine names
- `isKidFriendly`: set true if `veryHealthy` is true OR `cheap` is true, AND cuisines array does not include any of: "Indian", "Thai", "Mexican", "Korean", "Vietnamese" -- otherwise false (user can toggle manually)
- `source`: "SPOONACULAR"
- `spoonacularId`: the numeric id

---

## Spoonacular routes (routes/recipes.external.js)

All require auth. Read API key from current user's AppSettings.

**GET /api/recipes/search/external** -- Query params: `q`, `mealType`, `diet`, `maxReadyTime`, `maxCost`. Calls `searchRecipes`. Returns results array plus `{ requestsRemainingToday: number }`.

**GET /api/recipes/search/external/:spoonacularId** -- Calls `getRecipeDetail` then `mapToNutriLabsRecipe`. Returns the mapped recipe shape (not saved yet).

**POST /api/recipes/import/:spoonacularId** -- Calls `getRecipeDetail`, then `mapToNutriLabsRecipe`, then saves to the Recipe and Ingredient tables using a Prisma transaction. Returns the new local recipe id. If a recipe with that spoonacularId already exists in the database, return the existing recipe id with a flag `alreadyImported: true`.

---

## USDA service (services/usda.js)

Base URL: `https://api.nal.usda.gov/fdc/v1`

Read `usdaApiKey` from AppSettings. If null or empty, use the string `"DEMO_KEY"` as the fallback.

All functions handle errors gracefully and return null on failure rather than throwing.

### Function: searchFood(name, apiKey)
Calls `GET /foods/search?query={name}&dataType=Foundation,SR%20Legacy&pageSize=5&api_key={key}`. Returns array of up to 5 items, each with: fdcId, description, calories per 100g, proteinG per 100g, carbsG per 100g, fatG per 100g. Extract these from the `foodNutrients` array in each search result by finding nutrients with names: "Energy", "Protein", "Carbohydrate, by difference", "Total lipid (fat)".

### Function: getFoodDetail(fdcId, apiKey)
Calls `GET /food/{fdcId}?api_key={key}`. Returns the full food object. On failure returns null.

### Function: extractMacrosPer100g(foodDetail)
Pure function. Takes a USDA food detail object. Extracts and returns `{ calories, proteinG, carbsG, fatG }` per 100g by searching the `foodNutrients` array for the correct nutrient names. Returns null if data is insufficient.

---

## USDA routes (routes/nutrition.js)

All require auth. Read API key from current user's AppSettings.

**GET /api/nutrition/ingredient** -- Query param: `name`. Calls `searchFood`. Returns the results array. If USDA returns no results or call fails, returns empty array (not an error).

**GET /api/nutrition/fdcid/:fdcId** -- Calls `getFoodDetail` then `extractMacrosPer100g`. Returns the macro object or null.

---

## Kroger service (services/kroger.js)

Read Kroger credentials (`krogerClientId`, `krogerClientSecret`, `krogerZip`) from AppSettings. Return `{ error: true, code: 'KROGER_NOT_CONFIGURED' }` if client ID or secret is missing.

Kroger uses OAuth2 client credentials flow. Cache the access token in memory with its expiry time. Re-request only when expired.

### Function: getAccessToken(clientId, clientSecret)
POST to `https://api.kroger.com/v1/connect/oauth2/token` with grant_type client_credentials and scope `product.compact`. Returns the access token string. Caches it with expiry.

### Function: findNearestLocation(zip, accessToken)
Calls `GET https://api.kroger.com/v1/locations?filter.zipCode.near={zip}&filter.limit=1`. Returns the locationId of the nearest store. Cache the locationId per zip code in memory.

### Function: searchProducts(query, zip, accessToken)
Calls `GET https://api.kroger.com/v1/products?filter.term={query}&filter.locationId={locationId}&filter.limit=5`. Returns array of products with: productId, description, price (regular), salePrice (nullable), size, upc.

Updates to `/api/grocery/:listId/prices` route (add in this phase): for each GroceryItem in the list, call `searchProducts` with the item name as query. Match the best result by name similarity. Update `estimatedPriceKroger` on the item. Return the updated list. Handle Kroger being unconfigured gracefully -- return the list unchanged with a flag `krogerPricesAvailable: false`.

---

## Completion check

Phase 4 is complete when:
1. `GET /api/ollama/models` returns a list of models from the Ollama instance at 192.168.1.190
2. `POST /api/ollama/test` returns `{ connected: true }` when Ollama is running
3. `GET /api/health` now returns the real `ollamaConnected` boolean
4. `GET /api/recipes/search/external?q=chicken` returns Spoonacular results when API key is configured
5. `POST /api/recipes/import/:id` saves a recipe to the local database
6. `GET /api/nutrition/ingredient?name=chicken+breast` returns USDA nutrition data
7. All integrations return structured error objects (not crashes) when offline or unconfigured
8. Running `POST /api/mealplans/1/ai-suggest` returns a 21-meal suggestion array from Ollama

After confirming, proceed to PHASE-5.md.
