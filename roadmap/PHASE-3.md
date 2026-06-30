# PHASE-3 — Core Backend API

## Context

You are building NutriLabs, a self-hosted meal planning and grocery budgeting web app. This is Phase 3 of 8. Phases 1 and 2 created the project scaffold, Docker stack, database schema, and seed data. Your job in this phase is to build the core Express API -- authentication, profiles, recipes, meal plans, settings, and the health check endpoint. External service integrations (Ollama, Spoonacular, Kroger, USDA) are handled in Phase 4.

Read `README.md` in this roadmap folder before starting for global conventions that apply to all phases.

---

## File structure for the API

Organize `apps/api/src/` as follows:

```
apps/api/src/
├── index.js              # entry point, Express app setup
├── middleware/
│   ├── auth.js           # JWT verification middleware
│   └── errorHandler.js   # global error handler
├── routes/
│   ├── auth.js
│   ├── profiles.js
│   ├── recipes.js
│   ├── mealplans.js
│   ├── settings.js
│   └── health.js
├── services/             # external integrations added in Phase 4
└── lib/
    └── prisma.js         # singleton Prisma client
```

---

## Express app setup (index.js)

- Load environment variables via dotenv
- Initialize Express with JSON body parser, cookie parser, and CORS (allow credentials, origin from `BASE_URL` env var)
- Mount all route files under `/api`
- Mount the global error handler last
- Listen on port 3001

---

## Middleware

### auth.js
JWT verification middleware. Reads the JWT from the `Authorization` header (Bearer token) or from an `auth_token` httpOnly cookie. Verifies against `JWT_SECRET`. Attaches decoded `userId` to `req.user`. Returns `401` with error code `UNAUTHORIZED` if token is missing or invalid.

### errorHandler.js
Global Express error handler. Catches any unhandled errors. Returns the standard response shape `{ data: null, error: { message, code } }`. In development, include the stack trace in the error object. In production, log the error server-side but return a generic message to the client.

---

## Routes

All routes follow the standard response shape defined in README.md. All request bodies are validated with zod before any processing. All routes except `/api/auth/setup` and `/api/auth/login` require the auth middleware.

### Health check (GET /api/health)
Returns a status object with the following fields:
- `status`: always "ok"
- `dbConnected`: boolean -- attempt a simple Prisma query, return true if it succeeds
- `ollamaConnected`: boolean -- placeholder, always false in this phase (set in Phase 4)
- `spoonacularConnected`: boolean -- true if `SPOONACULAR_API_KEY` env var is set and non-empty
- `usdaConnected`: boolean -- always true (falls back to DEMO_KEY)
- `version`: "1.0.0"

### Auth routes

**POST /api/auth/setup**
First-run account creation. Only succeeds if zero User rows exist in the database. Accepts `email` and `password`. Hashes the password with bcrypt (12 rounds). Creates a User row. Creates a default AppSettings row linked to the new user (using all default values from Phase 2 schema). Returns the created user (without passwordHash). If a user already exists, return 409 with error code `SETUP_ALREADY_COMPLETE`.

**POST /api/auth/login**
Accepts `email` and `password`. Finds user by email. Compares password hash. On success, signs a JWT with payload `{ userId, email }` and 30-day expiry. Sets the JWT as an httpOnly, sameSite strict, secure (in production) cookie named `auth_token`. Also returns the token in the response body for clients that prefer header auth. Returns 401 with `INVALID_CREDENTIALS` on failure.

**POST /api/auth/logout**
Clears the `auth_token` cookie. Returns success.

**GET /api/auth/me**
Requires auth. Returns the current user's email and id (no passwordHash).

### Profile routes

All require auth. All operations are scoped to the authenticated user's id.

**GET /api/profiles** -- Return all profiles for the current user, ordered by isPlanner descending (planner first) then by name.

**POST /api/profiles** -- Create a profile. Validate: name required, age optional integer, avatarColor optional hex string, isPlanner must be false (only one planner allowed -- enforce this), dietaryNotes optional string, foodDislikes optional string, calorieTarget optional integer.

**PUT /api/profiles/:id** -- Update a profile. Same validation as POST. Verify the profile belongs to the current user before updating.

**DELETE /api/profiles/:id** -- Delete a profile. Verify ownership. Do not allow deleting the profile where isPlanner is true.

### Recipe routes

Recipes are not user-scoped (they are shared). All require auth.

