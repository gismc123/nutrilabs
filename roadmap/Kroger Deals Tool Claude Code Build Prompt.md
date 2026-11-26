# Kroger Deals Tool: Claude Code Build Prompt

Paste everything below the line into Claude Code in VS Code, in an empty project folder on the home server. Work one phase at a time. Do not start the next phase until the current one is verified in writing.

---

## Role and goal

You are building a self-hosted web app called KrogerDeals on an Ubuntu desktop home server. Its purpose is to give an accurate estimate of Kroger prices, sale prices, and digital coupons, so the owner can build a grocery shopping list around the best deals. Comparison with other stores is only a side use case and is out of scope. The app must be usable from a phone anywhere through a Cloudflare tunnel.

## Hard constraints

1. Free and self-hosted tools only. No paid scraping APIs or paid services.
2. No em-dashes in any text, comments, docs, or UI copy.
3. Never put any Co-Authored-By line or any mention of Claude or Anthropic in git commits or pull requests. Commits are plain, as the repo owner.
4. Never write the Kroger password to disk, to env files, or to logs. Login happens only by typing into the browser window.
5. Never commit secrets, the browser profile folder, or any data dump. Add them to .gitignore before the first commit.
6. Stop and ask before any step that is destructive or that changes the system outside the project folder.

## Architecture decision

Split the system into two parts so the phone never needs a browser on the server.

1. Sync worker: runs on the Ubuntu desktop, which has a real display. It drives a visible Chromium window with a saved login session, reads Kroger's internal coupon API from inside the page, and also pulls prices and promo prices from the official Kroger Products API. It writes everything into PostgreSQL on a schedule.
2. Web app: React with Vite and Tailwind on the front, Node with Express on the back, Prisma over PostgreSQL. It only reads from the database, so searches are instant from any device. Add a login to the web app, since it will be exposed externally.

Why this split: Kroger's firewall resets plain HTTP requests and headless browsers, but requests made from inside a real visible browser page succeed. So the browser work is isolated in the worker.

## Reference tool

Study the open source project at github.com/rkoh46/kroger-cli-aio, which is a modern fork of github.com/Shmakov/kroger-cli. It uses Playwright with a visible Chromium window and a persistent profile, replays the page's own request headers, and calls an internal path under atlas, savings-coupons, with pagination and category filters. It has a discover command that dumps one live response for tuning. It is a new project with one author and no stars, so read its code fully before running it, and do not run anything that handles the password until the audit is written up.

## Environment facts

1. Host: Ubuntu desktop, connected by HDMI to a display that normally shows the MagicMirror dashboard. MagicMirror can be stopped when the browser is needed.
2. Existing stack: Docker Compose, Cloudflare tunnel, and the domain nexmolab.us. Pick a free port and a subdomain such as deals.nexmolab.us, and confirm both with the owner before using them.
3. Free Kroger developer API credentials (client id and secret) go in a .env file that is gitignored. The owner already has a Kroger developer account from another project.

## Phase 1: Audit and discovery (no code changes, no password)

Goal: understand exactly what the reference tool does before trusting it, and capture one real sample of Kroger's coupon data.

1. Clone github.com/rkoh46/kroger-cli-aio into a scratch folder outside the new project. Read install.sh and every file under src/kroger\_aio. Write a plain-language audit to AUDIT.md covering what network calls it makes, where it stores session data, whether anything is sent to a third party, and anything suspicious. Stop and report if anything looks unsafe.
2. Confirm the host can run it: Ubuntu desktop session active, a display attached, uv installable, Playwright Chromium installable. Report any gap.
3. With the owner present at the machine, stop MagicMirror, run the tool's login command so the owner types the Kroger password into the browser window, then run the discover command. Never read, log, or store the password.
4. Save the discover output to a gitignored samples folder. Write COUPON-SCHEMA.md listing every field in the response with an example value and type, and mark which fields identify the product, the discount amount, the discount type, the brand, the category, the expiry date, the clip status, and any usage limit.
5. Also call the official Kroger Products API for three sample items with a location id, and document which price fields come back, including any promo or sale price.

Gate: do not continue until the owner confirms AUDIT.md and COUPON-SCHEMA.md in writing.

## Phase 2: Database and project skeleton

Goal: a running empty app with the right data model.

1. Create the project with Docker Compose: PostgreSQL, the Express API, and the Vite React frontend. Use the free port and subdomain the owner confirms.
2. Design the Prisma schema from COUPON-SCHEMA.md. At minimum: stores (location id, name, zip), products (upc, name, brand, size, category), prices (product, store, regular price, promo price, captured at), coupons (external id, description, brand, category, discount amount, discount type, requirements, start date, expiry date, source, captured at), coupon to product links where the data allows it, and a sync\_runs table recording start, end, status, counts, and errors.
3. Keep raw API responses in a JSON column on coupons and prices so the parser can be corrected later without re-fetching.
4. Add user accounts with hashed passwords and session or JWT login. Every API route except login requires auth.
5. Write a README with setup steps and an .env.example. Secrets stay out of git.

