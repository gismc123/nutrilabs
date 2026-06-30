# NutriLabs

> Self-hosted meal planning and grocery budgeting — built for the custody-schedule life.

[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Ollama](https://img.shields.io/badge/Ollama-Local%20AI-black?logo=ollama&logoColor=white)](https://ollama.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

NutriLabs is a **fully self-hosted** meal planning and grocery budgeting web app designed for a single parent managing meals across a rotating custody schedule. It runs entirely on your home network — no subscriptions, no cloud accounts, no data leaving your house.

Plan your week's meals, auto-generate a categorized grocery list, compare prices across Walmart, Kroger, and Aldi, and track exactly how much you save by cooking at home. AI-powered suggestions come from a local [Ollama](https://ollama.com) instance — no OpenAI or external AI API keys required.

---

## Features

### Meal Planning
- **Weekly drag-and-drop planner** across Breakfast, Lunch, Dinner, and Snack slots
- **Custody-aware day configs** — toggle between Solo and Dad Mode per day to match your custody schedule
- **AI Fill Week** — lets your local Ollama model suggest a full week of meals based on your household profiles, dietary notes, and pantry staples
- **Recipe library** — manage your own recipes or import from Spoonacular's catalogue of millions

### Grocery & Budget
- **Auto-generated grocery lists** aggregated from your weekly meal plan with smart deduplication
- **3-store price comparison** (Walmart · Kroger · Aldi) — seeded baseline prices plus real-time Kroger API pricing
- **Weekly budget meter** with spend tracking and savings vs. eating out calculation
- **Eating-out log** to record what you spend when you skip cooking, with a full history and weekly trend chart

### Pantry
- **Barcode scanner** — use your phone's camera to scan any product; NutriLabs looks it up on Open Food Facts automatically
- **Manual entry fallback** for items not found by barcode
- **Pantry staples list** that gets factored into grocery list generation

### Multi-User & Household
- **Full multi-user support** — each account has isolated meal plans, grocery lists, pantry, and settings
- **Household profiles** with per-profile dietary notes, dislikes, calorie targets, and avatar colors
- **Custody template** — configure a repeating weekly custody schedule so Dad Mode auto-applies on the right days

### AI & Integrations
- **Local Ollama AI** for meal suggestions and budget insights — works with any model (llama3, mistral, phi3, etc.)
- **Spoonacular** recipe search and import (150 req/day on the free tier)
- **USDA FoodData Central** for accurate nutrition data (free API, no key required to start)
- **Kroger Developer API** for real-time grocery prices at your nearest store

### Auth & Account Management
- **Email + password auth** with httpOnly cookie sessions
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
│   └─────────────────┘        └──────────┬───────────────┘   │
│                                         │                    │
│                               ┌─────────▼──────────┐        │
│                               │  postgres:15-alpine │        │
│                               │  volume: pg_data    │        │
│                               └────────────────────┘        │
└──────────────────────────────────────────────────────────────┘

External (optional, all on your LAN or with free API keys):
  Ollama  ──▶  http://192.168.1.x:11434   (local AI model server)
  Kroger  ──▶  developer.kroger.com       (real-time pricing)
  Spoonacular ▶ api.spoonacular.com       (recipe search)
  USDA    ──▶  api.nal.usda.gov           (nutrition data)
  Open Food Facts ▶ world.openfoodfacts.org (barcode lookup, no key)
```

Nginx inside the `web` container proxies all `/api/*` requests to the `api` container, so the browser never needs to know the API hostname.

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
| Package manager | pnpm (monorepo workspace) |
| Container | Docker Compose |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine + Compose plugin
- A machine on your network running [Ollama](https://ollama.com) (e.g. `http://192.168.1.190:11434`)
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

1. Creating your admin account
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
| `NODE_ENV` | — | Set to `production` to enable `Secure` flag on auth cookies |

All optional integrations can also be configured (and overridden) through **Settings → Connections** in the UI. UI settings take precedence over environment variables when both are set.

---

## Optional Integrations

| Integration | Free Tier | What it enables |
|---|---|---|
| [Ollama](https://ollama.com) | Self-hosted, free | AI meal suggestions and budget insights |
| [Spoonacular](https://spoonacular.com/food-api) | 150 requests/day | Search millions of recipes and import them into your library |
| [Kroger Developer API](https://developer.kroger.com) | Free | Real-time grocery prices from your nearest Kroger store |
| [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide.html) | Free, no signup for DEMO_KEY | Accurate nutrition data for ingredients |
| [Open Food Facts](https://world.openfoodfacts.org) | Free, no key | Barcode product lookup for pantry scanning |

None of these are required to run the app — each feature degrades gracefully when its integration is unavailable.

---

## Email / Password Reset

Password reset requires SMTP configuration. Two easy options:

| Provider | Host | Port | Username | Password |
|---|---|---|---|---|
| [Resend](https://resend.com) *(recommended)* | `smtp.resend.com` | 587 | `resend` | Your Resend API key — free tier is 100 emails/day |
| Gmail app password | `smtp.gmail.com` | 587 | Your Gmail address | 16-character app password from [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) |

Configure in **Settings → Connections → Email**. Set **App base URL** to your public URL (e.g. `http://localhost:1042`) so reset links are routable. Use the **Test connection** button to verify before relying on it.

---

## Custom Domain / HTTPS

Use a reverse proxy (nginx, Caddy, Traefik) or a Cloudflare tunnel to route your domain to `localhost:1042`. No configuration changes are needed inside the app — it is fully domain-agnostic.

If you use HTTPS, set `NODE_ENV=production` in `.env` so auth cookies are marked `Secure`.

Example Cloudflare tunnel config:
```yaml
ingress:
  - hostname: nutrilabs.yourdomain.com
    service: http://localhost:1042
  - service: http_status:404
```

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

Go to **Settings → Connections → Ollama**, change the model in the dropdown, and click away — it saves automatically. Any model available on your Ollama server works.

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
│   │   └── src/
│   │       ├── index.js      # Entry point, middleware setup
│   │       ├── middleware/   # Auth, error handling
│   │       ├── routes/       # Route handlers (one file per domain)
│   │       ├── services/     # External API clients (Ollama, Kroger, etc.)
│   │       ├── lib/          # Grocery engine, Prisma client, utilities
│   │       └── jobs/         # Scheduled jobs (account purge)
│   └── web/                  # React + Vite frontend
│       ├── src/
│       │   ├── api/          # Axios client
│       │   ├── components/   # Reusable UI components (by domain)
│       │   ├── hooks/        # Custom React hooks
│       │   ├── pages/        # Top-level page components
│       │   ├── store/        # Zustand UI state
│       │   └── utils/        # Date, currency, macro helpers
│       ├── public/           # Static assets, PWA manifest, icons
│       └── nginx.conf        # Nginx config (API proxy, SPA fallback)
├── roadmap/                  # Phase-by-phase build plan
├── docker-compose.yml
├── .env.example
└── deploy.sh                 # One-command deploy helper
```

---

## Data Model (abbreviated)

| Model | Purpose |
|---|---|
| `User` | Account with isolated data per user |
| `Profile` | Household member (adult or child) with dietary notes and calorie targets |
| `Recipe` | Meal with ingredients, nutrition, cost-per-serving, and source tag |
| `MealPlan` | One week of planned meals per user |
| `PlannedMeal` | A single day+slot assignment (day of week × meal type × recipe) |
| `DayConfig` | Household mode and active profiles per day within a meal plan |
| `GroceryList` | Aggregated list generated from a meal plan |
| `GroceryItem` | Individual item with per-store price estimates and checked state |
| `EatingOutLog` | Record of a meal purchased outside the home with spend amount |
| `PantryInventoryItem` | Scanned or manually added pantry item with full nutrition data |
| `CustodyTemplate` | Repeating weekly custody schedule (which days are Dad Mode) |
| `AppSettings` | Per-user settings including budget, Ollama config, SMTP, and API keys |

All monetary values are stored as integers (cents) and converted to decimal for display. All dates are stored as UTC.

---

## Troubleshooting

**Ollama not connecting**

- Verify Ollama is reachable from the host: `curl http://192.168.1.190:11434`
- Check your LAN IP is correct in **Settings → Connections → Ollama**
- Ensure your firewall allows inbound connections to port 11434 from the Docker bridge network

**Spoonacular search not appearing**

- Confirm your API key is saved in **Settings → Connections → Spoonacular**
- Click **Test connection** to verify the key is valid
- Check your daily quota (150 searches/day on the free tier) — the current usage is shown in the Settings UI

**Barcode scanner not activating**

- Camera permission must be explicitly granted in your browser settings
- Works best on mobile — desktop cameras may have lower barcode resolution
- If the product is not on Open Food Facts, use the **Add manually** fallback

**Password reset emails not arriving**

- Check your SMTP settings in **Settings → Connections → Email**
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

---

## AI Contributions

NutriLabs was built with assistance from several AI models, each playing a different role throughout the project.

### Claude by Anthropic
**Best for:** Complex multi-file architecture, sustained reasoning across a large codebase, and instruction-following over many sequential steps.

Claude was the primary coding assistant for this project. It designed and implemented all nine build phases end-to-end — from the Prisma schema and Express API through the full React frontend. Claude handled the hardest cross-cutting concerns: keeping the data model, API contracts, and UI in sync across 150+ files, writing Zod validation that matched the schema, wiring TanStack Query correctly throughout, and implementing nuanced features like the custody-aware day config system and the grocery deduplication engine.

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
