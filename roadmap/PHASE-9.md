# PHASE-9 — Barcode Scanning, Pantry Inventory, User Registration, Password Reset & Account Deletion

## Context

You are building NutriLabs, a self-hosted meal planning and grocery budgeting web app. This is Phase 9 -- an additive phase that extends a completed Phase 1-8 build. It adds four new capabilities:

1. **Barcode scanning** -- phone camera scans a product barcode, looks it up via Open Food Facts, and saves it to a pantry inventory
2. **Pantry inventory** -- a tracked list of scanned items with quantities, macros, and the ability to add them to the meal plan as snacks
3. **User registration** -- multi-user support with full profile setup at registration
4. **Forgot password** -- email-based reset link via SMTP
5. **Delete account** -- soft delete with 30-day data retention before permanent purge

Read `README.md` in this roadmap folder before starting for global conventions that apply to all phases.

---

## Part 1: Database schema additions

Add the following new models to `apps/api/prisma/schema.prisma`. Do not modify existing models except where explicitly noted below.

### New model: PantryInventoryItem
Tracks scanned or manually added food products in the user's physical pantry.
- `id` int, auto-increment, primary key
- `userId` int, foreign key to User
- `name` string
- `brand` string, nullable
- `barcode` string, nullable (UPC or EAN code)
- `servingSize` string, nullable (e.g. "30g", "1 cup")
- `servingSizeG` decimal(8,2), nullable (serving size normalized to grams)
- `calories` int, nullable (per serving)
- `proteinG` decimal(6,2), nullable
- `carbsG` decimal(6,2), nullable
- `fatG` decimal(6,2), nullable
- `ingredients` string, nullable (raw ingredients text from product label)
- `imageUrl` string, nullable (product image from Open Food Facts)
- `quantity` decimal(8,2), default 1 (how many units/servings the user has on hand)
- `unit` string, default "serving"
- `openFoodFactsId` string, nullable (Open Food Facts product barcode used as their ID)
- `source` enum: `SCANNED`, `MANUAL` (how it was added)
- `createdAt` datetime, default now
- `updatedAt` datetime, updated automatically

### New model: PasswordResetToken
- `id` int, auto-increment, primary key
- `userId` int, foreign key to User
- `token` string, unique (a cryptographically random hex string)
- `expiresAt` datetime (1 hour from creation)
- `usedAt` datetime, nullable (null until redeemed)
- `createdAt` datetime, default now

### Modifications to existing models

**User model -- add these fields:**
- `displayName` string, nullable
- `isActive` boolean, default true
- `deactivatedAt` datetime, nullable (set when soft-deleted)
- `scheduledPurgeAt` datetime, nullable (set to 30 days after deactivatedAt)

**AppSettings model -- add these fields:**
- `smtpHost` string, nullable
- `smtpPort` int, nullable, default 587
- `smtpUser` string, nullable
- `smtpPassword` string, nullable (stored as plaintext -- this is a local homelab app)
- `smtpFromAddress` string, nullable (e.g. "nutrilabs@yourdomain.com")
- `smtpFromName` string, default "NutriLabs"
- `appBaseUrl` string, nullable (used to build password reset links, e.g. "http://localhost:1042" or "https://nutrilabs.nexmolab.us")

Run `prisma migrate dev --name phase9` after all schema changes.

---

## Part 2: Backend additions

### File structure additions

```
apps/api/src/
├── services/
│   ├── openFoodFacts.js    # new
│   └── mailer.js           # new
├── routes/
│   ├── pantryInventory.js  # new
│   └── account.js          # new -- registration, password reset, delete account
└── jobs/
    └── purgeAccounts.js    # new -- scheduled soft-delete purge job
```

---

### Open Food Facts service (services/openFoodFacts.js)

Base URL: `https://world.openfoodfacts.org`

No API key required. Set a `User-Agent` header on all requests identifying the app: `NutriLabs/1.0 (self-hosted meal planner)` -- Open Food Facts requires this for non-browser clients.

