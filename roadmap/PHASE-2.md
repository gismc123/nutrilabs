# PHASE-2 — Database Schema & Seed Data

## Context

You are building NutriLabs, a self-hosted meal planning and grocery budgeting web app. This is Phase 2 of 8. Phase 1 created the project scaffold and running Docker stack. Your job in this phase is to define the complete Prisma schema, run the initial migration, and seed the database with starter data. No API routes or frontend work happens in this phase.

Read `README.md` in this roadmap folder before starting for global conventions that apply to all phases.

---

## Prisma setup

The Prisma schema lives at `apps/api/prisma/schema.prisma`. The datasource is PostgreSQL. The generator is the standard `prisma-client-js`.

---

## Models

Define the following models exactly as specified. Do not add extra fields or relations beyond what is listed.

### User
Single row -- the planner (app owner).
- `id` int, auto-increment, primary key
- `email` string, unique
- `passwordHash` string
- `createdAt` datetime, default now

### Profile
Household members -- the planner himself plus each child.
- `id` int, auto-increment, primary key
- `userId` int, foreign key to User
- `name` string
- `age` int, nullable
- `avatarColor` string (hex color, e.g. "#4CAF50")
- `isPlanner` boolean, default false
- `dietaryNotes` string, nullable
- `foodDislikes` string, nullable
- `calorieTarget` int, nullable
- `createdAt` datetime, default now

### Recipe
- `id` int, auto-increment, primary key
- `name` string
- `description` string, nullable
- `mealType` enum: `BREAKFAST`, `LUNCH`, `DINNER`, `SNACK`
- `servings` int, default 1
- `prepTimeMinutes` int, nullable
- `costPerServing` decimal(8,2), nullable
- `calories` int, nullable
- `proteinG` int, nullable
- `carbsG` int, nullable
- `fatG` int, nullable
- `isKidFriendly` boolean, default true
- `tags` string[] (array)
- `source` enum: `USER`, `AI`, `SPOONACULAR`
- `instructions` string, nullable
- `spoonacularId` int, nullable, unique
- `createdAt` datetime, default now
- `updatedAt` datetime, updated automatically
- Relation: has many Ingredient

### Ingredient
- `id` int, auto-increment, primary key
- `recipeId` int, foreign key to Recipe, cascade delete
- `name` string
- `quantity` decimal(10,3), nullable
- `unit` string, nullable
- `isOptional` boolean, default false

### MealPlan
- `id` int, auto-increment, primary key
- `userId` int, foreign key to User
- `weekStartDate` date
- `createdAt` datetime, default now
- `updatedAt` datetime, updated automatically
- Unique constraint on (userId, weekStartDate)
- Relation: has many PlannedMeal, has many DayConfig

### DayConfig
Stores the household mode for each day of a meal plan week.
- `id` int, auto-increment, primary key
- `mealPlanId` int, foreign key to MealPlan, cascade delete
- `dayOfWeek` enum: `MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT`, `SUN`
- `householdMode` enum: `SOLO`, `DAD_MODE`
- `activeProfileIds` int[] (array of Profile ids active on this day)
- Unique constraint on (mealPlanId, dayOfWeek)

### PlannedMeal
- `id` int, auto-increment, primary key
- `mealPlanId` int, foreign key to MealPlan, cascade delete
- `dayOfWeek` enum: `MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT`, `SUN`
- `mealType` enum: `BREAKFAST`, `LUNCH`, `DINNER`, `SNACK`
- `recipeId` int, nullable, foreign key to Recipe (nullable -- slot can be empty)
- `eaten` boolean, default false
- `eatenAt` datetime, nullable
- Unique constraint on (mealPlanId, dayOfWeek, mealType)

### GroceryList
- `id` int, auto-increment, primary key
- `mealPlanId` int, foreign key to MealPlan, unique (one list per plan)
- `generatedAt` datetime, default now
- `loggedSpend` int, nullable (stored in cents)
- `loggedStore` string, nullable
- `loggedAt` datetime, nullable
- Relation: has many GroceryItem

### GroceryItem
- `id` int, auto-increment, primary key
- `groceryListId` int, foreign key to GroceryList, cascade delete
- `name` string
- `quantity` decimal(10,3), nullable
- `unit` string, nullable
- `category` enum: `PRODUCE`, `PROTEIN`, `DAIRY`, `GRAINS`, `CANNED`, `FROZEN`, `MISC`
- `checked` boolean, default false
- `estimatedPriceWalmart` int, nullable (cents)
- `estimatedPriceKroger` int, nullable (cents)
- `estimatedPriceAldi` int, nullable (cents)
- `isPantryStaple` boolean, default false

