import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  macrosFromNutrients, portionsFromDetail, scoreDescription, rankFoods, matchKey,
  curatedFdcId, curatedCollisions, gramsFor, macrosForGrams, MIN_MATCH_SCORE,
} from '../src/lib/macroCalc.js';

const n = (number, value) => ({ nutrientNumber: number, value });

test('reads macros by nutrient number, kcal before kJ, Atwater energy for Foundation foods', () => {
  // kJ listed first must not be taken as calories.
  assert.deepEqual(
    macrosFromNutrients([n('268', 1100), n('208', 263), n('203', 14.7), n('204', 15.8), n('205', 15)]),
    { calories: 263, proteinG: 14.7, carbsG: 15, fatG: 15.8 },
  );
  // Foundation foods have no 208, only Atwater energy; carbs by difference can be negative.
  assert.deepEqual(
    macrosFromNutrients([n('957', 127), n('958', 133), n('203', 21.4), n('204', 4.78), n('205', -0.428)]),
    { calories: 127, proteinG: 21.4, carbsG: 0, fatG: 4.8 },
  );
  // Detail-endpoint shape.
  assert.equal(macrosFromNutrients([{ nutrient: { number: '208' }, amount: 40 }]).calories, 40);
  assert.equal(macrosFromNutrients([]), null);
});

test('flattens USDA portions from both SR Legacy and Foundation shapes', () => {
  const detail = { foodPortions: [
    { amount: 1, modifier: 'clove', measureUnit: { name: 'undetermined' }, gramWeight: 3 },
    { amount: 1, modifier: '', measureUnit: { name: 'cup' }, gramWeight: 249 },
    { amount: 1, modifier: null, measureUnit: { name: 'RACC' }, gramWeight: 114 },
  ] };
  assert.deepEqual(portionsFromDetail(detail), [
    { amount: 1, label: 'clove', gramWeight: 3 },
    { amount: 1, label: 'cup', gramWeight: 249 },
  ]);
});

test('curated staples cover US and UK names through the grocery normalizer', () => {
  assert.equal(curatedFdcId(matchKey('Eggs')), 171287);
  assert.equal(curatedFdcId(matchKey('extra virgin olive oil')), 171413);
  assert.equal(curatedFdcId(matchKey('Caster Sugar')), 169655);
  assert.equal(curatedFdcId(matchKey('Double Cream')), 170859);
  assert.equal(curatedFdcId(matchKey('Spring Onions')), 170005);
  assert.equal(curatedFdcId(matchKey('fresh coriander')), 169997);
  assert.equal(curatedFdcId(matchKey('Garlic (chopped)')), 169230);
  assert.equal(curatedFdcId(matchKey('dragon fruit')), null);
});

test('ranking prefers the plain raw food over processed and branded variants', () => {
  const foods = [
    { fdcId: 1, description: 'Lunchmeat, chicken breast, sliced', dataType: 'Foundation' },
    { fdcId: 2, description: 'Chicken breast tenders, breaded, uncooked', dataType: 'SR Legacy' },
    { fdcId: 3, description: 'Chicken, breast, boneless, skinless, raw', dataType: 'Foundation' },
  ];
  assert.equal(rankFoods('chicken breast', foods)[0].fdcId, 3);

  const yogurt = [
    { fdcId: 1, description: 'Yogurt, Greek, Blueberry, CHOBANI', dataType: 'SR Legacy' },
    { fdcId: 2, description: 'Yogurt, Greek, plain, lowfat', dataType: 'SR Legacy' },
  ];
  assert.equal(rankFoods('greek yogurt', yogurt)[0].fdcId, 2);
});

test('ranking handles USDA group prefixes and modifier words', () => {
  const foods = [
    { fdcId: 1, description: 'Chicken, ground, raw', dataType: 'SR Legacy' },
    { fdcId: 2, description: 'Spices, cumin seed', dataType: 'SR Legacy' },
  ];
  assert.equal(rankFoods('ground cumin', foods)[0].fdcId, 2);
  // "green" alone is not enough to match "Beet greens".
  assert.equal(scoreDescription('green chile', 'Beet greens, raw', 'SR Legacy'), null);
  // The head noun must be present.
  assert.equal(scoreDescription('frozen mixed berry', 'Vegetables, mixed, frozen, unprepared', 'SR Legacy'), null);
  assert.ok(scoreDescription('mixed berry', 'Snack, Mixed Berry Bar', 'SR Legacy') < MIN_MATCH_SCORE);
});

const onion = { portions: [
  { amount: 1, label: 'cup, chopped', gramWeight: 160 },
  { amount: 1, label: 'slice, medium (1/8" thick)', gramWeight: 14 },
  { amount: 1, label: 'medium (2-1/2" dia)', gramWeight: 110 },
  { amount: 1, label: 'large', gramWeight: 150 },
  { amount: 1, label: 'tbsp chopped', gramWeight: 10 },
  { amount: 1, label: 'cup, sliced', gramWeight: 115 },
], unitGrams: {} };
const egg = { portions: [
  { amount: 1, label: 'cup (4.86 large eggs)', gramWeight: 243 },
  { amount: 1, label: 'extra large', gramWeight: 56 },
  { amount: 1, label: 'medium', gramWeight: 44 },
  { amount: 1, label: 'large', gramWeight: 50 },
], unitGrams: {} };
const garlic = { portions: [{ amount: 1, label: 'tsp', gramWeight: 2.8 }, { amount: 1, label: 'clove', gramWeight: 3 }, { amount: 1, label: 'cup', gramWeight: 136 }], unitGrams: {} };
const g = (ing, food) => {
  const grams = gramsFor(ing, food).grams;
  return grams == null ? grams : Math.round(grams * 1000) / 1000;
};

