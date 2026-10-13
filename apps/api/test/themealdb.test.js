import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMeasure, cleanInstructions, mapToNutriLabsRecipe, toSummary } from '../src/services/themealdb.js';
import { buildGroceryList, categorizeIngredient } from '../src/lib/groceryEngine.js';

const m = (raw) => {
  const { quantity, unit, note } = parseMeasure(raw);
  return [quantity, unit, note];
};

// Every case below is a real strMeasure value from TheMealDB.
test('parses plain amounts and spelled-out units', () => {
  assert.deepEqual(m('1'), [1, null, null]);
  assert.deepEqual(m('350g'), [350, 'g', null]);
  assert.deepEqual(m('1.2 kg'), [1.2, 'kg', null]);
  assert.deepEqual(m('3  tablespoons'), [3, 'tbsp', null]);
  assert.deepEqual(m('1 tblsp'), [1, 'tbsp', null]);
  assert.deepEqual(m('2 Lbs'), [2, 'lb', null]);
  assert.deepEqual(m('1 Litre'), [1, 'l', null]);
  assert.deepEqual(m('1/2 cup '), [0.5, 'cup', null]);
});

test('parses fractions, mixed numbers and ranges', () => {
  assert.deepEqual(m('¼ cup'), [0.25, 'cup', null]);
  assert.deepEqual(m('1½ tsp'), [1.5, 'tsp', null]);
  assert.deepEqual(m('1 1/2 cups'), [1.5, 'cup', null]);
  assert.deepEqual(m('2-1/2 cups'), [2.5, 'cup', null]);
  assert.deepEqual(m('1-⅓ cups'), [1.333, 'cup', null]);
  assert.deepEqual(m('1 and 1/8 cup'), [1.125, 'cup', null]);
  assert.deepEqual(m('2-3 tbsp'), [3, 'tbsp', null]);
  assert.deepEqual(m('6-8 slices'), [8, 'slice', null]);
  assert.deepEqual(m('Half'), [0.5, null, null]);
});

test('keeps prep words and sizes as a note', () => {
  assert.deepEqual(m('5 thinly sliced'), [5, null, 'thinly sliced']);
  assert.deepEqual(m('8 cloves chopped'), [8, 'clove', 'chopped']);
  assert.deepEqual(m('1 large'), [1, null, 'large']);
  assert.deepEqual(m('2 small stalks'), [2, 'stalk', 'small']);
  assert.deepEqual(m('2 tsp ground'), [2, 'tsp', 'ground']);
  assert.deepEqual(m('8-ounce sliced'), [8, 'oz', 'sliced']);
});

test('drops alternate units and resolves pack sizes', () => {
  assert.deepEqual(m('75g/3oz'), [75, 'g', null]);
  assert.deepEqual(m('50ml/2fl oz'), [50, 'ml', null]);
  assert.deepEqual(m('6oz/180g'), [6, 'oz', null]);
  assert.deepEqual(m('2 x 400g tins'), [800, 'g', null]);
  assert.deepEqual(m('1 (400g) tin'), [400, 'g', null]);
  assert.deepEqual(m('400ml can'), [400, 'ml', null]);
  assert.deepEqual(m('1 – 14-ounce can'), [14, 'oz', null]);
  assert.deepEqual(m('4 tablespoons (55 grams)'), [4, 'tbsp', null]);
  assert.deepEqual(m('3cm piece'), [1, 'piece', '3cm']);
});

test('handles juice/zest counts and unquantified measures', () => {
  assert.deepEqual(m('Juice of 1'), [1, null, 'juice']);
  assert.deepEqual(m('Juice of 1/2'), [0.5, null, 'juice']);
  assert.deepEqual(m('Zest and juice of 2'), [2, null, 'zest and juice']);
  assert.deepEqual(m('Juice/zest of one'), [1, null, 'juice and zest']);
  assert.deepEqual(m('Pinch'), [1, 'pinch', null]);
  assert.deepEqual(m('Handfull'), [1, 'handful', null]);
  assert.deepEqual(m('Leaves'), [null, null, 'leaves']);
  assert.deepEqual(m('To taste'), [null, null, 'to taste']);
  assert.deepEqual(m(' '), [null, null, null]);
  assert.deepEqual(m(null), [null, null, null]);
});

test('flags garnish/serving measures as optional', () => {
  assert.equal(parseMeasure('To serve').isOptional, true);
  assert.equal(parseMeasure('Garnish').isOptional, true);
  assert.equal(parseMeasure('1 red deseeded and finely sliced, to serve').isOptional, true);
  assert.equal(parseMeasure('For frying').isOptional, false);
  assert.equal(parseMeasure('2 tbsp').isOptional, false);
});

