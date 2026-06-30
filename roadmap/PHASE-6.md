# PHASE-6 — Frontend Shell & Shared Components

## Context

You are building NutriLabs, a self-hosted meal planning and grocery budgeting web app. This is Phase 6 of 8. Phases 1-5 built the complete backend. Your job in this phase is to build the React frontend shell -- routing, layout, authentication flow, API client, shared hooks, and all reusable UI components. No page-specific screens are built in this phase (those are Phases 7 and 8). The goal is a running, authenticated frontend shell that renders correctly on mobile and desktop.

Read `README.md` in this roadmap folder before starting for global conventions that apply to all phases.

---

## Source structure

Organize `apps/web/src/` as follows:

```
apps/web/src/
├── main.jsx                  # React entry point
├── App.jsx                   # Router and QueryClient setup
├── api/
│   └── client.js             # Axios instance and all API call functions
├── hooks/
│   ├── useAuth.js
│   ├── useSettings.js
│   ├── useHealth.js
│   └── useProfiles.js
├── store/
│   └── uiStore.js            # Zustand store for UI state
├── components/
│   ├── layout/
│   │   ├── AppShell.jsx      # outer layout with nav
│   │   ├── Sidebar.jsx       # desktop left nav
│   │   └── BottomNav.jsx     # mobile bottom tab bar
│   ├── ui/
│   │   ├── BottomSheet.jsx
│   │   ├── ConfirmDialog.jsx
│   │   ├── Skeleton.jsx
│   │   ├── Badge.jsx
│   │   ├── HouseholdBadge.jsx
│   │   ├── ErrorBoundary.jsx
│   │   └── EmptyState.jsx
│   └── auth/
│       ├── RequireAuth.jsx
│       └── SetupGuard.jsx
├── pages/
│   ├── Setup.jsx             # first-run setup (stub in this phase)
│   ├── Login.jsx             # login page
│   ├── Dashboard.jsx         # stub
│   ├── WeekPlanner.jsx       # stub
│   ├── RecipeLibrary.jsx     # stub
│   ├── GroceryList.jsx       # stub
│   ├── BudgetTracker.jsx     # stub
│   └── Settings.jsx          # stub
└── utils/
    ├── currency.js           # format cents to dollar string
    ├── dates.js              # date helpers
    └── macros.js             # macro percentage helpers
```

---

## API client (api/client.js)

Create an Axios instance with:
- `baseURL` set to the `VITE_API_URL` env var (defaults to `/api`)
- `withCredentials: true` so the auth cookie is sent automatically
- A response interceptor that: on 401, clears local auth state and redirects to `/login`
- A response interceptor that unwraps the `data` field from the standard response shape so callers receive data directly
- An error interceptor that extracts the `error.message` from the response body for use in toast notifications

Export individual named async functions for every API endpoint defined in Phases 3-5. Organize them in logical groups (auth, profiles, recipes, mealplans, grocery, budget, eatingout, settings, ollama, nutrition). Each function calls the Axios instance and returns the unwrapped data. Do not use any global state in this module -- it is a pure HTTP client.

---

## Hooks

### useAuth.js
Uses TanStack Query to fetch `GET /api/auth/me`. Returns `{ user, isLoading, isAuthenticated }`. Exposes a `logout` mutation that calls the logout endpoint and invalidates the query.

### useSettings.js
Uses TanStack Query to fetch `GET /api/settings`. Returns `{ settings, isLoading }`. Exposes an `updateSettings` mutation.

### useHealth.js
Uses TanStack Query to fetch `GET /api/health` with a 60-second stale time. Returns `{ health, isLoading }` where health contains the connection status flags.

### useProfiles.js
Uses TanStack Query to fetch `GET /api/profiles`. Returns `{ profiles, isLoading }`. Exposes `createProfile`, `updateProfile`, `deleteProfile` mutations that each invalidate the profiles query on success.

---

## Zustand store (store/uiStore.js)

Store the following UI state:
- `activeBottomSheet`: string or null (which bottom sheet is open)
- `confirmDialog`: `{ open: boolean, title, message, onConfirm }` or null
- `openBottomSheet(name)`, `closeBottomSheet()`
- `showConfirm(title, message, onConfirm)`, `closeConfirm()`

---

## Routing (App.jsx)

Set up React Router v6 with the following routes:

```
/setup          -> <SetupGuard><Setup /></SetupGuard>
/login          -> Login page (redirect to / if already authenticated)
/               -> <RequireAuth><AppShell /></RequireAuth>
  /             -> Dashboard (index)
  /plan         -> WeekPlanner
  /recipes      -> RecipeLibrary
  /shop         -> GroceryList
  /budget       -> BudgetTracker
  /settings     -> Settings
```

Wrap the entire app in `QueryClientProvider` and `Toaster` (react-hot-toast).

---

## Auth guards

### RequireAuth.jsx
Checks `useAuth`. If not authenticated and not loading, redirect to `/login`. If loading, show a full-page skeleton. Otherwise render children.

### SetupGuard.jsx
Checks `GET /api/health` to see if `dbConnected` is true. Also checks if the setup endpoint would succeed (can call a lightweight `GET /api/auth/setup-status` -- add this to the backend: returns `{ setupComplete: boolean }` without requiring auth). If setup is already complete, redirect to `/login`. Otherwise render children.

---

## Layout