Gate: owner confirms docker compose up works and the empty app loads behind login.

## Phase 3: Price sync from the official Kroger API

Goal: accurate current prices and sale prices stored in the database, using only the official free API.

1. Build a Kroger service using the client credentials flow with the Products and Locations APIs. Look up the owner's nearest store by zip code and cache the location id, because prices only return with a location id.
2. Build an ingredient search that tries several query forms, since recipe wording often differs from shelf wording. Example: search garlic rather than garlic clove, and map common unit problems with a small lookup table.
3. Store regular price and promo price for each result with a timestamp. Respect the daily rate limits and cache results.
4. Add a live lookup endpoint for single items, so the phone can check one price on the spot.

Gate: owner confirms a sample search for ten common grocery items returns believable regular and promo prices.

## Phase 4: Coupon sync worker

Goal: Kroger digital and manufacturer coupons stored in the database on a schedule.

1. Build the worker as a separate module, decoupled from the web app, so the app never needs a browser. It drives a visible Chromium window through Playwright with a persistent profile stored outside the repo and gitignored. Headless mode is blocked by Kroger's firewall, so it must run headed on the desktop session.
2. Read the coupon list the way the reference tool does: make the requests from inside the page, replaying the page's own headers, and paginate through every category. Read only. Do not clip any coupons, since this tool is for planning, not clipping.
3. Parse each coupon into the schema from Phase 2 and keep the raw JSON. Upsert by external id, and mark coupons missing from a run as expired or removed.
4. Where possible, link coupons to products by brand, category, and description matching, and record a confidence level. Flag unmatched coupons rather than guessing.
5. Handle failure cleanly: if the session has expired, exit with a clear status and write it to sync\_runs so the web app can show a banner asking the owner to log in again. Never retry in a loop.
6. Schedule it nightly with a systemd timer or cron job. Because MagicMirror owns the screen, add a pre-step that pauses MagicMirror, runs the sync, and restores it, with a safe fallback that always restores it even on failure. Confirm this approach with the owner before installing the timer.
7. Add a small health check script and log rotation.

Gate: owner confirms a full manual run stores a believable number of coupons, with sensible discount amounts and expiry dates, and that MagicMirror comes back afterward.

## Phase 5: Deals search API and budget bundles

Goal: the owner enters optional inputs and gets suggested bundles.

1. Build a search endpoint. Every input is optional and they combine with or logic, not and: a budget amount, a number of people, and a list of wanted ingredients.
2. Return current deals first: products with a promo price or a matching coupon, with the effective price after coupon shown next to the regular price and the savings.
3. Build the bundle suggester. Given a budget, group deals into categories such as produce, protein, dairy, pantry, and frozen, and propose a few sets that stay at or under the limit. If a head count is given, scale quantities to it. If wanted ingredients are given, include them first and fill the rest from the best deals.
4. Show clearly which items need a coupon clipped in the Kroger app before checkout, since this tool does not clip.
5. Show data freshness on every result: when prices and coupons were last synced.

Gate: owner tests three searches, one with only a budget, one with only ingredients, and one with all three inputs, and confirms the results make sense.

## Phase 6: Mobile web interface

Goal: fast, phone-first use from anywhere.

1. Build a mobile-first React interface with a search screen, a results screen showing deals and bundles, and a quick item lookup screen for use in a store aisle.
2. Make it a progressive web app so it can be added to the phone home screen.
3. Keep it clean: large tap targets, readable prices, and a visible last-synced time. Add loading skeletons and friendly empty states.
4. Verify no horizontal scrolling at a 375 pixel width.

Gate: owner confirms it works on their phone over the internet.

## Phase 7: External access and hardening

1. Add the new hostname to the existing Cloudflare tunnel and point it at the app. Confirm the subdomain with the owner first.
2. Require login on every route. Add rate limiting on the login route and secure cookie settings.
3. Confirm the Kroger browser profile and any credentials are never reachable through the web app or any static route.
4. Add a backup command for the database and document how to restore it.
5. Write a final README covering setup, the nightly sync, what to do when the Kroger session expires, and what to do if Kroger changes their site: re-run the discover step, compare the fields to the schema, and update the parser.

## Known risks to keep visible

1. The internal coupon API is unofficial. Kroger can change or block it at any time, so the sync must fail loudly and the rest of the app must keep working on the last good data.
2. Automating a personal Kroger account is a gray area under Kroger's terms. Use a login the owner can afford to have flagged, and keep the worker read-only with gentle request pacing.
3. The reference tool is new and from a single author. Audit it, and prefer copying the technique into the project over depending on it at runtime.
4. Coupon to product matching will be imperfect. Show confidence and never present a guess as a certain saving.

## Working rules for every phase

1. Start each phase by restating the goal and listing the files you plan to touch.
2. Finish each phase with a written verification report: what was run, what was observed, and anything unresolved.
3. Wait for the owner to say go before starting the next phase.
