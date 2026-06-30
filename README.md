# NutriLabs

NutriLabs is a self-hosted meal planning and grocery budgeting web app built for a single parent managing meals for himself and his daughters on a rotating custody schedule. It runs entirely on your home network — no subscriptions, no cloud accounts, no data leaving your house. Plan your week's meals, generate a categorized grocery list, compare prices across Walmart, Kroger, and Aldi, and track how much you're saving by cooking at home instead of eating out.

The app connects to a local [Ollama](https://ollama.com) instance for AI-powered meal suggestions and budget insights. Optional integrations with Spoonacular (recipe search) and the USDA FoodData Central API (nutrition data) expand the recipe library and nutritional accuracy. A Kroger Developer API integration enables real-time grocery pricing. All of these are optional — the app is fully functional without them.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine + Compose plugin
- [pnpm](https://pnpm.io) (only needed for local development outside Docker)
- A machine running [Ollama](https://ollama.com) on your local network (e.g. `http://192.168.1.190:11434`)

---

## Quick start

1. **Clone the repository**

   ```bash
   git clone https://github.com/youruser/nutrilabs.git
   cd nutrilabs
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Open `.env` and fill in the required values (see [Environment variables](#environment-variables) below).

3. **Start the stack**

   ```bash
   docker compose up --build -d
   ```

4. **Open the app and complete setup**

   Navigate to `http://localhost:1042` in your browser. You'll be guided through a 4-step setup wizard to create your account, set your budget goals, add household members, and connect Ollama.

---

## Optional integrations

| Integration | What it enables |
|---|---|
| [Spoonacular](https://spoonacular.com/food-api) | Search millions of recipes and import them directly into your library |
| [Kroger Developer API](https://developer.kroger.com) | Real-time grocery prices from your local Kroger store |
| [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide.html) | Accurate nutrition data for ingredients |

All three are optional and free to register. Configure them in **Settings → Connections** after setup.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string, e.g. `postgresql://nutrilabs:password@postgres:5432/nutrilabs` |
| `JWT_SECRET` | ✅ | Random secret used to sign auth tokens — use at least 32 random characters |
| `POSTGRES_USER` | ✅ | PostgreSQL username (must match `DATABASE_URL`) |
| `POSTGRES_PASSWORD` | ✅ | PostgreSQL password |
| `POSTGRES_DB` | ✅ | PostgreSQL database name |
| `OLLAMA_HOST` | ✅ | URL of your Ollama instance, e.g. `http://192.168.1.190:11434` |
| `OLLAMA_MODEL` | Optional | Ollama model to use (default: `llama3`) |
| `KROGER_CLIENT_ID` | Optional | Kroger Developer API client ID |
| `KROGER_CLIENT_SECRET` | Optional | Kroger Developer API client secret |
| `SPOONACULAR_API_KEY` | Optional | Spoonacular API key (can also be set in Settings UI) |
| `USDA_API_KEY` | Optional | USDA FoodData Central API key (falls back to `DEMO_KEY` if not set) |
| `NODE_ENV` | Optional | Set to `production` to enable secure cookies |

---

## Operations

### Back up the database

```bash
docker exec nutrilabs-postgres-1 pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup.sql
```

### Restore the database

```bash
cat backup.sql | docker exec -i nutrilabs-postgres-1 psql -U $POSTGRES_USER $POSTGRES_DB
```

### Update the Ollama model

Go to **Settings → Connections → Ollama**, change the model in the dropdown, and click away — it saves automatically.

### Point a custom domain

Use a reverse proxy (nginx, Caddy, Traefik) or a Cloudflare tunnel to route your domain to `localhost:1042`. No configuration changes are needed inside the app — it is domain-agnostic. If you use HTTPS, set `NODE_ENV=production` in your `.env` so auth cookies are marked `Secure`.

---

## Phase 9 features

### Barcode scanning
Open the **Pantry** section from the sidebar or bottom nav. Tap **Scan item** to activate the camera scanner — it works best on mobile. Hold the product barcode inside the viewfinder; the app looks it up on Open Food Facts automatically. If the camera is unavailable or the product isn't found by barcode, use the manual entry fallback or the **Add manually** button. Camera permission must be granted in your browser settings.

### Multi-user support
Users can now register their own accounts at `/register`. Each account has completely isolated meal plans, grocery lists, pantry inventory, and settings. Existing single-user installs continue to work — the original `/setup` flow creates the first account as before.

### Password reset
Requires SMTP configuration in **Settings → Connections → Email**. Two easy options:

| Provider | Host | Port | Username | Password |
|---|---|---|---|---|
| [Resend](https://resend.com) (recommended) | `smtp.resend.com` | 587 | `resend` | Your Resend API key. Free tier: 100 emails/day |
| Gmail app password | `smtp.gmail.com` | 587 | Your Gmail address | 16-char app password from [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) |

Also set the **App base URL** field to your public URL (e.g. `http://localhost:1042` or `https://nutrilabs.nexmolab.us`) so reset links point to the right place. Use **Test connection** to verify your SMTP settings before relying on them.

SMTP settings can also be provided as environment variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_ADDRESS`, `SMTP_FROM_NAME`, `APP_BASE_URL`) — UI settings take precedence when both are set.

### Account deletion (soft delete)
Users can deactivate their account from **Settings → Profiles → Danger zone**. Deactivation hides the account for 30 days, then permanently deletes all data. To cancel the deletion within the 30-day window, contact your app admin or use the reactivation link (sent by email — requires SMTP to be configured).

---

## Troubleshooting

**Ollama not connecting**
- Verify Ollama is running on the host machine: `curl http://192.168.1.190:11434`
- Check your LAN IP is correct in **Settings → Connections → Ollama**
- Ensure your firewall allows inbound connections to port 11434 from the Docker network

**Spoonacular search not appearing**
- Confirm your API key is saved in **Settings → Connections → Spoonacular**
- Use the "Test connection" button to verify the key is valid
- Check your daily quota (150 searches/day on the free tier) — shown in the Settings UI

**Database reset (⚠️ destructive — deletes all data)**

```bash
docker compose down -v
docker compose up --build -d
```

This removes all Docker volumes including the PostgreSQL data. Use only if you want to start completely fresh.
