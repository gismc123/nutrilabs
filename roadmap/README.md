# NutriLabs — Project Roadmap

## What this is

NutriLabs is a self-hosted, custody-aware meal planning and grocery budgeting web app built for a single parent managing meals for himself and his daughters on a rotating custody schedule. It is a responsive web app (mobile and desktop), runs in Docker Compose on port 1042, uses a local Ollama instance for AI features, and integrates with Spoonacular and USDA FoodData Central for recipe and nutrition data.

The intended deployment URL is `nutrilabs.nexmolab.us` routed via Cloudflare tunnel to port 1042, though the app is domain-agnostic and the domain may change in the future.

---

## How to use this roadmap

Each phase file in this folder is a standalone, self-contained instruction set. Execute them in order, one at a time. When you are ready to implement a phase, tell Claude Code:

> "Implement PHASE-X.md"

Claude Code will read the file and execute all instructions in it without needing additional context from you. Do not skip phases -- each one builds on the previous.

---

## Phase index

| File | Phase | What gets built |
|---|---|---|
| `PHASE-1.md` | Project scaffold & Docker | Monorepo structure, Docker Compose, environment config, Nginx |
| `PHASE-2.md` | Database schema & seed data | Prisma schema, all models, migrations, 15 starter recipes |
| `PHASE-3.md` | Core backend API | Auth, profiles, recipes, meal plans, settings, health check |
| `PHASE-4.md` | External service integrations | Ollama, Kroger, Spoonacular, USDA service modules and routes |
| `PHASE-5.md` | Grocery list & budget API | Grocery generation, deduplication, budget tracking, eating out log |
| `PHASE-6.md` | Frontend shell & shared components | Vite/React/Tailwind setup, layout, routing, shared UI components |
| `PHASE-7.md` | Frontend screens part 1 | Dashboard, Week Planner, Recipe Library |
| `PHASE-8.md` | Frontend screens part 2 | Grocery List, Budget Tracker, Settings, onboarding flow |

---

## Project stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Backend | Node.js + Express |
| Database | PostgreSQL 15 (Docker) |
| ORM | Prisma |
| AI | Ollama REST API at `http://192.168.1.190:11434` |
| Recipe data | Spoonacular API (free tier, 150 req/day) |
| Nutrition data | USDA FoodData Central API (free, DEMO_KEY fallback) |
| Grocery prices | Kroger Developer API (optional) + seeded Walmart/Aldi table |
| Auth | Single-user local auth (bcrypt + JWT, httpOnly cookie) |
| Charts | Chart.js via react-chartjs-2 |
| State | TanStack Query (server state) + Zustand (UI state) |
| Package manager | pnpm (monorepo) |
| Port | 1042 (external) |

---

## Global conventions (apply across all phases)

These rules apply to every file written in every phase. Claude Code must follow them without being reminded in each phase file.

- **Monorepo layout:** `apps/web` for frontend, `apps/api` for backend
- **API response shape:** always `{ data: ..., error: null }` on success and `{ data: null, error: { message: string, code: string } }` on failure
- **Request validation:** use `zod` on all API request bodies
- **Database access:** Prisma only, no raw SQL
- **Monetary values:** stored as integers (cents) in the database, converted to decimal for display
- **Dates:** stored as UTC, displayed in user local timezone
- **Frontend API URL:** never hardcoded -- always use `VITE_API_URL` env var (defaults to `/api`, proxied by Nginx)
- **Loading states:** skeleton screens for content areas, not spinners
- **Destructive actions:** always require a confirmation dialog before executing
- **Mobile breakpoint:** 768px -- below this, switch to mobile layouts
- **Notifications:** use `react-hot-toast` for non-blocking toasts
- **Error boundaries:** all major page components must have an error boundary
- **Graceful degradation:** Ollama, Spoonacular, Kroger, and USDA being unreachable must never crash the app -- each degrades silently with inline messaging only
