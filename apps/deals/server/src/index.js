import cron from 'node-cron';
import { config } from './config.js';
import { prisma } from './db.js';
import { createPublicApp, createInternalApp } from './app.js';
import { ensureStaples, startPriceSync } from './services/priceSync.js';
import { clearDealCache } from './services/deals.js';

async function main() {
  await prisma.$connect();
  await prisma.appConfig.upsert({ where: { id: 1 }, create: { id: 1, zip: config.defaultZip || null }, update: {} });
  await ensureStaples();

  createPublicApp().listen(config.port, () => console.log(`KrogerDeals web on :${config.port}`));
  createInternalApp().listen(config.internalPort, () => console.log(`KrogerDeals internal on :${config.internalPort}`));

  // Nightly prices from the official API. Coupons come from the worker's own timer.
  cron.schedule(config.priceSyncCron, () => startPriceSync('nightly').then(clearDealCache), { timezone: config.tz });
  console.log(`Price sync scheduled "${config.priceSyncCron}" (${config.tz})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
