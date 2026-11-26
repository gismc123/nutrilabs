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
  kroger: {
    clientId: env.KROGER_CLIENT_ID ?? '',
    clientSecret: env.KROGER_CLIENT_SECRET ?? '',
  },
  // Local time zone for the schedule (store hours / "early morning").
  timeZone: env.TZ ?? 'America/Chicago',
  schedulerEnabled: env.PRICER_SCHEDULER !== 'off',
};

// Pacing per retailer.
export const RETAILER_POLICY = {
  kroger: { method: 'api', cacheDays: 1, gapSec: [0.3, 0.6], maxPerRun: 300 },
};

// Shown next to each retailer's prices in the app.
export const UPDATE_NOTE = {
  kroger: 'Live prices',
};

// When each job may run (local time).
export const SCHEDULE = {
  nightly: { retailers: ['kroger'], days: [0, 1, 2, 3, 4, 5, 6], startHour: [3, 4] },
};