**GET /api/recipes** -- Return all recipes. Support the following optional query params:
- `mealType` -- filter by BREAKFAST, LUNCH, DINNER, or SNACK
- `isKidFriendly` -- filter by true or false
- `source` -- filter by USER, AI, or SPOONACULAR
- `tags` -- comma-separated list, return recipes that include ALL specified tags
- `search` -- case-insensitive substring match on recipe name or description

**GET /api/recipes/:id** -- Return a single recipe including its full Ingredient list.

**POST /api/recipes** -- Create a recipe. Validate all fields. The `ingredients` field accepts an array of ingredient objects and creates them in a nested write. Set source to USER.

**PUT /api/recipes/:id** -- Update a recipe. For ingredients, replace the entire ingredient list (delete existing, insert new) in a transaction.

**DELETE /api/recipes/:id** -- Delete a recipe. Also check if any PlannedMeal references this recipe -- if so, null out the recipeId on those planned meals before deleting.

### Meal plan routes

All require auth. Scoped to the authenticated user.

**GET /api/mealplans** -- Return a list of all meal plans for the user, most recent first. Each item includes weekStartDate, id, and a count of how many PlannedMeals have recipes assigned.

**GET /api/mealplans/:id** -- Return a full meal plan including all DayConfigs and all PlannedMeals (each with the associated Recipe if assigned). Structure the response so the client can easily render a 7-day grid: an object keyed by dayOfWeek, each containing householdMode and an object keyed by mealType with the planned meal data.

**GET /api/mealplans/week/:date** -- Accept a date string (YYYY-MM-DD). Calculate the start of the week containing that date using the user's configured `weekStartDay` from AppSettings. Look up a MealPlan for that weekStartDate. If none exists, create one: insert a MealPlan row, then insert 7 DayConfig rows pre-filled from the user's CustodyTemplate (or default to SOLO if no template exists), then insert 21 PlannedMeal rows (7 days x 3 meal types: BREAKFAST, LUNCH, DINNER) with no recipe assigned. Return the full plan. Include a boolean `wasCreated` in the response.

**PUT /api/mealplans/:id/dayconfig** -- Update the householdMode for a specific day. Accepts `dayOfWeek` and `householdMode`. Updates the DayConfig row. Returns the updated DayConfig.

**PUT /api/mealplans/:id/meals** -- Update a planned meal slot. Accepts `dayOfWeek`, `mealType`, and optionally `recipeId` (to assign a recipe) or `eaten` + `eatenAt` (to mark as eaten). Verify the meal plan belongs to the current user. Returns the updated PlannedMeal.

### Settings routes

All require auth. Scoped to the authenticated user.

**GET /api/settings** -- Return the AppSettings row for the current user. Never return `spoonacularApiKey` or Kroger credentials in plaintext -- mask them as `"••••••••"` if set, or null if not set. Return a boolean `spoonacularConfigured` and `krogerConfigured` instead.

**PUT /api/settings** -- Update AppSettings. Accept all fields. If `spoonacularApiKey` is provided and non-empty, save it. If it is an empty string, clear it. Same logic for `usdaApiKey`, `krogerClientId`, `krogerClientSecret`. Never return the actual key values in the response -- return masked values as above.

**GET /api/settings/custody-template** -- Return all CustodyTemplate rows for the current user, formatted as an object keyed by dayOfWeek.

**PUT /api/settings/custody-template** -- Accept an array of `{ dayOfWeek, householdMode, isAlternatingWeek }` objects. Delete all existing template rows for the user and insert the new ones in a transaction.

**GET /api/pantry** -- Return all PantryStaple rows for the current user, alphabetically sorted.

**POST /api/pantry** -- Create a PantryStaple. Validate: name required, non-empty string. Use upsert to avoid duplicates.

**DELETE /api/pantry/:id** -- Delete a PantryStaple. Verify ownership.

---

## Completion check

Phase 3 is complete when:
1. All routes respond correctly when tested with a tool like curl or Postman
2. Protected routes return 401 when called without a valid token
3. `GET /api/health` returns correct connection status values
4. `POST /api/auth/setup` creates a user and settings row
5. `POST /api/auth/login` returns a JWT cookie
6. All CRUD operations on profiles, recipes, and meal plans work correctly
7. `GET /api/mealplans/week/:date` creates a new plan pre-filled from the custody template when none exists
8. No unhandled promise rejections or crashes under normal use

After confirming, proceed to PHASE-4.md.
