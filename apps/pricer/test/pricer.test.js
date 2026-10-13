import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parseAldiSearch } from '../src/retailers/aldi.js';
import { parseSamsSearch } from '../src/retailers/samsclub.js';
import { parseMeijerSearch, parseMeijerStores } from '../src/retailers/meijer.js';
import { detectBlock } from '../src/headlessx.js';
import { matchScore, pickBest } from '../src/core/match.js';
import { parseSize, unitPrice } from '../src/core/units.js';
import { searchTerm } from '../src/core/text.js';

// Fixtures are real pages captured from this server on 2026-09-30.
const fixture = (name) => {
  const buf = readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
  return name.endsWith('.gz') ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
};

test('ALDI: parses Instacart product cards, store, sale price', () => {
  const { products, store } = parseAldiSearch(fixture('aldi-black-beans.html.gz'));
  assert.equal(store, 'ALDI - MTJ 43 - Bowling Green');
  assert.ok(products.length >= 10);
  const beans = products.find((p) => p.name === 'Simply Nature Organic Black Beans');
  assert.equal(beans.size, '15.5 oz');
  assert.equal(beans.price, 1.05);
  assert.equal(beans.regularPrice, 1.09);
  assert.equal(beans.onSale, true);
  assert.match(beans.url, /^https:\/\/www\.aldi\.us\/store\/aldi\/products\//);
});

test("Sam's Club: parses __NEXT_DATA__ results, including under a challenge overlay", () => {
  const beans = parseSamsSearch(fixture('samsclub-black-beans.html.gz'));
  assert.ok(beans.some((p) => p.name.startsWith("Member's Mark Black Beans") && p.price === 10.98));
  const refried = beans.find((p) => /Refried/.test(p.name));
  assert.equal(refried.price, 8.98);
  assert.equal(refried.regularPrice, 9.98);
  assert.equal(refried.onSale, true);

  const chicken = parseSamsSearch(fixture('samsclub-chicken-challenge-overlay.html.gz'));
  assert.ok(chicken.length > 10);
  assert.ok(chicken.some((p) => p.unitPriceText === '$5.99/lb'));
});

test('block pages are detected; overlays with real data are not treated as empty', () => {
  assert.match(detectBlock(fixture('walmart-blocked.html.gz')), /Robot or human/);
  assert.match(detectBlock(fixture('samsclub-blocked.html.gz')), /human/);
  assert.equal(parseSamsSearch(fixture('samsclub-blocked.html.gz')).length, 0);
  assert.equal(detectBlock(fixture('aldi-black-beans.html.gz')), null);
});

test('Meijer: store-filtered search JSON and store list', () => {
  const products = parseMeijerSearch(JSON.parse(fixture('meijer-black-beans-272.json')));
  const own = products.find((p) => p.name === 'Meijer Black Beans, 15.25 oz');
  assert.equal(own.price, 0.99);
  assert.equal(own.size, '15.25 oz');
  assert.equal(products.find((p) => p.name === "Bush's Black Beans 15 oz").size, '15 oz');

  const [store] = parseMeijerStores(JSON.parse(fixture('meijer-stores-42134.json')));
  assert.deepEqual(
    { id: store.id, name: store.name, address: store.address },
    { id: '272', name: 'Meijer - Bowling Green', address: '1676 Westpark Dr., Bowling Green, KY' },
  );
});

test('matching rejects wrong products and keeps the plain ingredient', () => {
  const products = [
    { name: 'Private Selection Mixed Variety Frozen Cherries', price: 12.99 },
    { name: 'Great Value Frozen Mixed Berries, 48 oz', price: 9.48 },
  ];
  assert.equal(pickBest('frozen mixed berries', products).name, 'Great Value Frozen Mixed Berries, 48 oz');
  assert.equal(pickBest('frozen mixed berries', [products[0]]), null, 'cherries are not berries');

  const chicken = [
    { name: 'Oscar Mayer Deli Fresh Chicken Breast Lunchmeat', price: 4.49 },
    { name: 'Tyson Crispy Chicken Breast Strips', price: 8.72 },
    { name: 'Boneless Skinless Chicken Breasts', price: 2.59 },
  ];
  assert.equal(pickBest('chicken breast', chicken).name, 'Boneless Skinless Chicken Breasts');
  assert.ok(matchScore('eggs', 'Grade A Large White Eggs') >= 1);

  // Store relevance order breaks ties, which keeps store brands first.
  assert.equal(pickBest('peanut butter', [
    { name: 'Creamy Peanut Butter - Kroger - 16 Oz', price: 1.14 },
    { name: 'Jif Creamy Peanut Butter', price: 7.29 },
  ]).price, 1.14);
  assert.equal(pickBest('frozen mixed berries', [
    { name: 'Outshine Mixed Berry Frozen Fruit Pops, 12 Count', price: 7.29 },
    { name: 'Kroger Frozen Mixed Berries', price: 4.49 },
  ]).price, 4.49);

  const honey = [
    { name: 'General Mills Honey Nut Cheerios', price: 4.45 },
    { name: 'Simply Nature Organic Raw Honey, 16 oz', price: 5.99 },
  ];
  assert.equal(pickBest('honey', honey).name, 'Simply Nature Organic Raw Honey, 16 oz');
});

test('search terms drop cooking-state words but keep product forms', () => {
  assert.equal(searchTerm('cooked rice'), 'rice');
  assert.equal(searchTerm('cooked rice (day-old)'), 'rice');
  assert.equal(searchTerm('diced tomatoes'), 'tomatoes');
  assert.equal(searchTerm('frozen peas and carrots'), 'frozen peas and carrots');
});

test('package sizes and unit prices', () => {
  assert.deepEqual(parseSize('15.25 oz'), { base: 15.25, unit: 'oz' });
  assert.deepEqual(parseSize('1 gal'), { base: 128, unit: 'fl oz' });
  assert.deepEqual(parseSize('1/2 Gallon'), { base: 64, unit: 'fl oz' });
  assert.deepEqual(parseSize("Bush's Black Beans 15 oz., 6 pk."), { base: 90, unit: 'oz' });
  assert.deepEqual(parseSize('Member\'s Mark Black Beans 12 lbs.'), { base: 192, unit: 'oz' });
  assert.deepEqual(parseSize('18 ct'), { base: 18, unit: 'ct' });
  assert.equal(unitPrice(1.09, '15.5 oz').label, '$0.070/oz');
  assert.equal(unitPrice(2.65, '18 ct').label, '$0.15/ct');
});
