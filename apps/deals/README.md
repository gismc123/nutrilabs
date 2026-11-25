# KrogerDeals

A self-hosted, phone-first tool for planning a Kroger shopping trip around the best
deals: shelf prices, sale prices, and digital coupons at your store, plus budget
bundles and a shopping list. It plans only. It never clips coupons or changes your
Kroger account. When a deal needs a coupon, it tells you to clip it in the Kroger app.

It lives inside the NutriLabs repo but runs as its own product: its own compose
project, database, login, and port. NutriLabs code, its database, and `deploy.sh` are
not touched. The only link is optional: Deals can read NutriLabs' existing read-only
grocery feed to import this week's list.

```
 phone ──► Cloudflare tunnel ──► :1043  deals (Express API + React app)
                                          │   ▲ internal :3102 (never published)
                                          ▼   │
                                       deals-db (Postgres)
                                              ▲
 desktop display :0 ◄── deals-worker (headed Chromium, on demand) ──┘
 Kroger Products API ◄── deals (nightly price sync, official free API)
```

- **Prices** come from Kroger's official Products API (free developer account):
  regular price, sale price, and sale end date for your store. Synced nightly at
  4:30 for about 120 staple searches, your wanted items, and your NutriLabs list.
- **Coupons** come from Kroger's own coupon page, read by the worker in a real
  visible Chromium window (Kroger blocks headless browsers). The public coupon list
  loads without signing in, so the worker works with no Kroger login at all. Signing
  in is optional and only adds account-only offers and clip status.
- **Matching**: Kroger's coupon data has no product codes, so coupons are linked to
  products by brand and wording, with a confidence. Only high-confidence links
  change a price. Medium ones show as "might also apply" and are never counted.
  See `COUPON-SCHEMA.md` for the data and `AUDIT.md` for the reference tool audit.

## Setup

Requirements: Docker with Compose, the desktop session logged in on the screen (for
the coupon worker), and a free Kroger developer app (client credentials).

```sh
cd apps/deals
cp .env.example .env && chmod 600 .env   # fill in, see comments in the file
docker compose up -d --build             # web app on http://<server>:1043
```

Open the app, create the admin account on the first-run screen, then in Settings
enter your zip and pick your store. The first price sync starts right away (about
5 minutes). Add household members from Settings. There is no open sign-up.

Then read coupons once:

```sh
scripts/run-worker.sh sync
```

## The nightly sync

| Job | When | How |
|---|---|---|
| Coupons | 3:45 nightly (systemd user timer) | `scripts/run-worker.sh sync` opens Chromium on the desktop, reads every active coupon (about 17 paced requests), posts them to the server, which parses, upserts, expires missing ones, and relinks |
| Prices | 4:30 nightly (inside the server) | Official API searches, capped at `KROGER_DAILY_PRODUCT_BUDGET` calls a day |
| Backup | Sundays 5:30 (systemd user timer) | `scripts/backup.sh`, keeps 14 in `backups/` |

Install the timers (writes to `~/.config/systemd/user` and your crontab for log
rotation, so read the script first):

```sh
scripts/install-timer.sh          # remove with: scripts/install-timer.sh --remove
```

**MagicMirror.** The worker needs the screen. If the MagicMirror Firefox kiosk is
open, `run-worker.sh` closes it for the minute the sync takes, and a shell trap
reopens it on every exit path, including failures. If the kiosk was not open, it
is left alone. Runs are locked so two never overlap.

Check health any time: `scripts/healthcheck.sh`. Logs: `~/.local/state/krogerdeals/`.

## When the Kroger session expires

Only matters if you signed in. The nightly run keeps reading the public coupon list
(`DEALS_ALLOW_SIGNED_OUT=true`) and the app shows a banner. To sign in again, sit at
the server and run:

```sh
scripts/run-worker.sh login
```

A Chromium window opens on Kroger's sign-in page. Type your email and password into
that window yourself. The program never sees, logs, or stores them; only the browser
profile in `DEALS_STATE_DIR` (outside the repo) keeps the session cookies. Set
`DEALS_ALLOW_SIGNED_OUT=false` if you would rather the run fail loudly instead.

## When Kroger changes their site

The coupon API is unofficial, so expect this eventually. The app keeps working on the
last good data and shows a "last coupon sync failed" banner.

1. `scripts/run-worker.sh discover` writes the page's own coupon API calls and one
   response to `samples/` (gitignored).
2. Compare the URLs and fields with `COUPON-SCHEMA.md`.
3. Update `worker/src/atlas.js` (endpoint, filters, paging) or
   `server/src/services/couponParser.js` (field meanings).
4. Raw coupon JSON is stored, so after a parser fix you can re-parse without
   fetching: `docker compose exec deals sh -c 'wget -qO- --post-data= --header "x-worker-token: $DEALS_WORKER_TOKEN" http://127.0.0.1:3102/internal/reparse'`
   and then press "Sync prices now" in Settings to relink.

## Backups

```sh
scripts/backup.sh                                  # backups/deals-YYYYmmdd-HHMMSS.sql.gz
scripts/restore.sh backups/deals-20261125-120000.sql.gz   # asks before replacing
```

## Public access (Cloudflare tunnel)

The tunnel is managed in the Cloudflare Zero Trust dashboard. Add a public hostname
(for example `deals.nexmolab.us`) pointing to `http://localhost:1043`. Only port 1043
is published. The database and the worker port are not.

## Security

- Every `/api` route except sign-in and first-run setup needs a session cookie
  (httpOnly, SameSite=Lax, Secure over HTTPS, 30 days). Passwords are bcrypt hashed.
- Sign-in, setup, and password change are rate limited (10 tries per 15 minutes per
  visitor), with Cloudflare's visitor address as the key.
- The worker ingest endpoint listens on a separate port that is never published
  and also requires `DEALS_WORKER_TOKEN`.
- The browser profile, raw samples, backups, and `.env` are gitignored and never
  inside the served web root. The web app container does not mount them at all.

## Development

```sh
# server tests (no database needed)
docker run --rm -v "$PWD/server":/app -w /app node:20 npm test
# web build
docker run --rm -v "$PWD/web":/app -w /app node:20-alpine npm run build
```

Kroger API budget: the free tier allows 10,000 product calls a day. A nightly run
uses about 150 to 400. Searches are cached for 12 hours, aisle lookups for 1 hour.