### EatingOutLog
- `id` int, auto-increment, primary key
- `userId` int, foreign key to User
- `date` date
- `mealType` enum: `BREAKFAST`, `LUNCH`, `DINNER`, `SNACK`
- `placeName` string, nullable
- `amount` int (cents)
- `householdMode` enum: `SOLO`, `DAD_MODE`
- `notes` string, nullable
- `createdAt` datetime, default now

### AppSettings
Single row per user. Stores all user-configurable settings including API keys managed through the UI.
- `id` int, auto-increment, primary key
- `userId` int, foreign key to User, unique
- `weekStartDay` enum: `SUN`, `MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT`, default `SUN`
- `weeklyBudget` int, default 12000 (cents -- represents $120.00)
- `eatingOutReference` int, default 1200 (cents -- represents $12.00 per meal)
- `ollamaHost` string, default `http://192.168.1.190:11434`
- `ollamaModel` string, default `llama3`
- `krogerZip` string, nullable
- `spoonacularApiKey` string, nullable
- `usdaApiKey` string, nullable
- `dateFormat` string, default `MM/DD/YYYY`
- `currency` string, default `USD`

### CustodyTemplate
Stores the user's default weekly custody pattern. Used to pre-fill new week plans.
- `id` int, auto-increment, primary key
- `userId` int, foreign key to User
- `dayOfWeek` enum: `MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT`, `SUN`
- `householdMode` enum: `SOLO`, `DAD_MODE`
- `isAlternatingWeek` boolean, default false (marks days that only apply on alternating weeks)
- Unique constraint on (userId, dayOfWeek, isAlternatingWeek)

### PantryStaple
- `id` int, auto-increment, primary key
- `userId` int, foreign key to User
- `name` string
- `createdAt` datetime, default now
- Unique constraint on (userId, name)

### RecipeImportCache
Stores raw Spoonacular API responses to avoid redundant API calls.
- `id` int, auto-increment, primary key
- `spoonacularId` int, unique
- `rawJson` string (full API response as JSON string)
- `fetchedAt` datetime, default now

---

## Migration

After defining the schema, run `prisma migrate dev --name init` to generate and apply the initial migration. Commit the generated migration files.

---

## Seed data

Create `apps/api/prisma/seed.js`. The seed script must be idempotent -- running it multiple times must not create duplicate records (use upsert or check-before-insert patterns).

### Seed: User
Create one user:
- email: `admin@nutrilabs.local`
- passwordHash: bcrypt hash of `nutrilabs` (12 rounds) -- this is a local app default, the user changes it after first login

### Seed: Profiles
Create two profiles linked to the seeded user:
- Profile 1: name "Ivan", isPlanner true, avatarColor "#2E7D32", calorieTarget 1800
- Profile 2: name "Daughter 1", isPlanner false, age 6, avatarColor "#F57F17", calorieTarget 1400
- Profile 3: name "Daughter 2", isPlanner false, age 4, avatarColor "#AD1457", calorieTarget 1200

### Seed: AppSettings
Create one AppSettings row linked to the seeded user with all defaults as specified in the model above.

### Seed: CustodyTemplate
Create a default custody pattern for all 7 days. Set Monday, Tuesday, Wednesday, Thursday, Friday as SOLO. Set Saturday and Sunday as DAD_MODE. Mark no days as alternating week.

### Seed: PantryStaples
Create the following pantry staples linked to the seeded user:
olive oil, salt, black pepper, garlic powder, onion powder, paprika, cumin, chili powder, Italian seasoning, soy sauce, chicken broth, vegetable broth, cooking spray, sugar, flour, baking powder, baking soda, vanilla extract, cinnamon

### Seed: Recipes
Create exactly 15 recipes with the ingredient lists described below. All are linked to no user (recipes are global in this app). Set `source` to `USER` for all seed recipes. Macro values and costs should be realistic.

**Breakfasts (5):**

1. Overnight Oats -- isKidFriendly: true, servings: 1, prepTimeMinutes: 5, costPerServing: 1.20, calories: 320, proteinG: 12, carbsG: 48, fatG: 8. Ingredients: rolled oats, milk, chia seeds, honey, frozen mixed berries. Tags: prep-friendly, budget, vegetarian.

2. Egg and Veggie Scramble -- isKidFriendly: true, servings: 1, prepTimeMinutes: 10, costPerServing: 1.40, calories: 280, proteinG: 18, carbsG: 10, fatG: 14. Ingredients: eggs, bell pepper, onion, spinach, olive oil. Tags: high-protein, quick, low-carb.

3. Banana Peanut Butter Toast -- isKidFriendly: true, servings: 1, prepTimeMinutes: 5, costPerServing: 0.90, calories: 350, proteinG: 10, carbsG: 52, fatG: 11. Ingredients: whole wheat bread, peanut butter, banana, honey. Tags: budget, quick, kids-love-it.

4. Greek Yogurt Parfait -- isKidFriendly: true, servings: 1, prepTimeMinutes: 5, costPerServing: 1.60, calories: 290, proteinG: 20, carbsG: 34, fatG: 6. Ingredients: plain Greek yogurt, granola, mixed berries, honey. Tags: high-protein, prep-friendly, no-cook.