All functions handle errors gracefully and return null on failure.

#### Function: lookupBarcode(barcode)
Calls `GET https://world.openfoodfacts.org/api/v0/product/{barcode}.json`.

Checks `response.status` field -- if not 1, the product was not found, return null.

From `response.product`, extract and return a clean object:
- `name`: from `product_name` or `product_name_en`
- `brand`: from `brands`
- `barcode`: the input barcode
- `openFoodFactsId`: the input barcode (OFF uses barcode as ID)
- `imageUrl`: from `image_front_url` or `image_url`
- `servingSize`: from `serving_size`
- `servingSizeG`: parse the numeric value from `serving_size_100g` or derive from `serving_size` string if possible
- `ingredients`: from `ingredients_text_en` or `ingredients_text`
- Macros per serving (not per 100g): calculate from `nutriments` using serving size ratio:
  - `calories`: `nutriments['energy-kcal_serving']` or calculate from `energy-kcal_100g` * (servingSizeG / 100)
  - `proteinG`: `nutriments['proteins_serving']` or derive from `proteins_100g`
  - `carbsG`: `nutriments['carbohydrates_serving']` or derive from `carbohydrates_100g`
  - `fatG`: `nutriments['fat_serving']` or derive from `fat_100g`

If a field is missing from the OFF response, set it to null rather than throwing.

#### Function: searchProduct(query)
Calls `GET https://world.openfoodfacts.org/cgi/search.pl?search_terms={query}&search_simple=1&action=process&json=1&page_size=10`.

Returns an array of up to 10 products, each with: barcode (from `code`), name, brand, imageUrl, calories per serving. Used as a fallback search when a barcode scan fails to find a product.

---

### Mailer service (services/mailer.js)

Uses the `nodemailer` npm package. Add `nodemailer` to `apps/api/package.json` dependencies.

#### Function: createTransport(smtpSettings)
Takes an smtpSettings object from AppSettings. Creates and returns a nodemailer transporter configured with host, port, user, and password. If any required SMTP field is missing, return null.

#### Function: sendPasswordResetEmail(toEmail, resetLink, smtpSettings)
Builds and sends an HTML email:
- Subject: "Reset your NutriLabs password"
- Body: a clean, minimal HTML email with the NutriLabs name at the top, a sentence explaining the link expires in 1 hour, a prominent button/link to the reset URL, and a plain-text fallback line with the raw URL
- Plain text version included alongside HTML

Returns `{ success: true }` on successful send or `{ success: false, error: message }` on failure.

#### Function: testSmtpConnection(smtpSettings)
Creates a transporter and calls `transporter.verify()`. Returns `{ connected: true }` or `{ connected: false, error: message }`.

---

### Account routes (routes/account.js)

Mount at `/api/account`. These routes handle registration, password reset, and account deletion.

#### POST /api/account/register
No auth required. Open registration (multi-user support).

Accepts: `email`, `password`, `confirmPassword`, `displayName`.

Validation:
- Email must be valid format and not already in use (return 409 `EMAIL_TAKEN` if taken)
- Password minimum 8 characters
- confirmPassword must match password
- displayName required, 2-50 characters

On success:
1. Hash password with bcrypt (12 rounds)
2. Create User row with `isActive: true`
3. Create default AppSettings row for the new user (all defaults as defined in Phase 2, do not copy SMTP or API key settings from other users)
4. Create a default planner Profile for the user using `displayName` as the profile name
5. Create default CustodyTemplate rows (all days SOLO as default -- user configures in Settings)
6. Create default PantryStaple rows (the same seeded staples from Phase 2)
7. Automatically log the user in by returning a JWT cookie (same logic as the login route)
8. Return the created user (no passwordHash) and a `{ setupRequired: true }` flag so the frontend knows to redirect to the onboarding flow

Note: the existing `POST /api/auth/setup` route from Phase 3 remains for first-run setup but should now delegate to the same creation logic as this route. Refactor to avoid duplication.

#### POST /api/account/forgot-password
No auth required.

