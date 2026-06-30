# PHASE-8 — Frontend Screens Part 2 & Onboarding

## Context

You are building NutriLabs, a self-hosted meal planning and grocery budgeting web app. This is Phase 8 of 8 -- the final phase. Phase 7 built the Dashboard, Week Planner, and Recipe Library. Your job in this phase is to build the remaining three screens (Grocery List, Budget Tracker, Settings), the first-run onboarding flow, and apply all final polish. When this phase is complete, NutriLabs should be fully functional end-to-end.

Read `README.md` in this roadmap folder before starting for global conventions that apply to all phases.

---

## Component locations

```
apps/web/src/components/
├── grocery/
│   ├── StoreSelector.jsx
│   ├── GroceryListBody.jsx
│   ├── GroceryItemRow.jsx
│   ├── ListToolbar.jsx
│   ├── LogSpendModal.jsx
│   └── KrogerPriceStatus.jsx
├── budget/
│   ├── BudgetSummaryCards.jsx
│   ├── WeeklyTrendChart.jsx
│   ├── AIInsightBanner.jsx
│   ├── EatOutLogTable.jsx
│   └── LogEatOutFAB.jsx
└── settings/
    ├── ProfilesTab.jsx
    ├── CustodyTab.jsx
    ├── NutritionTab.jsx
    ├── PantryTab.jsx
    ├── ConnectionsTab.jsx
    └── PreferencesTab.jsx
```

---

## Grocery List (pages/GroceryList.jsx)

Replace the stub. This screen shows the grocery list for the current week's meal plan.

Data requirements: fetch the current week's meal plan id, then fetch its grocery list via `GET /api/grocery/:mealPlanId`. Use TanStack Query. If no meal plan exists for the current week, show an `EmptyState` with the message "No meal plan for this week" and a "Go plan your week" button linking to `/plan`.

### StoreSelector.jsx
A tab bar with three tabs: Walmart, Kroger, Aldi. Each tab label includes the estimated total basket cost for that store (`$XX.XX`). The cheapest store gets a small green "Best value" badge. Selecting a tab sets `activeStore` state which controls which price column is shown in `GroceryItemRow`. Default to whichever store has the most price data.

### GroceryListBody.jsx
Renders the grocery items grouped by category in this order: Produce, Protein, Dairy, Grains, Canned, Frozen, Misc. Each group has a category label header with a Tabler icon (leaf for produce, meat for protein, etc.) and the group's subtotal for the active store. Below all groups, a collapsed section labeled "Excluded (pantry staples)" shows items that were filtered out. Clicking it expands the list. Each excluded item has an "Add back" button that removes it from the pantry staples list (calls `DELETE /api/pantry/:id` for the matching staple).

### GroceryItemRow.jsx
One row per grocery item. Left side: checkbox (clicking calls `PUT /api/grocery/:listId/item/:itemId` with `checked: true/false`), item name, quantity and unit in muted text. Right side: price for the active store formatted with `centsToDisplay`. Checked items render with strikethrough on the name and reduced opacity. On mobile, long-pressing a row (300ms press) shows a small action menu with "Delete item" (removes from list) and "Add to pantry staples."

### ListToolbar.jsx
A row of action buttons above the grocery list: "Regenerate from plan" (calls `POST /api/grocery/:mealPlanId/generate`, shows confirm dialog first if items are already checked), "Refresh Kroger prices" (calls `GET /api/grocery/:listId/prices`, disabled if Kroger not configured), "Log what I spent" (opens `LogSpendModal`).

### LogSpendModal.jsx
Opens in a `BottomSheet`. Fields: amount spent (dollar input, required), store (dropdown: Walmart, Kroger, Aldi, Other), date (date input, defaults to today). A "Save" button calls `POST /api/grocery/:listId/log-spend`. On success: toast "Spend logged", closes modal, invalidates budget query.

### KrogerPriceStatus.jsx
A small status line below the StoreSelector. If Kroger prices have been fetched: "Kroger prices updated [time ago]" in muted green. If not fetched and Kroger is configured: "Kroger prices not loaded -- tap Refresh" in muted amber. If Kroger is not configured: render nothing.

---

## Budget Tracker (pages/BudgetTracker.jsx)

Replace the stub.

Data requirements: fetch `GET /api/budget/summary` and `GET /api/budget/weekly` and `GET /api/eatingout` on mount. Fetch `GET /api/budget/insight` for the AI insight (can load asynchronously after main data).

### BudgetSummaryCards.jsx
A 2x2 grid of stat cards (on mobile, 2 columns; on desktop, 4 columns in a row):
1. "This month -- groceries": `centsToDisplay(thisMonth.grocerySpend)`
2. "This month -- eating out": `centsToDisplay(thisMonth.eatingOutSpend)`
3. "vs. last month": show the delta with a green down-arrow if eating out spend decreased, red up-arrow if increased
4. "Total saved": `centsToDisplay(allTime.totalSaved)` with a small trophy icon

