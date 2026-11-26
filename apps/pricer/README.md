# NutriLabs pricer

Standalone grocery price lookup. It shares no code with the meal-planning app:
it reads grocery lists from NutriLabs' read-only feed (`GET /api/pricer/feed`,
authenticated with `PRICER_TOKEN`) and answers store lookups for the Settings →
Connections tab. Everything it learns is cached in `/data` with a `fetchedAt`
timestamp on every price.

| Retailer | How | When |
|---|---|---|
| Kroger | Official Kroger developer API | Nightly (3 to 4 am) and on request |

Meijer, ALDI and Sam's Club were removed on 2026-11-26, and with them the
HeadlessX scraper the pricer used for ALDI and Sam's Club. Prices are cached for
a day; "refresh" in the app re-fetches. Time zone: `TZ` (default `America/Chicago`).

## Command line

Run inside the container (`docker compose exec -w /data pricer node /app/src/cli.js …`):

```sh
fetch-list --out list.json                          # this + next week's lists from NutriLabs
quote --list list.json [--zip 42134 | --kroger-store 02600509] [--out quotes.json]
stores kroger --zip 42134 --radius 25               # store lookup (cached 30 days)
probe kroger [--store ID]                           # one live search for "milk"
status                                              # schedule and recent log
```

`--list` accepts the feed file, a NutriLabs grocery-list response
(`itemsByCategory`), or a plain `["milk", "eggs"]` / `[{ "name": "milk" }]` array.

## HTTP API (all but `/health` need `x-pricer-token`)

- `GET /health`: service and retailers
- `GET /status`: schedule and the last 50 log events
- `GET /stores?retailer=kroger&zip=42134&radius=25`
- `POST /quotes` `{ items: [{ name }], stores: { kroger: { id } | { zip, radius } }, refresh? }`

## Tests

`node --test test/`: product matching, search terms and unit prices, no network.