Accepts: `email`.

Always return a 200 response regardless of whether the email exists (prevents user enumeration). Message: "If an account exists with that email, a reset link has been sent."

If the email exists and the user is active:
1. Delete any existing unused PasswordResetToken for this user
2. Generate a cryptographically random 32-byte hex token using Node's `crypto.randomBytes`
3. Set `expiresAt` to 1 hour from now
4. Save to PasswordResetToken table
5. Build the reset URL: `{appBaseUrl}/reset-password?token={token}`
6. Read SMTP settings from the user's AppSettings (fall back to the first admin user's AppSettings if the requesting user's SMTP is not configured)
7. Call `sendPasswordResetEmail`. If sending fails, log the error server-side but still return 200 to the client.

#### POST /api/account/reset-password
No auth required.

Accepts: `token`, `newPassword`, `confirmPassword`.

Validation:
- Find PasswordResetToken by token value
- Token must exist, not be expired (`expiresAt > now`), and not already used (`usedAt` is null)
- `newPassword` minimum 8 characters, must match `confirmPassword`

On success:
1. Update the User's `passwordHash`
2. Set `usedAt` to now on the PasswordResetToken
3. Invalidate all existing JWT sessions for this user by adding a `passwordChangedAt` datetime field to the User model (add this field in the migration) -- the JWT auth middleware should reject tokens issued before `passwordChangedAt`
4. Return success

On failure: return 400 with appropriate error code (`TOKEN_INVALID`, `TOKEN_EXPIRED`, `PASSWORD_MISMATCH`).

#### PUT /api/auth/password (already referenced in Phase 8 -- implement here if not already done)
Requires auth. Accepts: `currentPassword`, `newPassword`, `confirmPassword`. Verifies current password, updates hash, sets `passwordChangedAt`. Returns success.

#### POST /api/account/deactivate
Requires auth. Soft-deletes the authenticated user's account.

Accepts: `password` (required -- user must confirm their password to delete).
Accepts: `confirmPhrase` (required -- user must type "delete my account" exactly).

Steps:
1. Verify password
2. Verify confirmPhrase === "delete my account"
3. Set `isActive: false`, `deactivatedAt: now`, `scheduledPurgeAt: 30 days from now` on the User row
4. Clear the auth cookie
5. Return success

The account is now deactivated. The user cannot log in (update the login route to check `isActive: true` and return `ACCOUNT_DEACTIVATED` if false). All data is preserved until purge.

#### GET /api/account/reactivate?token={token}
No auth required. Future-proofing endpoint -- allows a deactivated user to cancel their deletion within the 30-day window by receiving a reactivation link (send this link in a confirmation email when they deactivate). For now, implement the endpoint logic but the email sending can be wired in a follow-up.

Accepts a reactivation token (generate and store this similarly to password reset tokens at deactivation time). Sets `isActive: true`, clears `deactivatedAt` and `scheduledPurgeAt`. Returns success and redirects to `/login`.

---

### Pantry inventory routes (routes/pantryInventory.js)

All require auth. All data scoped to authenticated user.

#### GET /api/pantry-inventory
Returns all PantryInventoryItems for the user, ordered by createdAt descending. Support optional query param `search` for name/brand substring filter.

#### POST /api/pantry-inventory/scan
Accepts: `barcode` (string).
1. Calls `openFoodFacts.lookupBarcode(barcode)`
2. If product found, check if a PantryInventoryItem with the same `barcode` already exists for this user -- if so, increment its `quantity` by 1 and return it with `{ alreadyExisted: true }`
3. If not found in inventory, create a new PantryInventoryItem from the OFF data with `source: SCANNED`, `quantity: 1`
4. Return the created or updated item
5. If OFF returns null (product not found), return 404 with code `PRODUCT_NOT_FOUND` and a suggestion to use `POST /api/pantry-inventory/search` instead

#### POST /api/pantry-inventory/search
Accepts: `query` (string).
Calls `openFoodFacts.searchProduct(query)`. Returns the array of product results. These are not saved -- the client lets the user pick one and then calls the add endpoint.

