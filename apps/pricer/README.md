# NutriLabs pricer

Standalone grocery price lookup. It shares no code with the meal-planning app:
it reads grocery lists from NutriLabs' read-only feed (`GET /api/pricer/feed`,
authenticated with `PRICER_TOKEN`) and answers store lookups for the Settings →
Connections tab. Everything it learns is cached in `/data` with a `fetchedAt`
timestamp on every price.

| Retailer | How | When |
|---|---|---|
| Kroger | Official Kroger developer API | Nightly (3–4 am) and on request |
| Meijer | Meijer's product search (Constructor.io JSON), filtered to your store | Nightly (3–4 am) and on request |
| ALDI | HeadlessX (Camoufox) search page, IP-located store | Saturdays, random start 4–6 am, 60–120 s between searches, max 40 |
| Sam's Club | HeadlessX search page (`__NEXT_DATA__`) | Wednesdays, random start 4–6 am, 90–180 s between searches, max 15 |
| Walmart, Target, Dollar General | Disabled — blocked by PerimeterX / Cloudflare (2026-09-30) | Never; re-test with `probe` |

Scraped retailers are never contacted on demand: requests from the app get the
cached price. The first block pauses that retailer for 7 days (14 if it happens
again within 30 days). Scheduled jobs only run inside their early-morning
window, so restarting the service mid-day never triggers a catch-up run.
Time zone: `TZ` (default `America/Chicago`).

## Command line

Run inside the container (`docker compose exec -w /data pricer node /app/src/cli.js …`):

```sh
fetch-list --out list.json                          # this + next week's lists from NutriLabs
quote --list list.json --retailers kroger,meijer    # live API prices
      [--zip 42134 | --kroger-store 02600509] [--meijer-store 272] [--out quotes.json]
quote --list list.json --retailers aldi --live-scrape --limit 5   # paced, capped scrape
stores meijer --zip 42134 --radius 50               # store lookup (cached 30 days)
probe walmart                                       # re-test a disabled retailer (one request)
status                                              # schedule, pauses, recent log
```

`--list` accepts the feed file, a NutriLabs grocery-list response
(`itemsByCategory`), or a plain `["milk", "eggs"]` / `[{ "name": "milk" }]` array.

## HTTP API (all but `/health` need `x-pricer-token`)

- `GET /health` — service, HeadlessX reachability, retailer pauses
- `GET /status` — schedule, pauses, last 50 log events
- `GET /stores?retailer=kroger|meijer&zip=42134&radius=25`
- `POST /quotes` `{ items: [{ name }], stores: { kroger: { id } | { zip, radius }, meijer: { id } } }`
  — Kroger/Meijer live, ALDI/Sam's Club from cache

## Tests

`node --test test/` — parsers and matching against real pages captured on 2026-09-30
(`test/fixtures`), no network.
