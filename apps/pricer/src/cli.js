#!/usr/bin/env node
// Command-line interface — run the pricer against a real grocery list without
// touching NutriLabs' meal-planning code.
//
//   node src/cli.js fetch-list [--out list.json]            pull lists from NutriLabs' pricer feed
//   node src/cli.js quote --list list.json [--retailers kroger,meijer,aldi,samsclub]
//        [--kroger-store ID | --zip 42134] [--meijer-store 272] [--limit N] [--live-scrape] [--out quotes.json]
//   node src/cli.js stores <kroger|meijer> --zip 42134 [--radius 25]
//   node src/cli.js probe <walmart|target|dollargeneral|aldi|samsclub>
//   node src/cli.js status
import { readFileSync, writeFileSync } from 'node:fs';
import { RETAILER_POLICY } from './config.js';
import { fetchFeed } from './core/feed.js';
import { quoteItems } from './core/quote.js';
import { findStores, resolveStore } from './core/stores.js';
import { getState } from './core/store.js';
import { ACTIVE_IDS, DISABLED, RETAILERS } from './retailers/index.js';
import { scheduleStatus } from './scheduler.js';

const [command, ...rest] = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) {
    const next = rest[i + 1];
    flags[rest[i].slice(2)] = next && !next.startsWith('--') ? (i++, next) : true;
  } else positional.push(rest[i]);
}

const money = (n) => (n == null ? '' : `$${n.toFixed(2)}`);

// Accept the pricer feed format, a NutriLabs grocery response (itemsByCategory)
// or a plain [{ name }] / ["name"] array.
function readItems(path) {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  if (Array.isArray(json)) return { items: json.map((i) => (typeof i === 'string' ? { name: i } : i)), stores: {} };
  if (json.profiles) return { items: json.profiles[0]?.items ?? [], stores: json.profiles[0]?.stores ?? {} };
  if (json.itemsByCategory) return { items: Object.values(json.itemsByCategory).flat(), stores: {} };
  if (json.items) return { items: json.items, stores: json.stores ?? {} };
  throw new Error('Unrecognised list format');
}

function printTable(quotes, items) {
  const retailers = Object.keys(quotes);
  const header = ['Item'.padEnd(26), ...retailers.map((r) => RETAILERS[r].label.padEnd(30))].join(' ');
  console.log(`\n${header}\n${'-'.repeat(header.length)}`);
  items.forEach((item, idx) => {
    const cells = retailers.map((r) => {
      const q = quotes[r][idx];
      const text = q.status === 'ok'
        ? `${money(q.price)}${q.onSale ? '*' : ''} ${q.product}`.slice(0, 30)
        : `(${q.status})`;
      return text.padEnd(30);
    });
    console.log([item.name.slice(0, 26).padEnd(26), ...cells].join(' '));
  });
  for (const r of retailers) {
    const ok = quotes[r].filter((q) => q.status === 'ok');
    const total = ok.reduce((s, q) => s + q.price, 0);
    const newest = quotes[r].map((q) => q.fetchedAt).filter(Boolean).sort().pop();
    const store = quotes[r].find((q) => q.store)?.store;
    console.log(`${RETAILERS[r].label}: ${ok.length}/${items.length} priced, ${money(total)} for one of each${store ? ` · ${store}` : ''}${newest ? ` · updated ${newest}` : ''}`);
  }
  console.log('* = on sale');
}

async function main() {
  switch (command) {
    case 'fetch-list': {
      const profiles = await fetchFeed();
      const out = flags.out ?? 'list.json';
      writeFileSync(out, JSON.stringify({ profiles }, null, 2));
      for (const p of profiles) console.log(`user ${p.userId}: ${p.items.length} items, stores ${JSON.stringify(p.stores)}`);
      console.log(`Saved to ${out}`);
      break;
    }
    case 'quote': {
      if (!flags.list) throw new Error('--list <file> is required');
      const { items, stores: listStores } = readItems(flags.list);
      const retailers = (flags.retailers ? String(flags.retailers).split(',') : ACTIVE_IDS).filter((r) => RETAILERS[r]);
      const prefs = {
        ...listStores,
        ...(flags['kroger-store'] || flags.zip ? { kroger: { id: flags['kroger-store'], zip: flags.zip, radius: Number(flags.radius ?? 25) } } : {}),
        ...(flags['meijer-store'] ? { meijer: { id: String(flags['meijer-store']) } } : {}),
      };
      const stores = {};
      for (const r of retailers) stores[r] = await resolveStore(r, prefs[r]);
      // Scraped retailers are only contacted with --live-scrape (still paced and capped).
      const live = Object.fromEntries(retailers.map((r) => [r, RETAILER_POLICY[r].method === 'api' || !!flags['live-scrape']]));
      const limit = flags.limit ? Number(flags.limit) : undefined;
      const scraped = retailers.filter((r) => RETAILER_POLICY[r].method === 'scrape');
      if (flags['live-scrape'] && scraped.length) {
        const n = Math.min(items.length, limit ?? Infinity);
        console.log(`Live scraping ${scraped.join(', ')}: up to ${n} searches each, ${scraped.map((r) => `${RETAILER_POLICY[r].gapSec.join('–')} s apart`).join(' / ')}.`);
      }
      const quotes = await quoteItems({
        items, retailers, stores, live, limit,
        onProgress: ({ retailer, item, n }) => process.stderr.write(`  ${retailer} #${n}: ${item}\n`),
      });
      printTable(quotes, items);
      if (flags.out) {
        writeFileSync(flags.out, JSON.stringify(quotes, null, 2));
        console.log(`Saved to ${flags.out}`);
      }
      break;
    }
    case 'stores': {
      const [retailer] = positional;
      const stores = await findStores(retailer, flags.zip, Number(flags.radius ?? 25));
      for (const s of stores) console.log(`${String(s.distanceMiles ?? '?').padStart(5)} mi  ${s.id.padEnd(10)} ${s.name} — ${s.address}`);
      break;
    }
    case 'probe': {
      const [retailer] = positional;
      if (DISABLED[retailer]) {
        console.log(`${retailer}: disabled (${DISABLED[retailer].reason}). Re-testing once…`);
        console.log(await DISABLED[retailer].probe());
      } else if (RETAILERS[retailer]) {
        const res = await RETAILERS[retailer].search('milk', flags.store);
        console.log(`${retailer}: ${res.products.length} products${res.store ? ` at ${res.store}` : ''}`);
        for (const p of res.products.slice(0, 5)) console.log(`  ${money(p.price)} ${p.name}${p.size ? ` (${p.size})` : ''}`);
      } else throw new Error(`Unknown retailer "${retailer}"`);
      break;
    }
    case 'status': {
      const state = getState();
      console.log(JSON.stringify({ schedule: scheduleStatus(), retailers: state.retailers, log: state.log.slice(-15) }, null, 2));
      break;
    }
    default:
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n'));
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