test('cleans instructions into one step per line', () => {
  const raw = 'STEP 1\r\nHeat the oil.\r\n\r\nSTEP 2\r\nAdd onions.\r\n3. Simmer for 10 minutes.\r\n';
  assert.equal(cleanInstructions(raw), 'Heat the oil.\nAdd onions.\nSimmer for 10 minutes.');
  assert.equal(cleanInstructions(''), null);
});

const handi = {
  idMeal: '52795', strMeal: 'Chicken Handi ', strCategory: 'Chicken', strArea: 'India', strCountry: 'India',
  strInstructions: 'Heat oil.\r\nAdd chicken.', strMealThumb: 'https://www.themealdb.com/images/media/meals/wyxwsp1486979827.jpg',
  strTags: 'Meat,Curry', strYoutube: 'https://www.youtube.com/watch?v=IO0issT0Rmc',
  strIngredient1: 'Chicken', strMeasure1: '1.2 kg',
  strIngredient2: 'Onion', strMeasure2: '5 thinly sliced',
  strIngredient3: 'Green chilli', strMeasure3: '2',
  strIngredient4: 'Coriander', strMeasure4: 'To serve',
  strIngredient5: '', strMeasure5: '',
  strIngredient6: null, strMeasure6: null,
};

test('maps a meal to a NutriLabs recipe', () => {
  const r = mapToNutriLabsRecipe(handi);
  assert.equal(r.name, 'Chicken Handi');
  assert.equal(r.mealType, 'DINNER');
  assert.equal(r.source, 'THEMEALDB');
  assert.equal(r.mealDbId, 52795);
  assert.equal(r.servings, 4);
  assert.equal(r.isKidFriendly, false, 'green chilli makes it spicy');
  assert.deepEqual(r.tags, ['India', 'meat', 'curry']);
  assert.equal(r.instructions, 'Heat oil.\nAdd chicken.');
  assert.deepEqual(r.ingredients.map(({ original, ...i }) => i), [
    { name: 'Chicken', quantity: 1.2, unit: 'kg', isOptional: false },
    { name: 'Onion (thinly sliced)', quantity: 5, unit: null, isOptional: false },
    { name: 'Green chilli', quantity: 2, unit: null, isOptional: false },
    { name: 'Coriander (to serve)', quantity: null, unit: null, isOptional: true },
  ]);
});

test('maps categories to meal types', () => {
  const type = (strCategory) => mapToNutriLabsRecipe({ ...handi, strCategory }).mealType;
  assert.equal(type('Breakfast'), 'BREAKFAST');
  assert.equal(type('Side'), 'LUNCH');
  assert.equal(type('Starter'), 'LUNCH');
  assert.equal(type('Dessert'), 'SNACK');
  assert.equal(type('Beef'), 'DINNER');
});

test('summaries use the medium thumbnail and fall back to strCountry', () => {
  const s = toSummary({ ...handi, strArea: null, strCountry: 'Belgium' });
  assert.equal(s.id, 52795);
  assert.equal(s.cuisine, 'Belgium');
  assert.match(s.image, /\/medium$/);
});

test('imported ingredients merge cleanly in the grocery list', () => {
  const imported = mapToNutriLabsRecipe(handi).ingredients;
  const own = [{ name: 'onion', quantity: 1, unit: null }];
  const plan = { plannedMeals: [imported, own].map((ingredients, i) => ({ dayOfWeek: 'MON', mealType: 'DINNER', recipe: { id: i, name: 'R', ingredients } })) };
  const { items } = buildGroceryList(plan, []);
  const onion = items.find((i) => i.normalizedName === 'onion');
  assert.equal(onion.quantity, 6);
  assert.ok(!onion.name.includes('('), 'prep note is not shown on the shopping list');
  assert.equal(items.find((i) => i.normalizedName === 'chicken').unit, 'kg', 'metric-only amounts stay metric');
});

test('categorizes British ingredient names from TheMealDB', () => {
  assert.equal(categorizeIngredient('Tomato Puree'), 'CANNED');
  assert.equal(categorizeIngredient('Lasagne Sheets'), 'GRAINS');
  assert.equal(categorizeIngredient('Creme Fraiche'), 'DAIRY');
  assert.equal(categorizeIngredient('Courgettes'), 'PRODUCE');
  assert.equal(categorizeIngredient('King Prawns'), 'PROTEIN');
});
