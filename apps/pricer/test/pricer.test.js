import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchScore, pickBest } from '../src/core/match.js';
import { parseSize, unitPrice } from '../src/core/units.js';
import { searchTerm } from '../src/core/text.js';

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
