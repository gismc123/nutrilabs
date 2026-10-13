// All runtime configuration comes from the environment so the pricer can run
// on its own (CLI or container) without any NutriLabs code.
const env = process.env;

export const config = {
  port: parseInt(env.PORT ?? '4010'),
  dataDir: env.PRICER_DATA_DIR ?? './data',
  // Shared secret for requests from NutriLabs (store lookups, quotes) and for
  // pulling grocery lists from NutriLabs' pricer feed.
  token: env.PRICER_TOKEN ?? '',
  nutrilabsUrl: env.NUTRILABS_URL ?? 'http://nutrilabs-api:3001',
  headlessx: {
    url: env.HEADLESSX_URL ?? 'http://headlessx-api:8000',
    apiKey: env.HEADLESSX_API_KEY ?? '',
    timeoutMs: 60_000,
  },
  kroger: {
    clientId: env.KROGER_CLIENT_ID ?? '',
    clientSecret: env.KROGER_CLIENT_SECRET ?? '',
  },
  // Local time zone for the schedule (store hours / "early morning").
  timeZone: env.TZ ?? 'America/Chicago',
  schedulerEnabled: env.PRICER_SCHEDULER !== 'off',
};

// Conservative pacing per retailer. Scraped retailers (browser) run once a
// week, slowly, capped, and pause for days at the first sign of a block.
export const RETAILER_POLICY = {
  kroger:   { method: 'api',    cacheDays: 1, gapSec: [0.3, 0.6],  maxPerRun: 300 },
  meijer:   { method: 'api',    cacheDays: 1, gapSec: [0.6, 1.2],  maxPerRun: 300 },
  aldi:     { method: 'scrape', cacheDays: 7, gapSec: [60, 120],   maxPerRun: 40 },
  samsclub: { method: 'scrape', cacheDays: 7, gapSec: [90, 180],   maxPerRun: 15 },
};

// Shown next to scraped retailers' prices in the app.
export const UPDATE_NOTE = {
  kroger: 'Live prices',
  meijer: 'Live prices',
  aldi: 'Updated Saturday mornings',
  samsclub: 'Updated Wednesday mornings (bulk sizes)',
};

// When each job may run (local time). Scraped retailers never share a day.
export const SCHEDULE = {
  nightly:  { retailers: ['kroger', 'meijer'], days: [0, 1, 2, 3, 4, 5, 6], startHour: [3, 4] },
  aldi:     { retailers: ['aldi'],             days: [6],                   startHour: [4, 6] }, // Saturday
  samsclub: { retailers: ['samsclub'],         days: [3],                   startHour: [4, 6] }, // Wednesday
};

// First block pauses a scraped retailer 7 days; a repeat within 30 days, 14.
export const BLOCK_PAUSE_DAYS = [7, 14];