5. Avocado Toast with Eggs -- isKidFriendly: false, servings: 1, prepTimeMinutes: 10, costPerServing: 2.20, calories: 380, proteinG: 16, carbsG: 30, fatG: 22. Ingredients: whole wheat bread, avocado, eggs, red pepper flakes, lemon juice. Tags: high-protein, healthy-fat.

**Lunches (5):**

6. Turkey and Veggie Wraps -- isKidFriendly: true, servings: 1, prepTimeMinutes: 10, costPerServing: 2.40, calories: 380, proteinG: 28, carbsG: 38, fatG: 10. Ingredients: whole wheat tortilla, deli turkey, romaine lettuce, tomato, cucumber, hummus. Tags: prep-friendly, budget, kids-love-it.

7. Chicken Rice Bowls -- isKidFriendly: true, servings: 4, prepTimeMinutes: 30, costPerServing: 2.80, calories: 450, proteinG: 38, carbsG: 46, fatG: 9. Ingredients: chicken breast, brown rice, black beans, salsa, lime, cumin. Tags: prep-friendly, high-protein, batch-cook.

8. Red Lentil Soup -- isKidFriendly: true, servings: 6, prepTimeMinutes: 35, costPerServing: 1.10, calories: 310, proteinG: 18, carbsG: 52, fatG: 3. Ingredients: red lentils, diced tomatoes, onion, garlic, cumin, turmeric, paprika, vegetable broth. Tags: budget, batch-cook, vegetarian, prep-friendly.

9. Tuna Lettuce Wraps -- isKidFriendly: false, servings: 1, prepTimeMinutes: 5, costPerServing: 1.60, calories: 260, proteinG: 30, carbsG: 8, fatG: 9. Ingredients: canned tuna in water, light mayo, celery, red onion, romaine lettuce, lemon juice. Tags: high-protein, no-cook, low-carb, quick.

10. Veggie Quesadillas -- isKidFriendly: true, servings: 2, prepTimeMinutes: 15, costPerServing: 1.80, calories: 370, proteinG: 14, carbsG: 48, fatG: 14. Ingredients: whole wheat tortillas, shredded cheese, bell pepper, onion, black beans, salsa. Tags: budget, kids-love-it, vegetarian, quick.

**Dinners (5):**

11. Sheet Pan Chicken and Vegetables -- isKidFriendly: true, servings: 4, prepTimeMinutes: 35, costPerServing: 3.20, calories: 420, proteinG: 40, carbsG: 28, fatG: 12. Ingredients: bone-in chicken thighs, broccoli florets, baby carrots, olive oil, garlic powder, paprika. Tags: prep-friendly, high-protein, kids-love-it, batch-cook.

12. Black Bean Tacos -- isKidFriendly: true, servings: 2, prepTimeMinutes: 15, costPerServing: 1.80, calories: 360, proteinG: 16, carbsG: 54, fatG: 8. Ingredients: black beans, corn tortillas, shredded cabbage, salsa, sour cream, lime, cumin, chili powder. Tags: budget, vegetarian, kids-love-it, quick.

13. Turkey Meatballs with Pasta -- isKidFriendly: true, servings: 4, prepTimeMinutes: 40, costPerServing: 3.00, calories: 490, proteinG: 34, carbsG: 62, fatG: 12. Ingredients: ground turkey, whole wheat spaghetti, marinara sauce, egg, breadcrumbs, garlic, Italian seasoning, parmesan. Tags: kids-love-it, batch-cook, prep-friendly.

14. Egg Fried Rice -- isKidFriendly: true, servings: 2, prepTimeMinutes: 15, costPerServing: 1.40, calories: 390, proteinG: 16, carbsG: 58, fatG: 10. Ingredients: cooked rice (day-old), eggs, frozen peas and carrots, soy sauce, sesame oil, green onion. Tags: budget, kids-love-it, quick, use-leftovers.

15. Slow Cooker Chicken Chili -- isKidFriendly: true, servings: 6, prepTimeMinutes: 20, costPerServing: 2.80, calories: 340, proteinG: 32, carbsG: 40, fatG: 6. Ingredients: chicken breast, white beans, corn, green chiles, chicken broth, garlic powder, cumin. Tags: batch-cook, prep-friendly, budget, kids-love-it.

---

## Completion check

Phase 2 is complete when:
1. `prisma migrate dev` runs cleanly with no errors
2. `prisma db seed` runs cleanly and populates all tables
3. Prisma Studio (`pnpm db:studio`) shows all 15 recipes, 3 profiles, AppSettings row, CustodyTemplate rows, and PantryStaples
4. Running seed a second time does not create duplicate rows

After confirming, proceed to PHASE-3.md.