#### POST /api/pantry-inventory
Manually add an item (user-entered or selected from a search result).
Accepts all PantryInventoryItem fields. Sets `source: MANUAL`. Creates the record. Returns the created item.

#### PUT /api/pantry-inventory/:id
Update an inventory item. Commonly used to update `quantity`. Verify ownership. Returns updated item.

#### DELETE /api/pantry-inventory/:id
Delete an inventory item. Verify ownership.

#### POST /api/pantry-inventory/:id/add-to-plan
Add a pantry inventory item to the meal plan as a snack.
Accepts: `mealPlanId`, `dayOfWeek`, `mealType` (should default to SNACK).

Steps:
1. Look up the PantryInventoryItem
2. Check if a Recipe already exists in the database with `name` matching the item's name (case-insensitive) -- if yes, use that recipe
3. If no matching recipe, create a new Recipe record from the inventory item data: name, description as brand name, mealType SNACK, source USER, macros from the inventory item, servings 1, instructions null, isKidFriendly defaulting to true
4. Assign the recipe to the specified PlannedMeal slot via the existing meal plan update logic
5. Return the updated PlannedMeal

---

### Account purge job (jobs/purgeAccounts.js)

A simple scheduled job that runs once per day at 2:00 AM server time.

Use `node-cron` npm package. Add it to `apps/api/package.json` dependencies.

The job:
1. Queries for all User rows where `isActive: false` AND `scheduledPurgeAt <= now`
2. For each such user, in a Prisma transaction, hard-deletes in this order (to respect foreign key constraints):
   - PasswordResetToken
   - PantryInventoryItem
   - PantryStaple
   - CustodyTemplate
   - EatingOutLog
   - GroceryItem (via GroceryList)
   - GroceryList (via MealPlan)
   - PlannedMeal (via MealPlan)
   - DayConfig (via MealPlan)
   - MealPlan
   - Profile
   - AppSettings
   - User
3. Logs the purged user's id and email (not password) to the server console

Register the job in `apps/api/src/index.js` so it starts with the server.

---

## Part 3: Frontend additions

### File structure additions

```
apps/web/src/
├── components/
│   ├── pantry/
│   │   ├── BarcodeScanner.jsx
│   │   ├── ProductPreviewCard.jsx
│   │   ├── InventoryItemRow.jsx
│   │   └── AddToPlanModal.jsx
│   └── auth/
│       ├── RegisterForm.jsx
│       ├── ForgotPasswordForm.jsx
│       └── ResetPasswordForm.jsx
└── pages/
    ├── Register.jsx
    ├── ForgotPassword.jsx
    ├── ResetPassword.jsx
    └── PantryInventory.jsx
```

Add the PantryInventory page to the app navigation (sidebar and bottom nav) as a 6th item with a barcode or package icon. Add routes for Register, ForgotPassword, and ResetPassword to the router.

---

### BarcodeScanner.jsx

A camera-based barcode scanner component for mobile use.

Uses the `@zxing/browser` npm package. Add it to `apps/web/package.json` dependencies.

Props: `onScan(barcode)` callback, `onClose()` callback, `isOpen` boolean.

Behavior:
- Renders inside a `BottomSheet`
- When open, requests camera access via `BrowserMultiFormatReader` from `@zxing/browser`
- Displays a live camera viewfinder in a square container with a centered targeting reticle (two corner brackets drawn in CSS)
- Continuously decodes frames -- on first successful decode, calls `onScan(barcode)` and stops the camera
- Shows a "Scanning..." status label below the viewfinder while active
- A "Cancel" button calls `onClose()` and releases the camera stream
- If camera permission is denied, shows an inline error message "Camera access denied -- please allow camera access in your browser settings" with a manual entry fallback: a text input where the user can type a barcode number manually and submit it
- On desktop (where camera scanning is less common), show the manual entry input as the primary UI with a small note that camera scanning works best on mobile
- Handles the case where `@zxing/browser` is not supported in the current browser gracefully -- fall back to manual entry

