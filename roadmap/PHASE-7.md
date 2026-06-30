# PHASE-7 — Frontend Screens Part 1

## Context

You are building NutriLabs, a self-hosted meal planning and grocery budgeting web app. This is Phase 7 of 8. Phase 6 built the frontend shell and shared components. Your job in this phase is to build three fully functional screens: the Dashboard, the Week Planner, and the Recipe Library. The Grocery List, Budget Tracker, and Settings screens are built in Phase 8.

Read `README.md` in this roadmap folder before starting for global conventions that apply to all phases.

---

## Component locations

Create all new components inside `apps/web/src/components/`. Organize by feature:

```
apps/web/src/components/
├── dashboard/
│   ├── TodayHeader.jsx
│   ├── TodayMeals.jsx
│   ├── EatOutModal.jsx
│   ├── WeekBudgetMeter.jsx
│   ├── SavingsCallout.jsx
│   └── PrepDayBanner.jsx
├── planner/
│   ├── WeekNav.jsx
│   ├── WeekGrid.jsx
│   ├── DayScroll.jsx
│   ├── MealSlot.jsx
│   ├── MealPickerSheet.jsx
│   └── AIFillWeekButton.jsx
└── recipes/
    ├── RecipeLibraryHeader.jsx
    ├── RecipeGrid.jsx
    ├── RecipeCard.jsx
    ├── RecipeDetailModal.jsx
    ├── RecipeForm.jsx
    ├── AISuggestPanel.jsx
    └── ExternalRecipeSearch.jsx
```

---

## Dashboard (pages/Dashboard.jsx)

Replace the stub. The Dashboard is the home screen of the app.

Layout:
- Desktop: 2-column grid. Left column takes 60% width, right column 40%.
- Mobile: single column, components stacked vertically in order: TodayHeader, TodayMeals, PrepDayBanner (if applicable), WeekBudgetMeter, SavingsCallout.

Data requirements: on mount, fetch the meal plan for the current week (`GET /api/mealplans/week/:today`), the budget summary (`GET /api/budget/summary`), and the user's settings. Use TanStack Query for all fetches. Show skeleton cards while loading.

### TodayHeader.jsx
Displays today's full date (e.g. "Monday, June 30") and the household mode for today. Reads today's DayConfig from the current week plan. Renders a `HouseholdBadge` for the current day's mode. If no plan exists yet for today, show "Solo day" as default.

### TodayMeals.jsx
Renders 3 meal cards side by side (desktop) or stacked (mobile) for breakfast, lunch, and dinner. Each card:
- Meal type label (Breakfast / Lunch / Dinner) in small muted text
- Recipe name (or "Not planned" in muted italic if no recipe assigned)
- Calorie count if recipe is assigned
- A checkmark button: if the meal has been eaten (`eaten: true`), shows a filled green checkmark. If not, shows an outline checkmark. Clicking it calls `PUT /api/mealplans/:id/meals` to toggle the eaten state.
- An "Ate out" button (fork-and-knife icon, small, subtle). Clicking opens the `EatOutModal` with the meal type pre-filled.