### WeeklyTrendChart.jsx
A Chart.js bar chart using `react-chartjs-2`. Configuration:
- Type: grouped bar
- X axis: week start dates (last 12 weeks, formatted as "Jun 29")
- Two datasets: "Groceries" (primary green color) and "Eating out" (accent amber color)
- Values in dollars (convert from cents for display)
- Y axis starts at 0, label shows "$"
- Responsive: true, maintains aspect ratio on resize
- Legend at top
- Tooltip shows dollar amounts
- Show a `SkeletonCard` while data is loading

### AIInsightBanner.jsx
Fetches `GET /api/budget/insight` independently with a 24-hour stale time (re-fetches once per day). While loading, shows a `SkeletonText` spanning 60% width. On success, renders the insight sentence in a subtle green-tinted card with a small sparkle icon. If the fetch fails or Ollama is offline, render nothing (do not show an error state).

### EatOutLogTable.jsx
A table of eating out log entries. Columns: Date, Meal, Place, Amount, Mode (Solo/Dad). On mobile, render as stacked cards instead of a table. Each row/card has an edit button (opens a pre-filled `BottomSheet` form) and a delete button (confirm dialog). Supports filtering by month via a month selector dropdown at the top. Show `EmptyState` with message "No eating out logged yet" when list is empty. Pagination: show 10 entries per page with prev/next controls.

### LogEatOutFAB.jsx
On mobile only: a floating action button fixed at the bottom right (above the bottom nav bar). Renders a "+" icon. Clicking opens a `BottomSheet` form to quickly log an eating out entry (same fields as `EatOutModal` from the Dashboard). On desktop, show a regular "Log eating out" button in the page header instead of a FAB.

---

## Settings (pages/Settings.jsx)

Replace the stub. Renders a tabbed layout. On desktop: vertical tab list on the left, content on the right. On mobile: horizontal scrollable tab strip at the top, content below.

Tabs: Profiles, Custody, Nutrition, Pantry, Connections, Preferences.

### ProfilesTab.jsx
Lists all household profiles. Each profile shows a colored avatar circle (initials), name, age (if set), and a brief summary of dietary notes. Edit and delete buttons per row. The planner's profile (isPlanner: true) shows a small "You" badge and cannot be deleted. An "Add profile" button opens a `BottomSheet` form with fields: name, age, avatar color picker (6 preset colors to choose from), dietary notes textarea, food dislikes textarea, calorie target number input. Saving calls POST or PUT profile endpoint, invalidates profiles query.

### CustodyTab.jsx
A 7-day weekly template grid. Each row: day name, a toggle button switching between "Solo" and "Dad mode." At the top: a toggle labeled "I have alternating weeks." When enabled, a second 7-day row appears labeled "Alternate week." Each row in the alternate week also has Solo/Dad mode toggles. A "Save as my default" button calls `PUT /api/settings/custody-template` with the full 7 or 14 day configuration. Shows a success toast on save.

### NutritionTab.jsx
Form fields:
- Daily calorie target (number input, labeled "Your daily calorie goal")
- Macro split: three range sliders for protein %, carbs %, fat %. Constrain them so they always sum to 100 -- when one slider moves, adjust the others proportionally. Show live percentages next to each slider.
- Weekly grocery budget (dollar input)
- Eating out reference cost (dollar input, labeled "Estimated cost per meal eating out" with helper text explaining this is used for savings calculations)
A "Save" button calls `PUT /api/settings` with the nutrition fields. Shows a success toast.

### PantryTab.jsx
A tag-cloud style list of pantry staple names. Each tag shows the staple name and an X button. Clicking X calls `DELETE /api/pantry/:id` (with confirmation). Below the tags: a text input with placeholder "Add a staple..." -- pressing Enter or clicking the "+" button calls `POST /api/pantry` and adds the new tag. Pre-populate visually with all seeded pantry staples.

### ConnectionsTab.jsx
Four sections separated by dividers:

**Ollama:**
- Host URL input (pre-filled from AppSettings)
- Model selector: a dropdown populated by calling `GET /api/ollama/models`. Shows "Loading..." while fetching. Falls back to a text input if the fetch fails.
- A "Test connection" button: calls `POST /api/ollama/test`, shows a green checkmark and "Connected -- X models available" on success, or a red X and error message on failure.
- Saves URL and model to AppSettings on blur/change.

**Kroger API:**
- Client ID input (shows masked "••••••••" if already set, placeholder "Enter Client ID" if not)
- Client Secret input (same masking behavior)
- Zip code input
- A "Test connection" button
- A helper note: "Optional. Enables real-time grocery pricing. Register free at developer.kroger.com"

**Spoonacular:**
- API key input (masked if already set)
- A "Test connection" button that calls a search for "chicken" and shows success if results return
- Daily quota display: "X of 150 searches used today" -- fetched from the last search response or a new `GET /api/recipes/spoonacular-quota` endpoint
- A helper note: "Optional. Enables searching millions of recipes. Register free at spoonacular.com"