---

### ProductPreviewCard.jsx

Displays the product data returned from Open Food Facts before the user confirms adding it to inventory.

Shows: product image (if available, else a placeholder grocery bag icon), product name, brand, serving size, and a macro summary row (cal / P / C / F per serving). A quantity input (number, default 1) labeled "Units on hand." A "Add to pantry" confirm button and a "Not the right product" link that dismisses the preview and re-opens the scanner or search.

---

### InventoryItemRow.jsx

One row in the pantry inventory list. Shows: product name, brand in muted text, quantity with a +/- stepper to adjust (calls `PUT /api/pantry-inventory/:id` on change, debounced 400ms), macro summary pills, and an "Add to plan" button that opens `AddToPlanModal`. A delete button (with confirm) removes the item.

---

### AddToPlanModal.jsx

Opens in a `BottomSheet`. Lets the user assign a pantry inventory item to a meal plan slot as a snack.

Fields: week (defaults to current week), day of week (dropdown), meal type (defaults to SNACK but allows BREAKFAST, LUNCH, DINNER). A "Add to plan" button calls `POST /api/pantry-inventory/:id/add-to-plan`. On success: toast "Added to your plan", close modal, invalidate meal plan query.

---

### PantryInventory.jsx (pages/PantryInventory.jsx)

Full inventory management page.

Layout:
- Page header with title "Pantry" and two action buttons: "Scan item" (opens BarcodeScanner) and "Add manually" (opens a simplified form BottomSheet with name, brand, serving size, quantity, and macro fields)
- A search input to filter the inventory list
- The inventory list rendered as `InventoryItemRow` components
- `EmptyState` when no items: icon of a grocery bag, title "Your pantry is empty", message "Scan a barcode or add items manually to track what you have on hand"

Scan flow (wired end to end):
1. User taps "Scan item" -- `BarcodeScanner` opens
2. Camera scans barcode -- `onScan` callback fires with the barcode string
3. Scanner closes, a loading toast "Looking up product..." appears
4. `POST /api/pantry-inventory/scan` is called
5. If product found: `ProductPreviewCard` appears in a BottomSheet showing the product data and quantity input
6. User confirms -- item is saved, success toast, inventory list refreshes
7. If product not found (404): a search BottomSheet opens pre-filled with the barcode number, prompting "Product not found -- try searching by name." User can edit the query and search, then select from results in `ProductPreviewCard`

---

### Auth pages

#### Register.jsx
A multi-step registration page matching the visual style of the existing Setup page.

Step 1 -- Account details:
- Display name input (required, labeled "Your name")
- Email input (required)
- Password input (required, min 8 characters, show strength indicator)
- Confirm password input
- A "Create account" button calls `POST /api/account/register`
- A "Sign in instead" link to `/login`

Step 2 -- Your household (same as Phase 8 onboarding step 3):
- Shows the planner profile pre-created from the display name
- Prompt to add children: name and age fields, "Add another" button
- "Skip" and "Continue" options

Step 3 -- Connect Ollama (same as Phase 8 onboarding step 4):
- Pre-filled with default Ollama host
- Test connection button
- "Skip for now" and "Finish" options

On completing registration, navigate to `/`.

Update the Login page to add a "Create an account" link pointing to `/register`. Also add a "Forgot password?" link below the password input pointing to `/forgot-password`.

#### ForgotPassword.jsx
A simple centered card page.
- Email input with label "Enter your account email"
- A "Send reset link" button calls `POST /api/account/forgot-password`
- On success (regardless of whether email exists): show a confirmation message "If an account exists with that email, a reset link has been sent. Check your inbox." Replace the form with this message -- do not allow resubmission.
- A "Back to login" link

#### ResetPassword.jsx
Reads the `token` query parameter from the URL (`/reset-password?token=...`).

If no token in URL, redirect to `/forgot-password`.