### EatOutModal.jsx
Renders inside a `BottomSheet`. Form fields: place name (optional text input, placeholder "Restaurant name"), amount (required number input, labeled "Amount spent $"), household mode (auto-filled from today's DayConfig, toggleable). A "Log it" submit button. On submit calls `POST /api/eatingout`. On success, shows a toast "Logged -- nice try, fast food 👊" and closes the sheet. Invalidates the budget summary query.

### WeekBudgetMeter.jsx
Shows a horizontal progress bar. Label above: "Weekly grocery budget". Fill percentage: `(loggedGrocerySpend / weeklyBudget) * 100`. Color: green below 70%, amber 70-90%, red above 90%. Below the bar: "$X spent of $Y budget" and "X meals cooked, Y eaten out this week." Use `centsToDisplay` from utils for formatting.

### SavingsCallout.jsx
A card showing: "Estimated savings this week" as the label. Calculation: `(mealsCooked * eatingOutReference) - thisWeekGrocerySpend` -- floor at zero. Display the dollar amount prominently. Below it in small muted text: "Based on X meals cooked vs. $Y eating out reference." If savings are zero, show "Cook a meal to start saving" instead.

### PrepDayBanner.jsx
Only renders if today's day of week matches the user's configured prep day (derive prep day from the settings -- use the weekStartDay as a proxy for prep day, or add a prepDay field to AppSettings if absent -- default to Sunday). Shows a soft green banner: "It's prep day -- your grocery list is ready." with a link to `/shop`.

---

## Week Planner (pages/WeekPlanner.jsx)

Replace the stub. The week planner is the central planning screen.

Data requirements: fetch the meal plan for the displayed week using `GET /api/mealplans/week/:date` where date is the first day of the displayed week. When `wasCreated: true` in the response, show a soft dismissible banner "New week created from your custody template."

State: track the currently displayed week start date. Prev/next navigation updates this date and triggers a new fetch.

Layout:
- Desktop: `WeekGrid` takes full width
- Mobile: `WeekNav` + `DayScroll`

### WeekNav.jsx
Displays the week range (e.g. "Jun 29 -- Jul 5"). Left and right arrow buttons to navigate weeks. Clicking the date range label opens a native date picker input to jump to any week. Also renders three action buttons: "AI fill week" (`AIFillWeekButton`), "Copy last week" (calls a new endpoint `POST /api/mealplans/:id/copy-from/:sourceId` -- add this simple endpoint to the backend that copies all recipe assignments from a source plan to the target plan), "Clear week" (calls `DELETE /api/mealplans/:id/meals` to null all recipe assignments -- add this endpoint too, requires confirm dialog).

### WeekGrid.jsx (desktop only)
A CSS grid with 7 columns. Each column is one day. Column header: day name (Mon, Tue...), date number, and a `HouseholdBadge` that is clickable to toggle the day's household mode (calls `PUT /api/mealplans/:id/dayconfig`). Each column contains 3 `MealSlot` components (breakfast, lunch, dinner).

### DayScroll.jsx (mobile only)
A horizontal scrollable strip of day tabs. Each tab shows the short day name and a small household mode dot. Selecting a tab shows that day's 3 `MealSlot` components stacked vertically below.

### MealSlot.jsx
Renders a meal slot cell. Props: mealPlanId, dayOfWeek, mealType, plannedMeal (may be null), dayHouseholdMode.

Display:
- If no recipe: muted "+ Add" text
- If recipe assigned: recipe name, calorie count, cost-per-serving estimate
- If recipe is not kid-friendly (`isKidFriendly: false`) AND the day is DAD_MODE: show a small amber warning icon (Tabler `ti-alert-triangle`) with a tooltip "Not kid-friendly"
- Source badge if recipe source is SPOONACULAR or AI (small pill)

Clicking the slot opens `MealPickerSheet` with the slot's dayOfWeek and mealType pre-filled.

### MealPickerSheet.jsx
Opens in a `BottomSheet`. Contains 3 tabs:

Tab 1 -- "My recipes": a search input + scrollable list of recipe cards filtered to the slot's meal type. Each card shows name, macros summary, cost, kid-friendly icon. Tapping a recipe calls `PUT /api/mealplans/:id/meals` to assign it, then closes the sheet.

Tab 2 -- "Browse": filter chips for the current meal type, kid-friendly, budget, high-protein, quick. Updates the recipe list in real time.

Tab 3 -- "Ask AI": a button "Suggest for this slot." On click, shows a loading skeleton (this can take 5-15 seconds). Calls `POST /api/mealplans/:id/ai-suggest-slot` with dayOfWeek and mealType. Renders 3 suggestion cards with name, description, macro pills, cost estimate, and reason. Each card has an "Add to plan" button (assigns the recipe -- but first saves it as a new Recipe record with source AI, then assigns it) and a "Save to library" button (just saves the recipe without assigning).

If Ollama is unavailable, show the inline message "AI suggestions unavailable -- check Ollama connection in Settings" instead of the button.

### AIFillWeekButton.jsx
A button in WeekNav. On click, shows a loading state overlay on the grid (semi-transparent with a centered spinner and "Ivan is planning your week..." message). Calls `POST /api/mealplans/:id/ai-suggest`. On success, renders a full-week preview: the same WeekGrid but with the suggested meals overlaid in amber/highlighted cells. A "Accept all" button and a "Discard" button appear at the top. Accepting calls `PUT /api/mealplans/:id/meals` for each slot in sequence (or add a batch endpoint `POST /api/mealplans/:id/meals/batch` to the backend for efficiency). On discard, return to the current state.

---

## Recipe Library (pages/RecipeLibrary.jsx)

Replace the stub. The recipe library has two tabs at the page level: "My library" and "Find recipes."

Data requirements: fetch all recipes on mount.

### RecipeLibraryHeader.jsx
Search input and filter chips. Filter chips: All, Breakfast, Lunch, Dinner, Kid-friendly, High protein, Budget (cost per serving under $2.50), Quick (prep time under 15 min). Chips are multi-selectable. The search input does a local filter on the already-fetched recipe list (no additional API call).

### RecipeGrid.jsx
A responsive CSS grid (3 columns desktop, 2 columns tablet, 1 column mobile) of `RecipeCard` components. Shows `EmptyState` when no recipes match the current filters.

### RecipeCard.jsx
Displays: recipe name, meal type badge, cost per serving, prep time, macro summary (cal / P / C / F in small pills), kid-friendly icon (green checkmark if true), source badge (USER shows nothing, AI shows a small "AI" pill in purple, SPOONACULAR shows a small "Imported" pill in blue). Clicking the card opens `RecipeDetailModal`.

### RecipeDetailModal.jsx
Opens in a `BottomSheet`. Displays the full recipe:
- Name as heading
- Tags as badges
- A serving scaler: a number input labeled "Servings" defaulting to the recipe's base servings. Changing the number scales all ingredient quantities proportionally (client-side calculation, round to 1 decimal).
- Ingredients list with scaled quantities
- Instructions as a numbered list (split on newlines)
- Macros panel: 4 stat boxes (cal, protein, carbs, fat)
- Kid-friendly toggle (calls PUT recipe endpoint on change)
- For SPOONACULAR source: a small attribution line "Recipe sourced from Spoonacular"
- Action buttons: "Add to plan" (opens a day/meal-type picker then assigns), "Edit" (opens RecipeForm in edit mode), "Delete" (confirm dialog, then DELETE endpoint)

### RecipeForm.jsx
Opens in a `BottomSheet`. Used for both create and edit. Fields:
- Name (required text input)
- Description (optional textarea)
- Meal type (required dropdown)
- Servings (number input, default 1)
- Prep time in minutes (number input)
- Cost per serving in dollars (number input)
- Kid-friendly toggle
- Tags (free-text input that adds tag pills on Enter)
- Ingredients: a dynamic list. Each row has: quantity (number), unit (text), name (text), optional toggle, and a remove button. An "Add ingredient" button appends a new empty row. Each ingredient row has a small "Look up nutrition" icon button that calls `GET /api/nutrition/ingredient?name={ingredientName}` and shows a small popover with calories/protein/carbs/fat per 100g. Hide the popover silently if USDA returns no results.
- Instructions (textarea)
- "Estimate macros with AI" button: calls `POST /api/recipes/estimate-macros` with the current recipe name and ingredient list. On success, fills in the calorie, protein, carbs, fat fields. Shows a loading spinner on the button while waiting. Shows inline message if Ollama is offline.
- Submit button: calls POST or PUT recipe endpoint. On success, closes the sheet, shows a toast, and invalidates the recipes query.

### AISuggestPanel.jsx
A collapsible panel at the top of the My Library tab. When collapsed, shows a single "Suggest recipes with AI" button. When expanded, shows a text input with placeholder "e.g. high protein dinners under $3" and context chips: Tonight, This week, Kid-friendly, Budget, High protein, Under 15 min. Clicking a chip appends it to the input. A "Suggest" button calls a new backend endpoint `POST /api/recipes/ai-suggest` (add to the backend -- it takes a freeform prompt string and sends it to Ollama's `suggestMealForSlot` equivalent, returning an array of recipe suggestion objects). Each suggestion renders as a card with name, description, macro pills, and a "Save to library" button. If Ollama is offline, show the unavailable message.

### ExternalRecipeSearch.jsx
Only renders if `useHealth().health.spoonacularConnected` is true. Renders as the "Find recipes" tab on the RecipeLibrary page.

Contains:
- Search input (text, min 3 characters before firing)
- Filter row: meal type dropdown, diet chips (Vegetarian, Gluten-free, Dairy-free), max prep time slider (5-90 min), max cost slider ($1-$8 per serving)
- Results grid of external recipe cards (name, thumbnail image if available, prep time, cost estimate, diet tags)
- Tapping a result card calls `GET /api/recipes/search/external/:id` to fetch full detail, then opens a preview `BottomSheet` showing: name, full ingredient list, instructions preview, macros, and an "Import to my library" button
- Importing calls `POST /api/recipes/import/:spoonacularId`. On success: toast "Recipe saved to your library", close the sheet, invalidate the recipes query.
- A subtle footer showing "X of 150 daily searches used" using the `requestsRemainingToday` value from the search response. Hide this if the value is unavailable.

---

## Completion check

Phase 7 is complete when:
1. Dashboard shows today's meals, budget meter, and savings callout with real data
2. Marking a meal as eaten updates correctly and reflects in the budget summary
3. Logging an eating-out entry from the "Ate out" button works and appears in the budget
4. Week planner renders the 7-day grid on desktop and day-scroll on mobile
5. Household mode toggle per day calls the API and updates the badge
6. Clicking a meal slot opens the picker, and selecting a recipe assigns it to the plan
7. AI suggest for a slot calls Ollama and renders 3 options (test with Ollama running)
8. Recipe library renders all 15 seed recipes with correct filters
9. Creating a new recipe via the form works end-to-end
10. External recipe search (Find recipes tab) appears and returns Spoonacular results when API key is configured

After confirming, proceed to PHASE-8.md.
