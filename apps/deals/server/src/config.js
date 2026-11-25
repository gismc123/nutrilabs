// All settings come from the environment (apps/deals/.env, gitignored).
const env = process.env;

function required(name, minLength = 1) {
  const v = env[name];
  if (!v || v.length < minLength) {
    throw new Error(`${name} must be set${minLength > 1 ? ` (at least ${minLength} characters)` : ''}`);
  }
  return v;
}

export const config = {
  port: Number(env.PORT || 3101),
  internalPort: Number(env.INTERNAL_PORT || 3102),
  production: env.NODE_ENV === 'production',
  jwtSecret: env.NODE_ENV === 'test' ? 'test-secret-test-secret-test-secret' : required('DEALS_JWT_SECRET', 32),
  workerToken: env.DEALS_WORKER_TOKEN || '',
  kroger: {
    clientId: env.KROGER_CLIENT_ID || '',
    clientSecret: env.KROGER_CLIENT_SECRET || '',
    // Free tier allows 10,000 product calls a day; stay well under it.
    dailyProductBudget: Number(env.KROGER_DAILY_PRODUCT_BUDGET || 6000),
  },
  defaultZip: env.DEALS_DEFAULT_ZIP || '',
  nutrilabs: {
    url: env.NUTRILABS_URL || '',
    token: env.NUTRILABS_PRICER_TOKEN || '',
  },
  priceSyncCron: env.PRICE_SYNC_CRON || '30 4 * * *',
  tz: env.TZ || 'America/Chicago',
  sessionDays: 30,
};