Shows:
- New password input (min 8 characters, strength indicator)
- Confirm password input
- A "Set new password" button calls `POST /api/account/reset-password` with the token and passwords
- On success: show "Password updated. You can now sign in." with a link to `/login`
- On failure (token expired or invalid): show "This reset link is invalid or has expired." with a link back to `/forgot-password`

---

### Settings additions

In the existing `ConnectionsTab.jsx`, add a new **Email / SMTP** section:

Fields:
- SMTP host (text input, e.g. `smtp.resend.com`)
- SMTP port (number input, default 587)
- SMTP username
- SMTP password (masked input)
- From address (e.g. `nutrilabs@yourdomain.com`)
- From name (default "NutriLabs")
- App base URL (text input, labeled "Your app URL -- used in reset email links", e.g. `http://localhost:1042`)
- A "Test connection" button calls `POST /api/account/smtp-test` (add this backend route -- calls `mailer.testSmtpConnection` and returns result)

Add a helper note with two common SMTP options:
- Resend: host `smtp.resend.com`, port 587, username `resend`, password is your Resend API key. Free tier is 100 emails/day. Register at resend.com
- Gmail app password: host `smtp.gmail.com`, port 587, username is your Gmail address, password is a 16-character app password generated at myaccount.google.com/apppasswords

In the existing `ProfilesTab.jsx` within Settings, add a **Danger zone** section at the bottom:
- A "Deactivate account" button styled in red/danger
- Clicking opens a `BottomSheet` with a warning explaining the 30-day data retention policy, a password input, a text input labeled `Type "delete my account" to confirm`, and a red "Deactivate my account" button
- On success: show a toast "Account deactivated. You have 30 days to reactivate." then log out and redirect to `/login`

---

## Environment variable additions

Add the following to `.env.example` with descriptive comments:

```
# SMTP (required for password reset emails)
SMTP_HOST           # e.g. smtp.resend.com or smtp.gmail.com
SMTP_PORT           # 587 for TLS, 465 for SSL
SMTP_USER           # your SMTP username or email address
SMTP_PASSWORD       # your SMTP password or app password
SMTP_FROM_ADDRESS   # the address emails are sent from
SMTP_FROM_NAME      # display name in the From field, default: NutriLabs
APP_BASE_URL        # full URL of your app, used in email links e.g. https://nutrilabs.nexmolab.us
```

Note: SMTP settings can also be configured through the app UI in Settings > Connections > Email. Values set in the UI override environment variables. Document this in the README.

---

## README additions

Add a new section to the project README titled **Phase 9 features** covering:

1. Barcode scanning -- how to use it, note that it requires camera permission in the browser, works best on mobile
2. Multi-user support -- users can now register their own accounts; each account has its own meal plans, grocery lists, and settings
3. Password reset -- requires SMTP configuration; document both Resend and Gmail app password setup with exact field values
4. Account deletion -- explain the 30-day soft delete window and how to reactivate (direct users to contact the app admin or use the reactivation link sent by email -- note the reactivation email is a planned feature)

---

## Completion check

Phase 9 is complete when:

1. `POST /api/account/register` creates a user, auto-logs them in, and triggers the onboarding flow
2. A second user can register and their data is completely isolated from the first user's data
3. `POST /api/account/forgot-password` sends a reset email when SMTP is configured (test with a real SMTP provider)
4. `POST /api/account/reset-password` with a valid token updates the password and invalidates old sessions
5. `POST /api/account/deactivate` soft-deletes the account and the user cannot log back in
6. The purge job is registered and would correctly hard-delete a deactivated account after 30 days (verify the logic with a unit test or manual database check)
7. Scanning a common grocery product barcode (e.g. a box of cereal) returns correct product data from Open Food Facts
8. A scanned item can be added to the pantry inventory and then assigned to the meal plan as a snack
9. The PantryInventory page renders correctly on mobile with the scanner flow working end to end
10. Login page shows "Create an account" and "Forgot password?" links
11. SMTP test connection in Settings returns success when valid credentials are provided
12. Account deactivation flow works from Settings with the correct confirmation steps