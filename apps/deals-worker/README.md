# NutriLabs Deals

The **Deals** section of NutriLabs plans a Kroger trip around the best deals: shelf
prices, sale prices, and digital coupons at your Kroger store, budget bundles, and a
deal list. It plans only. It never clips coupons or changes your Kroger account. When
a deal needs a coupon, it tells you to clip it in the Kroger app.

It is part of NutriLabs: same login, same database, same Kroger store setting, and it
reads your meal plan's grocery list directly. The pieces:

| Piece | Where | Runs |
|---|---|---|
| Deals API | `apps/api/src/deals/`, mounted at `/api/deals` | inside the NutriLabs `api` container |
| Deals screens | `apps/web/src/pages/deals/` (Find deals, Aisle check, Coupons, Deal list, Store) | NutriLabs web app, **Deals** in the menu |
| Tables | `deal_*` in the NutriLabs database (migration `20261125230000_kroger_deals`) | NutriLabs Postgres |
| Coupon worker | this folder | on demand, compose service `deals-worker` (profile `deals-worker`) |

```
 phone ──► Cloudflare tunnel ──► :1042 web (nginx) ──► api :3001 ─► /api/deals
                                   (404 for /api/deals/internal)      ▲
 desktop display :0 ◄── deals-worker (headed Chromium, on demand) ────┘ internal, token
 Kroger Products API ◄── api (nightly price sync, official free API)
```

- **Prices** come from Kroger's official Products API (the same free developer app
  NutriLabs uses): regular price, sale price, and sale end date. Synced nightly at
  4:30 for about 120 staple searches, items people searched for, and every user's
  meal plan grocery items, at each store users picked (up to `DEALS_MAX_SYNC_STORES`).
- **Coupons** come from Kroger's own coupon page, read by the worker in a real visible
  Chromium window (Kroger blocks headless browsers). The public coupon list loads
  without signing in, so no Kroger login is needed. Signing in is optional and only
  adds account-only offers and clip status.
- **Matching**: Kroger's coupon data has no product codes, so coupons are linked to
  products by brand and wording, with a confidence. Only high-confidence links change
  a price. Medium ones show as "might also apply" and are never counted. See
  `COUPON-SCHEMA.md` for the data and `AUDIT.md` for the reference tool audit.

## How it ties into NutriLabs

- **Store**: Deals uses the Kroger store in your NutriLabs settings. Picking a store
  on the Deals Store tab saves it there too, so grocery pricing and deals agree.
- **Grocery list**: "Add my meal plan grocery list" on Find deals (and the "Find
  Kroger deals" link on the Shop page) pulls this and next week's items from your
  meal plans, minus pantry staples, the same list the Shop page builds.
- **Accounts**: NutriLabs accounts. Each user has their own deal list and store. The
  NutriLabs admin can start a price sync from the Store tab.

## Setup

Already part of `docker compose up` / `./deploy.sh`. Add to the root `.env`:

```sh
DEALS_WORKER_TOKEN=          # openssl rand -hex 32 (shared by api and worker)
DEALS_STATE_DIR=/home/YOU/.local/share/nutrilabs-deals   # browser profile, outside the repo
DEALS_ALLOW_SIGNED_OUT=true  # read the public coupon list when not signed in
```

Then pick your store in **Deals > Store** and read coupons once:

```sh
apps/deals-worker/scripts/run-worker.sh sync
```

## The nightly sync

| Job | When | How |
|---|---|---|
| Coupons | 3:45 nightly (systemd user timer) | `run-worker.sh sync` opens Chromium on the desktop, reads every active coupon (about 17 paced requests), posts them to the API, which parses, upserts, expires missing ones, and relinks |
| Prices | 4:30 nightly (inside the API) | Official API searches, capped at `KROGER_DAILY_PRODUCT_BUDGET` calls a day |

Install the coupon timer (writes to `~/.config/systemd/user` and your crontab for log
rotation, so read the script first):

```sh
apps/deals-worker/scripts/install-timer.sh     # remove with: install-timer.sh --remove
```

**MagicMirror.** The worker needs the screen. If the MagicMirror Firefox kiosk is open,
`run-worker.sh` closes it for the minute the sync takes, and a shell trap reopens it on
every exit path, including failures. If the kiosk was not open, it is left alone. Runs
are locked so two never overlap.

Check health any time: `apps/deals-worker/scripts/healthcheck.sh`. Logs:
`~/.local/state/nutrilabs-deals/`.

## When the Kroger session expires

Only matters if you signed in. The nightly run keeps reading the public coupon list
and the Deals screens show a banner. To sign in again, sit at the server and run:

```sh
apps/deals-worker/scripts/run-worker.sh login
```

A Chromium window opens on Kroger's sign-in page. Type your email and password into
that window yourself. The program never sees, logs, or stores them; only the browser
profile in `DEALS_STATE_DIR` (outside the repo) keeps the session cookies. Set
`DEALS_ALLOW_SIGNED_OUT=false` if you would rather the run fail loudly instead.

## When Kroger changes their site

The coupon API is unofficial, so expect this eventually. Deals keeps working on the
last good data and shows a "last coupon sync failed" banner.

1. `run-worker.sh discover` writes the page's own coupon API calls and one response to
   `apps/deals-worker/samples/` (gitignored).
2. Compare the URLs and fields with `COUPON-SCHEMA.md`.
3. Update `src/atlas.js` here (endpoint, filters, paging) or
   `apps/api/src/deals/services/couponParser.js` (field meanings).
4. Raw coupon JSON is stored, so after a parser fix you can re-parse without fetching:
   `docker compose exec api sh -c 'wget -qO- --post-data= --header "x-worker-token: $DEALS_WORKER_TOKEN" http://127.0.0.1:3001/api/deals/internal/reparse'`
   and then press "Sync prices now" on the Store tab to relink.

## Security

- Every `/api/deals` route needs a NutriLabs session (`requireAuth`).
- The worker ingest path `/api/deals/internal` returns 404 from nginx, so only
  containers on the Docker network reach it, and it also requires
  `DEALS_WORKER_TOKEN`.
- The browser profile, raw samples, and `.env` are gitignored and outside the served
  web root. The api and web containers do not mount them.

## Development

```sh
# deals logic tests (no database needed), with the rest of the API suite
docker run --rm -v "$PWD/apps/api":/app -w /app node:20 node --test test/
```

Kroger API budget: the free tier allows 10,000 product calls a day, shared with
NutriLabs grocery pricing. A nightly run uses about 150 to 400 per store. Searches are
cached for 12 hours, aisle lookups for 1 hour.