**USDA FoodData Central:**
- API key input (optional, shows placeholder "Leave blank to use DEMO_KEY")
- A helper note explaining DEMO_KEY limits (30/hr, 50/day) and link to free key signup
- A "Test connection" button

All inputs in this tab call `PUT /api/settings` on change (debounced 500ms) to save without requiring an explicit save button.

### PreferencesTab.jsx
- Week start day: dropdown (Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday)
- Date format: dropdown (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD)
- Currency: dropdown (USD, EUR, GBP, CAD -- others can be added later)
A "Save preferences" button calls `PUT /api/settings`. On the same page, a "Change password" section with current password, new password, confirm new password inputs and a save button (add `PUT /api/auth/password` endpoint to the backend -- verifies current password, updates hash).

---

## First-run onboarding (pages/Setup.jsx)

Replace the stub. This is a multi-step flow shown only on first run (when no user exists in the database).

Step 1 -- Create account:
- Email input and password input (with confirm password)
- Submits to `POST /api/auth/setup`
- On success, automatically logs in and advances to step 2

Step 2 -- Set your goals:
- Weekly grocery budget (dollar input, default $120)
- Your eating out reference cost per meal (dollar input, default $12, with explanatory helper text)
- Your daily calorie goal (number input, default 1800)
- A "Continue" button saves these to AppSettings and advances to step 3

Step 3 -- Your household:
- Pre-filled profile for "Ivan" (planner) is shown as already created
- Prompt: "Add your children (optional)" -- a simple form for each child: name and age. An "Add another child" button adds more rows. A "Skip" link bypasses this step.
- Submitting creates the child profiles and advances to step 4

Step 4 -- Ollama connection:
- Explains what Ollama is in one sentence ("Your local AI running on your home network")
- Shows the default host `http://192.168.1.190:11434` pre-filled
- A "Test connection" button
- A "Skip for now" link
- A "Finish setup" button that saves the host and navigates to `/`

Design: clean, centered card layout with a step indicator at the top (1 of 4, 2 of 4, etc.). Warm, welcoming tone. Each step has a brief headline and one sentence of context.

---

## Final polish

Apply these finishing touches across the entire app after all screens are built:

**Page titles:** Set the browser tab title (`document.title`) for each page: "NutriLabs -- Dashboard", "NutriLabs -- Week Planner", etc.

**Loading skeletons:** Verify every data-dependent component shows an appropriate skeleton while loading. No page should show a blank white area during a fetch.

**Mobile scroll:** Ensure no horizontal overflow on any screen at 375px viewport width. Test each screen.

**Empty states:** Verify `EmptyState` components render correctly on: Recipe Library with no recipes matching filters, Grocery List with no meal plan, Budget Tracker with no eating out log entries, Week Planner with no recipes assigned.

**Toast messages:** Audit all mutations and ensure every success and meaningful error has a toast notification with a clear, friendly message.

**Confirm dialogs:** Verify all destructive actions (delete recipe, delete profile, clear week, regenerate grocery list when items are checked) use the `ConfirmDialog` component.

---

## README (final)

Write the final `README.md` at the project root with:
1. What NutriLabs is (2 paragraphs)
2. Prerequisites: Docker Desktop or Docker Engine + Compose plugin, pnpm, a machine running Ollama on the local network
3. Quick start (step by step):
   - Clone the repo
   - Copy `.env.example` to `.env` and fill in required values (DATABASE_URL, JWT_SECRET, OLLAMA_HOST pointing to 192.168.1.190:11434)
   - `docker compose up --build -d`
   - Open `http://localhost:1042` and complete the setup wizard
4. Optional integrations section: Spoonacular (link), Kroger API (link), USDA key (link) -- each with one sentence on what it enables
5. Environment variable reference table with all variables, whether required/optional, and description
6. Operations section: how to back up the database (`docker exec nutrilabs-postgres-1 pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup.sql`), how to restore, how to update Ollama model (change in Settings > Connections), how to point a custom domain (one paragraph, no deep detail)
7. Troubleshooting: Ollama not connecting (check LAN IP, check Ollama is running, check firewall), Spoonacular search not appearing (check key in Settings, check daily quota), database reset (`docker compose down -v` warning)

---

## Completion check

Phase 8 is complete when:
1. Grocery list generates from a meal plan with correct deduplication and pantry staple exclusion
2. Checking items off the grocery list persists correctly
3. Logging spend updates the budget tracker
4. Budget tracker chart renders with data from the last 12 weeks (zeros where no data)
5. AI insight banner appears with a Ollama-generated sentence (test with Ollama running)
6. All 6 settings tabs save their data correctly and reflect on next page load
7. First-run setup flow works end-to-end: create account -> set goals -> add children -> connect Ollama -> land on Dashboard
8. The app is fully usable on a 375px mobile viewport with no horizontal scroll or broken layouts
9. No console errors on any screen
10. `docker compose down && docker compose up --build` starts cleanly with all previous data intact (volumes preserved)

NutriLabs is complete. 🎉
