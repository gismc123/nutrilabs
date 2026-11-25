// Deals settings, read from the NutriLabs environment (root .env via docker-compose.yml).
const env = process.env;

export const config = {
  workerToken: env.DEALS_WORKER_TOKEN || '',
  kroger: {
    clientId: env.KROGER_CLIENT_ID || '',
    clientSecret: env.KROGER_CLIENT_SECRET || '',
    // Free tier allows 10,000 product calls a day, shared with NutriLabs grocery
    // pricing. Deals stays well under it.
    dailyProductBudget: Number(env.KROGER_DAILY_PRODUCT_BUDGET || 6000),
  },
  priceSyncCron: env.DEALS_PRICE_SYNC_CRON || '30 4 * * *',
  tz: env.DEALS_TZ || 'America/Chicago',
  // Nightly sync covers at most this many distinct stores (users' chosen stores).
  maxSyncStores: Number(env.DEALS_MAX_SYNC_STORES || 3),
};