test('converts weights directly', () => {
  assert.equal(g({ name: 'beef', quantity: 500, unit: 'g' }, null), 500);
  assert.ok(Math.abs(g({ name: 'chicken', quantity: 1.5, unit: 'lb' }, null) - 680.388) < 0.01);
});

test('converts volumes through USDA portions, preferring the matching prep', () => {
  assert.equal(g({ name: 'Onion (chopped)', quantity: 0.5, unit: 'cup' }, onion), 80);
  assert.equal(g({ name: 'Onion (sliced)', quantity: 0.5, unit: 'cup' }, onion), 57.5);
  assert.equal(g({ name: 'garlic', quantity: 1, unit: 'tbsp' }, garlic), 8.4);
  const water = gramsFor({ name: 'stock', quantity: 1, unit: 'cup' }, { portions: [], unitGrams: {} });
  assert.ok(Math.abs(water.grams - 236.6) < 0.1);
  assert.equal(water.estimated, true);
});

test('converts counts to whole-item portions', () => {
  assert.equal(g({ name: 'eggs', quantity: 3, unit: null }, egg), 150, 'large eggs by default');
  assert.equal(g({ name: 'Egg (medium)', quantity: 1, unit: null }, egg), 44);
  assert.equal(g({ name: 'onion', quantity: 1, unit: null }, onion), 110, 'medium, not a slice');
  assert.equal(g({ name: 'Onion (large)', quantity: 2, unit: null }, onion), 300);
  assert.equal(g({ name: 'garlic', quantity: 2, unit: 'clove' }, garlic), 6);
});

test('uses saved grams, then container estimates, else asks', () => {
  const parsley = { portions: [{ amount: 10, label: 'sprigs', gramWeight: 10 }], unitGrams: { bunch: 30 } };
  assert.equal(g({ name: 'parsley', quantity: 3, unit: 'sprig' }, parsley), 3);
  assert.equal(g({ name: 'parsley', quantity: 1, unit: 'bunch' }, parsley), 30);
  const can = gramsFor({ name: 'black beans', quantity: 1, unit: 'can' }, { portions: [], unitGrams: {} });
  assert.deepEqual([can.grams, can.estimated], [425, true]);
  assert.deepEqual(gramsFor({ name: 'parsley', quantity: 1, unit: 'bunch' }, { portions: [], unitGrams: {} }), { grams: null, reason: 'no-portion', countUnit: 'bunch' });
  assert.equal(gramsFor({ name: 'salt', quantity: null, unit: null }, garlic).reason, 'no-quantity');
});

test('borrowed portions say where they came from', () => {
  const redOnion = { portions: onion.portions.map((p) => ({ ...p, from: 'Onions, raw' })), unitGrams: {} };
  assert.match(gramsFor({ name: 'red onion', quantity: 1, unit: null }, redOnion).how, /\(Onions, raw\)$/);
});

test('scales per-100 g macros', () => {
  const m = macrosForGrams({ calories: 40, proteinG: 1.1, carbsG: 9.3, fatG: 0.1 }, 150);
  const expected = { calories: 60, proteinG: 1.65, carbsG: 13.95, fatG: 0.15 };
  for (const k of Object.keys(expected)) assert.ok(Math.abs(m[k] - expected[k]) < 1e-9, k);
});

test('curated aliases never collide after normalization', () => {
  assert.deepEqual(curatedCollisions(), []);
});

test('cooked foods keep their own key', () => {
  assert.equal(matchKey('cooked rice (day-old)'), 'cooked rice');
  assert.equal(curatedFdcId(matchKey('cooked rice (day-old)')), 168878);
  assert.equal(matchKey('rice (cooked)'), 'rice', 'only the name itself, not a prep note');
  assert.equal(matchKey('uncooked rice'), 'rice');
  assert.equal(curatedFdcId(matchKey('Diced Tomatoes')), curatedFdcId(matchKey('tomato')));
});

test('a stalk of green onion is one whole scallion', () => {
  const scallion = { portions: [{ amount: 1, label: 'cup, chopped', gramWeight: 100 }, { amount: 1, label: 'medium (4-1/8" long)', gramWeight: 15 }, { amount: 1, label: 'large', gramWeight: 25 }], unitGrams: {} };
  assert.equal(g({ name: 'green onion', quantity: 2, unit: 'stalk' }, scallion), 30);
  assert.equal(gramsFor({ name: 'garlic', quantity: 1, unit: 'head' }, garlic).reason, 'no-portion');
});

test('prep words in the name pick the matching cup weight', () => {
  const cabbage = { portions: [{ amount: 1, label: 'cup, chopped', gramWeight: 89 }, { amount: 1, label: 'cup, shredded', gramWeight: 70 }], unitGrams: {} };
  assert.equal(g({ name: 'shredded cabbage', quantity: 1, unit: 'cup' }, cabbage), 70);
});
