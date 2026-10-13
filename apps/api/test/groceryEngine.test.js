import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeIngredientName,
  parseUnit,
  consolidateIngredients,
  categorizeIngredient,
  findMatchingStaple,
  buildGroceryList,
  planFingerprint,
} from '../src/lib/groceryEngine.js';

const ing = (name, quantity, unit = null) => ({ name, quantity, unit });
const plan = (...recipes) => ({
  plannedMeals: recipes.map((ingredients, i) => ({
    dayOfWeek: 'MON', mealType: 'DINNER', recipe: { id: i + 1, name: `R${i}`, ingredients },
  })),
});
const byName = (items) => Object.fromEntries(items.map((i) => [i.normalizedName + '|' + (i.unit ?? ''), i]));

test('normalizes names: case, plurals, prep words, parentheticals', () => {
  assert.equal(normalizeIngredientName('Eggs'), 'egg');
  assert.equal(normalizeIngredientName('cooked rice (day-old)'), 'rice');
  assert.equal(normalizeIngredientName('Diced Tomatoes'), 'tomato');
  assert.equal(normalizeIngredientName('mixed berries'), 'mixed berry');
  assert.equal(normalizeIngredientName('onion, finely chopped'), 'onion');
  assert.equal(normalizeIngredientName('hummus'), 'hummus');
  assert.equal(normalizeIngredientName('frozen mixed berries'), 'frozen mixed berry');
});

test('parses units including plurals, case, and descriptors', () => {
  assert.equal(parseUnit('Cups').unit, 'cup');
  assert.equal(parseUnit('cup dry').unit, 'cup');
  assert.equal(parseUnit('Tbsp').unit, 'tbsp');
  assert.equal(parseUnit('lbs').dim, 'weight');
  assert.deepEqual(parseUnit('cans'), { dim: 'count', unit: 'can', factor: 1 });
  assert.deepEqual(parseUnit(null), { dim: 'count', unit: null, factor: 1 });
});

test('two recipes needing 1 cup rice total 2 cups on one line', () => {
  const out = consolidateIngredients([ing('rice', 1, 'cup'), ing('Rice', 1, 'cups')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].quantity, 2);
  assert.equal(out[0].unit, 'cups');
});

test('converts within volume and within weight', () => {
  const vol = consolidateIngredients([ing('milk', 1, 'cup'), ing('milk', 4, 'tbsp')]);
  assert.equal(vol.length, 1);
  assert.equal(vol[0].quantity, 1.25);
  assert.equal(vol[0].unit, 'cups');

  const wt = consolidateIngredients([ing('chicken breast', 1.5, 'lb'), ing('chicken breast', 8, 'oz')]);
  assert.equal(wt.length, 1);
  assert.equal(wt[0].quantity, 2);
  assert.equal(wt[0].unit, 'lb');

  const small = consolidateIngredients([ing('cumin', 1, 'tsp'), ing('cumin', 1.5, 'tsp')]);
  assert.equal(small[0].quantity, 2.5);
  assert.equal(small[0].unit, 'tsp');
});

test('singular/plural count items merge; incompatible units stay separate', () => {
  const out = consolidateIngredients([
    ing('eggs', 3), ing('egg', 1), ing('whole wheat tortilla', 1), ing('whole wheat tortillas', 2),
    ing('garlic', 3, 'cloves'), ing('garlic', 2, 'clove'), ing('cheese', 1, 'cup'), ing('cheese', 4, 'oz'),
  ]);
  const m = byName(out);
  assert.equal(m['egg|'].quantity, 4);
  assert.equal(m['whole wheat tortilla|'].quantity, 3);
  assert.equal(m['garlic|cloves'].quantity, 5);
  assert.ok(m['cheese|cup'] && m['cheese|oz'], 'volume and weight cheese are not merged');
});

test('categorizes by most specific keyword from the original name', () => {
  const cases = {
    'frozen mixed berries': 'FROZEN',
    'frozen peas and carrots': 'FROZEN',
    'diced tomatoes': 'CANNED',
    tomato: 'PRODUCE',
    'corn tortillas': 'GRAINS',
    'peanut butter': 'MISC',
    butter: 'DAIRY',
    'red pepper flakes': 'MISC',
    'bell pepper': 'PRODUCE',
    'mixed berries': 'PRODUCE',
    'vegetable broth': 'CANNED',
    eggplant: 'PRODUCE',
    eggs: 'PROTEIN',
    'coconut milk': 'CANNED',
    'rolled oats': 'GRAINS',
    'bone-in chicken thighs': 'PROTEIN',
    'green chiles': 'CANNED',
    'brussels sprouts': 'PRODUCE',
  };
  for (const [name, cat] of Object.entries(cases)) {
    assert.equal(categorizeIngredient(name), cat, name);
  }
});

test('pantry staples match whole trailing words only', () => {
  const staples = ['olive oil', 'salt', 'black pepper', 'garlic powder', 'onion powder', 'flour', 'sugar', 'Italian seasoning'];
  assert.equal(findMatchingStaple('garlic', staples), null);
  assert.equal(findMatchingStaple('onion', staples), null);
  assert.equal(findMatchingStaple('salted butter', staples), null);
  assert.equal(findMatchingStaple('flour tortillas', staples), null);
  assert.equal(findMatchingStaple('sugar snap peas', staples), null);
  assert.equal(findMatchingStaple('bell pepper', staples), null);
  assert.equal(findMatchingStaple('kosher salt', staples), 'salt');
  assert.equal(findMatchingStaple('extra virgin olive oil', staples), 'olive oil');
  assert.equal(findMatchingStaple('all-purpose flour', staples), 'flour');
  assert.equal(findMatchingStaple('pepper', staples), 'black pepper');
  assert.equal(findMatchingStaple('italian seasoning', staples), 'Italian seasoning');
});

test('buildGroceryList aggregates across meals and splits out staples', () => {
  const { items, excludedStaples } = buildGroceryList(
    plan(
      [ing('brown rice', 1, 'cup'), ing('onion', 1), ing('olive oil', 1, 'tbsp')],
      [ing('brown rice', 1, 'cup'), ing('onion', 0.5), ing('garlic', 2, 'cloves')],
    ),
    ['olive oil', 'garlic powder', 'onion powder'],
  );
  const m = byName(items);
  assert.equal(m['brown rice|cups'].quantity, 2);
  assert.equal(m['brown rice|cups'].category, 'GRAINS');
  assert.equal(m['onion|'].quantity, 1.5);
  assert.equal(m['garlic|cloves'].quantity, 2);
  assert.deepEqual(excludedStaples.map((s) => s.staple), ['olive oil']);
});

test('display names keep original wording minus parentheticals', () => {
  const [a, b] = consolidateIngredients([ing('bone-in chicken thighs', 2, 'lb'), ing('cooked rice (day-old)', 2, 'cups')]);
  assert.equal(a.name, 'bone-in chicken thighs');
  assert.equal(b.name, 'cooked rice');
});

test('fingerprint changes when the plan or staples change', () => {
  const a = plan([ing('rice', 1, 'cup')]);
  const b = plan([ing('rice', 2, 'cup')]);
  assert.equal(planFingerprint(a, ['salt']), planFingerprint(a, ['salt']));
  assert.notEqual(planFingerprint(a, ['salt']), planFingerprint(b, ['salt']));
  assert.notEqual(planFingerprint(a, ['salt']), planFingerprint(a, ['salt', 'sugar']));
});
