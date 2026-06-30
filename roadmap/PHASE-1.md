# PHASE-1 — Project Scaffold & Docker

## Context

You are building NutriLabs, a self-hosted meal planning and grocery budgeting web app. This is Phase 1 of 8. Your job in this phase is to create the complete project skeleton -- folder structure, package configuration, Docker Compose setup, Nginx config, and environment variable templates. No application logic is written in this phase. The goal is a running stack where all three containers start successfully and the web container serves a placeholder page on port 1042.

Read `README.md` in this roadmap folder before starting for global conventions that apply to all phases.

---

## Monorepo structure

Scaffold the following directory and file structure. Create all files listed even if they are initially empty or contain only placeholder content.

```
nutrilabs/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.js
│   │   ├── tailwind.config.js
│   │   ├── postcss.config.js
│   │   ├── package.json
│   │   └── Dockerfile
│   └── api/
│       ├── src/
│       │   └── index.js
│       ├── prisma/
│       ├── package.json
│       └── Dockerfile
├── roadmap/                     ← copy all phase files here after scaffold
├── docker-compose.yml
├── .env.example
├── .env                         ← gitignored, created from .env.example
├── .gitignore
├── pnpm-workspace.yaml
└── README.md
```

---

## pnpm workspace

`pnpm-workspace.yaml` must declare both apps as workspace packages.

---

## Package configuration

### apps/api/package.json

Include the following dependencies:
- express
- @prisma/client
- prisma (dev)
- bcryptjs
- jsonwebtoken
- cookie-parser
- cors
- dotenv
- zod
- node-fetch (for Ollama, Spoonacular, USDA, Kroger HTTP calls)

Include scripts: `dev` (nodemon), `start`, `build`, `db:migrate`, `db:seed`, `db:studio`

### apps/web/package.json

Include the following dependencies:
- react, react-dom
- react-router-dom v6
- @tanstack/react-query
- zustand
- react-hot-toast
- react-chartjs-2, chart.js
- axios

Include scripts: `dev`, `build`, `preview`

---

## Docker Compose

Create `docker-compose.yml` with exactly three services.

### Service: postgres
- Image: `postgres:15-alpine`
- Named volume for data persistence at `/var/lib/postgresql/data`
- Environment variables sourced from `.env`: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- Health check using `pg_isready`
- Restart policy: `unless-stopped`

### Service: api
- Build context: `./apps/api`
- Depends on postgres being healthy before starting
- Exposes port 3001 internally only (not mapped to host)
- Environment variables sourced from `.env`: `DATABASE_URL`, `JWT_SECRET`, `OLLAMA_HOST`, `OLLAMA_MODEL`, `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`, `SPOONACULAR_API_KEY`, `USDA_API_KEY`, `NODE_ENV`
- Restart policy: `unless-stopped`

### Service: web
- Build context: `./apps/web`
- Maps host port 1042 to container port 80
- Depends on api service
- Restart policy: `unless-stopped`

---

## Dockerfiles

### apps/api/Dockerfile
- Base image: `node:20-alpine`
- Install pnpm globally
- Copy package files, install dependencies
- Generate Prisma client
- Copy source
- Expose port 3001
- Start command runs database migration then starts the server

### apps/web/Dockerfile
- Multi-stage build
- Stage 1 (builder): `node:20-alpine`, install pnpm, install dependencies, run `pnpm build`
- Stage 2 (serve): `nginx:alpine`, copy built files from stage 1 into `/usr/share/nginx/html`, copy Nginx config

---

## Nginx configuration

Create `apps/web/nginx.conf`. Requirements:
- Listen on port 80
- Serve static files from `/usr/share/nginx/html`
- All routes not matching a static file fall back to `index.html` (required for React Router client-side routing)
- Proxy all requests to `/api/*` upstream to `http://api:3001`
- Proxy websocket upgrade headers
- Gzip compression enabled for text, css, javascript, json, svg
- Cache static assets (js, css, images) with a 1-year max-age header
- Do not cache `index.html`

---

## Environment variables

Create `.env.example` with every variable the project needs. Include a descriptive comment above each variable explaining what it is, whether it is required or optional, and where to obtain it if applicable.

Variables required:

```
# Database
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
DATABASE_URL          # postgresql://user:password@postgres:5432/dbname

# Auth
JWT_SECRET            # any long random string, used to sign JWT tokens

# Ollama (AI features)
OLLAMA_HOST           # LAN IP of the machine running Ollama, e.g. http://192.168.1.190:11434
OLLAMA_MODEL          # model name to use, e.g. llama3

# Kroger API (optional - grocery pricing)
KROGER_CLIENT_ID      # from developer.kroger.com -- leave blank to disable
KROGER_CLIENT_SECRET  # from developer.kroger.com -- leave blank to disable

# Spoonacular (optional - external recipe search)
SPOONACULAR_API_KEY   # from spoonacular.com/food-api/console -- leave blank to disable

# USDA FoodData Central (optional - ingredient nutrition lookup)
USDA_API_KEY          # from fdc.nal.usda.gov/api-key-signup.html -- leave blank to use DEMO_KEY (30 req/hr)

# App
NODE_ENV              # development or production
BASE_URL              # e.g. http://localhost:1042 or https://nutrilabs.nexmolab.us
```

Also create `.env` as a copy of `.env.example` with safe placeholder values filled in for local development.

---

## .gitignore

Include at minimum: `node_modules`, `.env`, `dist`, `.DS_Store`, `*.log`, `prisma/migrations` generated files

---

## Placeholder API entry point

Create `apps/api/src/index.js` as a minimal Express server that:
- Loads dotenv
- Mounts a `GET /api/health` route returning `{ status: "ok" }`
- Listens on port 3001
- Logs "NutriLabs API running on port 3001" on start

This will be replaced in Phase 3 but must exist so the Docker build succeeds.

---

## Placeholder web entry point

Create a minimal React app entry point in `apps/web/src/` that renders a single div with the text "NutriLabs -- coming soon" so the Vite build succeeds. This will be fully replaced in Phase 6.

---

## Vite configuration

`apps/web/vite.config.js` must:
- Use the React plugin
- Set `server.proxy` so `/api` proxies to `http://localhost:3001` during local development (dev server only -- Nginx handles this in production)
- Read `VITE_API_URL` from env

---

## Tailwind configuration

`apps/web/tailwind.config.js` must:
- Scan `./src/**/*.{js,jsx}` for class names
- Define a custom color palette extending Tailwind defaults:
  - `primary`: a warm green family (5 shades: 50, 100, 300, 600, 900) -- health/meal positive
  - `accent`: a soft amber family (5 shades) -- budget/money
  - `danger`: map to Tailwind red
  - `neutral`: map to Tailwind slate
- Enable dark mode via the `class` strategy

---

## Completion check

Phase 1 is complete when:
1. `docker compose up --build` runs without errors
2. All three containers reach a running/healthy state
3. `http://localhost:1042` returns the placeholder web page
4. `http://localhost:1042/api/health` returns `{ "status": "ok" }`
5. No TypeScript or lint errors on either app

After confirming, proceed to PHASE-2.md.