### AppShell.jsx
The main layout wrapper for authenticated pages. Renders:
- `Sidebar` on screens >= 768px
- `BottomNav` on screens < 768px
- A `<main>` content area that fills remaining space
- The `ConfirmDialog` component (reads from uiStore)

### Sidebar.jsx (desktop)
Left sidebar, fixed width 220px. Contains:
- NutriLabs logo/wordmark at top (text-based, no image dependency)
- Navigation links: Home, Plan, Recipes, Shop, Budget (each with a Tabler outline icon and label)
- Settings link at the bottom
- A compact connection status indicator at the very bottom showing colored dots for Ollama, Spoonacular, Kroger (green if connected, gray if not, red if error). Uses `useHealth` data.

### BottomNav.jsx (mobile)
Fixed bottom tab bar. 5 tabs: Home, Plan, Recipes, Shop, Budget. Each tab has a Tabler outline icon and a short label. Active tab uses the primary color. Uses React Router's `useLocation` to determine active tab.

---

## Shared UI components

### BottomSheet.jsx
A component that renders as a bottom sheet on mobile (< 768px) and as a centered modal on desktop (>= 768px).

Props: `isOpen` (boolean), `onClose` (function), `title` (string), `children`.

Mobile: fixed positioned overlay with a white panel that slides up from the bottom. Has a drag handle bar at the top. Clicking the overlay dismisses it.

Desktop: fixed positioned overlay with a centered white card (max-width 480px). Has a close button (X) in the top right corner.

Both: traps focus when open, closes on Escape key.

### ConfirmDialog.jsx
Reads state from uiStore. Renders a centered dialog overlay. Shows title, message, a Cancel button, and a Confirm button (styled in danger/red). Clicking Confirm calls `onConfirm` then closes. Clicking Cancel or overlay just closes.

### Skeleton.jsx
A reusable skeleton loader. Props: `width`, `height`, `className`. Renders a rounded rectangle with an animated shimmer effect using only CSS (no external library). Export named variants: `SkeletonText` (full-width line), `SkeletonCard` (fixed-height block), `SkeletonGrid` (3-column grid of cards).

### Badge.jsx
A small pill-shaped label. Props: `label` (string), `variant` (one of: default, success, warning, danger, info, purple). Uses Tailwind color classes. Renders with appropriate background and text color per variant.

### HouseholdBadge.jsx
A specialized badge for household mode. Props: `mode` (SOLO or DAD_MODE), `profiles` (array -- only used when DAD_MODE). When SOLO: renders a gray badge with a person icon and "Solo day". When DAD_MODE: renders an amber/warm badge with a people icon and the names of active child profiles (e.g. "Dad mode -- Lily, Sophie"). Clicking it calls an optional `onToggle` prop.

### ErrorBoundary.jsx
A class component error boundary. Wraps all page components. Shows a simple "Something went wrong" message with a "Reload page" button. Logs the error to console.

### EmptyState.jsx
A centered empty state display. Props: `icon` (Tabler icon name string), `title`, `message`, `actionLabel` (optional), `onAction` (optional). Renders the icon at 48px, title, muted message text, and an optional action button.

---

## Utility modules

### utils/currency.js
- `centsToDisplay(cents)`: converts integer cents to formatted dollar string (e.g. 1299 -> "$12.99")
- `dollarsToCents(dollars)`: converts float dollars to integer cents
- `formatBudgetProgress(spent, total)`: returns `{ percent, label, colorClass }` where colorClass is a Tailwind text color class (green under 70%, amber 70-90%, red over 90%)

### utils/dates.js
- `getWeekStart(date, weekStartDay)`: given a date and a weekStartDay enum value, returns the Monday/Sunday/etc. that starts that week
- `formatDate(date, format)`: formats a date using the user's configured dateFormat string
- `dayEnumToLabel(dayEnum)`: converts "MON" -> "Monday", "TUE" -> "Tuesday", etc.
- `shortDayLabel(dayEnum)`: converts "MON" -> "Mon", etc.

### utils/macros.js
- `macroPercents(protein, carbs, fat)`: returns `{ proteinPct, carbsPct, fatPct }` as percentages of total calories
- `caloriesFromMacros(protein, carbs, fat)`: returns total calories using 4/4/9 kcal ratios

---

## Page stubs

Create stub versions of all 7 pages (Setup, Login, Dashboard, WeekPlanner, RecipeLibrary, GroceryList, BudgetTracker, Settings). Each stub renders the page title in an h1 and a muted "Coming soon" paragraph. These will be fully replaced in Phases 7 and 8.

### Login page (not a stub -- build fully in this phase)
A centered card layout. Email and password inputs. A "Sign in" button. On submit, calls the login API function, on success navigates to `/`. Shows a toast on error. No registration link (single-user app). On mobile, the card fills the screen.

---

## Completion check

Phase 6 is complete when:
1. `http://localhost:1042` redirects to `/login` when not authenticated
2. Logging in with `admin@nutrilabs.local` / `nutrilabs` succeeds and redirects to `/`
3. The AppShell renders correctly -- sidebar visible on desktop, bottom nav on mobile
4. Navigating between stub pages works without errors
5. The connection status indicator in the sidebar shows correct states (Ollama should show green if Phase 4 is complete and Ollama is running)
6. The BottomSheet component opens and closes correctly on both mobile and desktop
7. The ConfirmDialog shows and fires its callback correctly
8. No console errors on any route

After confirming, proceed to PHASE-7.md.
