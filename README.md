# NutriLabs

> Self-hosted meal planning and grocery budgeting — built for the custody-schedule life.

[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Ollama](https://img.shields.io/badge/Ollama-Local%20AI-black?logo=ollama&logoColor=white)](https://ollama.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

NutriLabs is a **fully self-hosted** meal planning and grocery budgeting web app designed for a single parent managing meals across a rotating custody schedule. Run it privately on your home network, or publish it behind HTTPS for family and friends — either way there are no subscriptions and your data stays on your server.

Plan your week's meals, find free recipes, calculate accurate macros from USDA data, auto-generate a categorized grocery list priced at your own stores (Kroger, Meijer, ALDI, Sam's Club), and track exactly how much you save by cooking at home. AI-powered suggestions come from a local [Ollama](https://ollama.com) instance — no OpenAI or external AI API keys required.

---

## Features

### Meal Planning
- **Weekly drag-and-drop planner** across Breakfast, Lunch, Dinner, and Snack slots
- **Custody-aware day configs** — toggle between Solo and Dad Mode per day to match your custody schedule
- **AI Fill Week** — lets your local Ollama model suggest a full week of meals based on your household profiles, dietary notes, and pantry staples
- **Recipe library** — your own private recipes plus a shared starter library
- **Free recipe search** — browse and import ~800 recipes from [TheMealDB](https://www.themealdb.com) by dish, main ingredient, category or country (no key needed); Spoonacular is available too if you add a key
- **USDA macro calculator** — per-serving calories, protein, carbs and fat worked out from the ingredient list using USDA FoodData Central, with a per-ingredient breakdown you can correct (corrections are remembered)

### Grocery & Budget
- **Auto-generated grocery lists** aggregated from your weekly meal plan — unit conversion, plural merging, pantry-staple matching, and automatic regeneration when the plan changes
- **Real store prices** from the stores you pick: Kroger (official API) and Meijer daily, ALDI and Sam's Club weekly via a separate pricer service; seeded baseline prices fill any gaps
- **Weekly budget meter** with spend tracking and savings vs. eating out calculation
- **Eating-out log** to record what you spend when you skip cooking, with a full history and weekly trend chart

### Pantry
- **Barcode scanner** — use your phone's camera to scan any product; NutriLabs looks it up on Open Food Facts automatically
- **Manual entry fallback** for items not found by barcode
- **Pantry staples list** that gets factored into grocery list generation

### Multi-User & Household
- **Full multi-user support** — each account has isolated meal plans, grocery lists, pantry, recipes, and settings
- **Admin account** — the account created by the setup wizard manages server-wide settings (AI host, email) and the shared recipe library
- **Household profiles** with per-profile dietary notes, dislikes, calorie targets, and avatar colors
- **Custody template** — configure a repeating weekly custody schedule so Dad Mode auto-applies on the right days

### AI & Integrations
- **Local Ollama AI** for meal suggestions and budget insights — works with any model (llama3, mistral, phi3, etc.)
- **TheMealDB** free recipe search and import (no key)
- **Spoonacular** recipe search and import (150 req/day on the free tier)
- **USDA FoodData Central** powering the macro calculator (free API key recommended; works on DEMO_KEY to start)
- **Kroger Developer API** and **Meijer** for live grocery prices at your chosen store; **ALDI / Sam's Club** via [HeadlessX](https://github.com/saifyxpro/HeadlessX) (optional, self-hosted)

### Auth & Account Management
- **Email + password auth** with httpOnly cookie sessions, rate-limited login, and optional closed registration
- **Password reset via email** (SMTP — works with Resend, Gmail, or any provider)
- **Soft-delete account** with a 30-day grace window before permanent deletion
- **Setup wizard** for first-run onboarding (budget goals, profiles, Ollama connection)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      Docker Compose                          │
│                                                              │
│   ┌─────────────────┐        ┌──────────────────────────┐   │
│   │   web (Nginx)   │──────▶ │   api (Node / Express)   │   │
│   │  React + Vite   │  /api  │   Prisma + PostgreSQL     │   │
│   │   port 1042     │        │   port 3001 (internal)    │   │
│   └─────────────────┘        └───────┬──────────▲───────┘   │
│                                      │          │ feed       │
│                        ┌─────────────▼──────┐ ┌─┴──────────┐ │
│                        │ postgres:15-alpine │ │  pricer    │ │
│                        │ 127.0.0.1:5432 only│ │  port 4010 │ │
│                        │ volume: pg_data    │ │ volume:data│ │
│                        └────────────────────┘ └─────┬──────┘ │
└──────────────────────────────────────────────────────┼───────┘
                                                       │
External (optional, all on your LAN or with free API keys):
  Ollama  ──▶  http://192.168.1.x:11434   (local AI model server)
  TheMealDB ▶  www.themealdb.com          (recipe search, no key)
  Spoonacular ▶ api.spoonacular.com       (recipe search)
  USDA    ──▶  api.nal.usda.gov           (nutrition / macro calculator)
  Open Food Facts ▶ world.openfoodfacts.org (barcode lookup, no key)
  pricer  ──▶  Kroger API, Meijer search, HeadlessX (ALDI, Sam's Club)
```

Nginx inside the `web` container proxies `/api/*` requests to the `api` container, so the browser never needs to know the API hostname. The `pricer` is a separate service that reads grocery lists from the API's internal feed and caches store prices; it never shares code with the app, and its feed is not reachable through nginx.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 + Tailwind CSS 3 |
| UI components | Tabler Icons, react-hot-toast, Chart.js |
| Client state | TanStack Query v5 (server) + Zustand (UI) |
| Backend | Node.js + Express 4 |
| ORM | Prisma 5 |
| Database | PostgreSQL 15 (Alpine Docker image) |
| Auth | bcryptjs + JWT (httpOnly cookie) |
| Validation | Zod |
| AI | Ollama REST API (local, any model) |
| Barcode | @zxing/browser (camera-based, in-browser) |
| Email | Nodemailer (SMTP, any provider) |
| Tests | Node's built-in test runner (`node --test`) |
| Package manager | pnpm (monorepo workspace) |
| Container | Docker Compose |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine + Compose plugin
- A machine on your network running [Ollama](https://ollama.com) (e.g. `http://192.168.1.190:11434`) — optional, for AI features
- [HeadlessX](https://github.com/saifyxpro/HeadlessX) as its own Compose project — optional, only for ALDI and Sam's Club prices
- [pnpm](https://pnpm.io) — only needed for local development outside Docker

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/gismc123/nutrilabs.git
cd nutrilabs
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in the values marked **required**. The rest are optional and can be configured later through the Settings UI.

### 3. Start the stack

```bash
docker compose up --build -d
```

The first build takes a few minutes. Subsequent starts are fast.

### 4. Complete the setup wizard

Navigate to `http://localhost:1042` in your browser. The 4-step setup wizard will guide you through:

1. Creating your admin account (the first account administers the server)
2. Setting your weekly grocery budget
3. Adding household members (profiles)
4. Connecting your Ollama instance

That's it — you're running.

---

## Environment Variables

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string, e.g. `postgresql://nutrilabs:password@postgres:5432/nutrilabs` |
| `JWT_SECRET` | Random secret for signing auth tokens — minimum 32 characters |
| `POSTGRES_USER` | PostgreSQL username (must match `DATABASE_URL`) |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `POSTGRES_DB` | PostgreSQL database name |
| `OLLAMA_HOST` | URL of your Ollama instance, e.g. `http://192.168.1.190:11434` |

### Optional

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_MODEL` | `llama3` | Ollama model name to use for AI features |
| `KROGER_CLIENT_ID` | — | Kroger Developer API client ID |
| `KROGER_CLIENT_SECRET` | — | Kroger Developer API client secret |
| `SPOONACULAR_API_KEY` | — | Spoonacular recipe API key |
| `USDA_API_KEY` | `DEMO_KEY` | USDA FoodData Central API key |
| `SMTP_HOST` | — | SMTP server hostname for password reset emails |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_USER` | — | SMTP login username |
| `SMTP_PASSWORD` | — | SMTP login password |
| `SMTP_FROM_ADDRESS` | — | From address for outgoing email |
| `SMTP_FROM_NAME` | `NutriLabs` | Display name for outgoing email |
| `APP_BASE_URL` | — | Public URL of the app, used in password reset links |
| `BASE_URL` | `http://localhost:1042` | Public URL of the app (CORS origin; fallback for reset links) |
| `ALLOW_REGISTRATION` | `true` | Set to `false` to stop new sign-ups on a public instance |
| `THEMEALDB_API_KEY` | `1` (free key) | TheMealDB supporter key, if you have one |
| `PRICER_TOKEN` | — | Shared secret between the API and the pricer service (`openssl rand -hex 32`) |
| `HEADLESSX_API_KEY` | — | HeadlessX key, for ALDI / Sam's Club prices |
| `PRICER_TZ` | `America/Chicago` | Time zone for the pricer's early-morning schedule |

API keys (Spoonacular, USDA) can be set per user in **Settings → Connections**. Server-wide settings — the Ollama host/model, SMTP and the app base URL — can only be changed there by the **admin** (the account created by the setup wizard); the admin's values take precedence over these environment variables.

---

## Optional Integrations

| Integration | Free Tier | What it enables |
|---|---|---|
| [Ollama](https://ollama.com) | Self-hosted, free | AI meal suggestions, budget insights, and estimates for ingredients USDA can't match |
| [TheMealDB](https://www.themealdb.com) | Free, no key | Search ~800 recipes and import them into your library |
| [Spoonacular](https://spoonacular.com/food-api) | 150 requests/day | Search millions of recipes and import them into your library |
| [Kroger Developer API](https://developer.kroger.com) | Free | Real-time grocery prices from the Kroger-family store you choose |
| Meijer | Free, no key | Prices from the Meijer store you choose (via the pricer) |
| HeadlessX | Self-hosted, free | ALDI and Sam's Club prices (weekly, paced) |
| [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide.html) | Free key (1,000 req/hr); DEMO_KEY works to start | Macro calculator and ingredient nutrition lookup |
| [Open Food Facts](https://world.openfoodfacts.org) | Free, no key | Barcode product lookup for pantry scanning |

None of these are required to run the app — each feature degrades gracefully when its integration is unavailable.

---

## Email / Password Reset

Password reset requires SMTP configuration. Two easy options:

| Provider | Host | Port | Username | Password |
|---|---|---|---|---|
| [Resend](https://resend.com) *(recommended)* | `smtp.resend.com` | 587 | `resend` | Your Resend API key — free tier is 100 emails/day |
| Gmail app password | `smtp.gmail.com` | 587 | Your Gmail address | 16-character app password from [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) |

The admin configures this in **Settings → Connections → Email** (or via the `SMTP_*` variables). Set **App base URL** to your public URL (e.g. `http://localhost:1042`) so reset links are routable. Use the **Test connection** button to verify before relying on it.

---

## Custom Domain / HTTPS

Use a reverse proxy (nginx, Caddy, Traefik) or a Cloudflare tunnel to route your domain to `localhost:1042`. No configuration changes are needed inside the app — it is fully domain-agnostic.

Auth cookies are marked `Secure` automatically when the request arrived over HTTPS (nginx passes the tunnel's `X-Forwarded-Proto` through), so plain-http LAN access on `:1042` keeps working.

Example Cloudflare tunnel config:
```yaml
ingress:
  - hostname: nutrilabs.yourdomain.com
    service: http://localhost:1042
  - service: http_status:404
```

---

## Security

NutriLabs is built to be exposed publicly behind HTTPS:

- **Accounts:** bcrypt password hashing; HttpOnly, SameSite=Strict session cookies; sessions end on password change or reset; reset tokens are random, single-use, expire in 1 hour and are stored only as SHA-256 hashes; login timing doesn't reveal which emails are registered.
- **Rate limits:** login (per IP and per email), registration, password reset, AI and external-API calls, plus a global per-IP ceiling.
- **Data isolation:** every user's plans, lists, pantry, settings and macro corrections are scoped to them. Recipes are private to their owner; the starter library is shared read-only and only the admin can edit it.
- **Admin-only server settings:** the Ollama host and SMTP server can only be set by the admin, so other users can't point the server at internal addresses (SSRF) or intercept reset emails.
- **Headers:** CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a permissions policy are set by nginx; server versions are hidden.
- **Infrastructure:** PostgreSQL listens on `127.0.0.1` only; the API runs as an unprivileged user; the pricer feed isn't served publicly; internal error details never reach clients; the API won't start without a `JWT_SECRET` of at least 32 characters.

For a public deployment also consider Cloudflare's WAF / bot protection, and `ALLOW_REGISTRATION=false` once everyone you want has an account.

---

## Operations

### View logs

```bash
# All services
docker compose logs -f

# API only
docker compose logs -f api

# Web (Nginx) only
docker compose logs -f web
```

### Back up the database

```bash
docker exec nutrilabs-postgres-1 pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup_$(date +%Y%m%d).sql
```

### Restore the database

```bash
cat backup_20240101.sql | docker exec -i nutrilabs-postgres-1 psql -U $POSTGRES_USER $POSTGRES_DB
```

### Update to a new version

```bash
git pull
docker compose up --build -d
```

Prisma migrations run automatically on API startup.

### Change the Ollama model

As the admin, go to **Settings → Connections → Ollama**, change the model in the dropdown, and click away — it saves automatically. Any model available on your Ollama server works. Other users see the AI features but can't change the server.

### Calculate a recipe's macros

Open a recipe → **Edit** → **Calculate from ingredients (USDA)**. Each ingredient line shows the USDA food it matched, the grams it converted to and how. Tap **Change** to pick a different food or mark an ingredient as not counted; for counts USDA has no size for (e.g. "1 bunch"), enter the weight once and it's remembered. Ingredients that still can't be matched can be estimated with AI. Click **Use these macros**, then save.

### Pricer service

```bash
docker compose exec -w /data pricer node /app/src/cli.js status   # schedule, pauses, recent log
```

See [apps/pricer/README.md](apps/pricer/README.md) for the full command line and schedule.

### Reset the database (destructive — deletes all data)

```bash
docker compose down -v
docker compose up --build -d
```

This removes all Docker volumes including the PostgreSQL data. Only use this to start completely fresh.

---

## Local Development

```bash
# Install dependencies
pnpm install

# Start the API (requires a local or Docker Postgres)
cd apps/api
pnpm dev

# Start the frontend dev server (separate terminal)
cd apps/web
pnpm dev
```

The frontend dev server proxies `/api` to `http://localhost:3001` via Vite config. The full Docker stack is the recommended way to run the app; local dev is for iterating on individual services.

### Run the tests

```bash
cd apps/api && pnpm test        # grocery engine, TheMealDB parser, macro calculator, security helpers
cd apps/pricer && node --test test/
```

### Useful database commands

```bash
cd apps/api

# Open Prisma Studio (database GUI)
pnpm db:studio

# Run migrations manually
pnpm db:migrate

# Seed starter recipes
pnpm db:seed
```

---

## Project Structure

```
nutrilabs/
├── apps/
│   ├── api/                  # Node.js / Express backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma # Database schema
│   │   │   ├── migrations/   # Prisma migration history
│   │   │   └── seed.js       # Starter recipe seed data
│   │   ├── src/
│   │   │   ├── index.js      # Entry point, middleware setup
│   │   │   ├── middleware/   # Auth, error handling
│   │   │   ├── routes/       # Route handlers (one file per domain)
│   │   │   ├── services/     # External API clients (Ollama, USDA, TheMealDB, Kroger, etc.)
│   │   │   ├── lib/          # Grocery engine, macro matching, access control, rate limits
│   │   │   ├── jobs/         # Scheduled jobs (account purge)
│   │   │   └── scripts/      # One-off maintenance scripts
│   │   └── test/             # node --test suites
│   ├── pricer/               # Standalone grocery price service (Kroger, Meijer, ALDI, Sam's Club)
│   └── web/                  # React + Vite frontend
│       ├── src/
│       │   ├── api/          # Axios client
│       │   ├── components/   # Reusable UI components (by domain)
│       │   ├── hooks/        # Custom React hooks
│       │   ├── pages/        # Top-level page components
│       │   ├── store/        # Zustand UI state
│       │   └── utils/        # Date, currency, macro helpers
│       ├── public/           # Static assets, PWA manifest, icons
│       ├── nginx.conf        # Nginx config (API proxy, SPA fallback)
│       └── security-headers.conf  # CSP, HSTS and other headers for every response
├── roadmap/                  # Phase-by-phase build plan
├── docker-compose.yml
├── .env.example
└── deploy.sh                 # One-command deploy helper
```

---

## Data Model (abbreviated)

| Model | Purpose |
|---|---|
| `User` | Account with isolated data per user; the first account is the admin |
| `Profile` | Household member (adult or child) with dietary notes and calorie targets |
| `Recipe` | Meal with ingredients, nutrition, cost-per-serving, and source tag (user, AI, Spoonacular, TheMealDB); owned by a user, or shared when it has no owner |
| `FoodMatch` | USDA food chosen for an ingredient name — shared automatic matches plus each user's own corrections |
| `MealPlan` | One week of planned meals per user |
| `PlannedMeal` | A single day+slot assignment (day of week × meal type × recipe) |
| `DayConfig` | Household mode and active profiles per day within a meal plan |
| `GroceryList` | Aggregated list generated from a meal plan |
| `GroceryItem` | Individual item with per-store price estimates and checked state |
| `EatingOutLog` | Record of a meal purchased outside the home with spend amount |
| `PantryInventoryItem` | Scanned or manually added pantry item with full nutrition data |
| `CustodyTemplate` | Repeating weekly custody schedule (which days are Dad Mode) |
| `AppSettings` | Per-user settings (budget, stores, API keys); the admin's row also holds the server-wide Ollama and SMTP config |
| `PasswordResetToken` | Single-use reset token, stored as a SHA-256 hash |

All monetary values are stored as integers (cents) and converted to decimal for display. All dates are stored as UTC.

---

## Troubleshooting

**Ollama not connecting**

- Verify Ollama is reachable from the host: `curl http://192.168.1.190:11434`
- Check your LAN IP is correct in **Settings → Connections → Ollama** (admin account only)
- Ensure your firewall allows inbound connections to port 11434 from the Docker bridge network

**Spoonacular search not appearing**

- Confirm your API key is saved in **Settings → Connections → Spoonacular**
- Click **Test connection** to verify the key is valid
- Check your daily quota (150 searches/day on the free tier) — the current usage is shown in the Settings UI

**Macro calculator says "no confident USDA match"**

- Tap **Pick food** and search with more specific words (e.g. "blueberries frozen" for "mixed berries")
- Or let AI estimate just the unmatched lines, if Ollama is connected
- Add a free USDA key in **Settings → Connections** if lookups fail with a rate-limit message

**"Too many requests" on login**

- Login is limited to a few attempts per 15 minutes per email and per IP; wait and try again, or reset your password

**Barcode scanner not activating**

- Camera permission must be explicitly granted in your browser settings
- Works best on mobile — desktop cameras may have lower barcode resolution
- If the product is not on Open Food Facts, use the **Add manually** fallback

**Password reset emails not arriving**

- Check the SMTP settings in **Settings → Connections → Email** (admin account) or the `SMTP_*` variables
- Click **Test connection** first — it will surface auth or TLS errors immediately
- Verify `APP_BASE_URL` is set to the URL you actually visit in your browser (including port if not 80/443)
- Check your spam folder

**Port 1042 already in use**

Change the host port in `docker-compose.yml`:
```yaml
ports:
  - "8080:80"   # Use any available port on the left
```

---

## Roadmap

| Phase | Status | What was built |
|---|---|---|
| 1 — Scaffold & Docker | ✅ | Monorepo, Docker Compose, Nginx, env config |
| 2 — Database schema | ✅ | Prisma schema, all models, migrations, 15 seed recipes |
| 3 — Core backend API | ✅ | Auth, profiles, recipes, meal plans, settings, health check |
| 4 — External integrations | ✅ | Ollama, Kroger, Spoonacular, USDA service modules |
| 5 — Grocery & budget API | ✅ | Grocery generation, deduplication, budget tracking, eating-out log |
| 6 — Frontend shell | ✅ | Vite/React/Tailwind, layout, routing, shared UI components |
| 7 — Frontend screens pt. 1 | ✅ | Dashboard, Week Planner, Recipe Library |
| 8 — Frontend screens pt. 2 | ✅ | Grocery List, Budget Tracker, Settings, onboarding wizard |
| 9 — Multi-user & pantry | ✅ | Barcode scanning, multi-user accounts, password reset, account deletion |
| 10 — Grocery audit & store pricing | ✅ | Grocery engine v3, auto-regenerating lists, standalone pricer (Kroger, Meijer, ALDI, Sam's Club), store selection |
| 11 — Free recipe search | ✅ | TheMealDB search and import with a parser for its free-text measurements |
| 12 — Macro calculator | ✅ | USDA-based per-serving macros with editable ingredient matches and AI fallback |
| 13 — Security hardening | ✅ | Recipe ownership, admin role, rate limiting, hashed reset tokens, security headers, SSRF and account-takeover fixes |

---

## AI Contributions

NutriLabs was built with assistance from several AI models, each playing a different role throughout the project.

### Claude by Anthropic
**Best for:** Complex multi-file architecture, sustained reasoning across a large codebase, and instruction-following over many sequential steps.

Claude was the primary coding assistant for this project. It designed and implemented all nine original build phases end-to-end — from the Prisma schema and Express API through the full React frontend — and the later work: the grocery audit and pricer service, TheMealDB integration, the USDA macro calculator, and the security hardening for public deployment. Claude handled the hardest cross-cutting concerns: keeping the data model, API contracts, and UI in sync across 150+ files, writing Zod validation that matched the schema, wiring TanStack Query correctly throughout, and implementing nuanced features like the custody-aware day config system and the grocery deduplication engine.

### Google Gemini
**Best for:** Broad knowledge retrieval, explaining concepts, and researching integration options quickly.

Gemini was used during the planning and research phase to evaluate API options, compare grocery pricing data sources, and think through the custody scheduling data model before any code was written. It was also helpful for cross-checking behavior of third-party APIs (Spoonacular, Kroger, Open Food Facts) without having to dig through their docs manually.

### Ollama phi4:14b
**Best for:** Fast local inference for structured tasks with a small context window — good at following tight formatting instructions.

phi4:14b runs locally via Ollama and powers the in-app AI features at runtime. It handles the **AI Fill Week** feature — generating a full week of meal suggestions given the household profiles, dietary restrictions, and pantry staples. Its strength is producing consistently structured output (JSON meal slot assignments) quickly, without requiring any cloud API calls.

### Ollama qwen2.5-coder:7b
**Best for:** Code completion and boilerplate generation on lower-end hardware — efficient, code-focused, and fast.

qwen2.5-coder was used during development for quick local code completions and boilerplate — things like generating repetitive route handler stubs, filling out Prisma query patterns, and scaffolding React component shells. Running entirely on local hardware with no latency to an external API made it useful for the fast iteration loops that come with frontend development.

---

## License

MIT — do whatever you want with it.
