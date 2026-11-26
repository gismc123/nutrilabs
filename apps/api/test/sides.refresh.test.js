import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGroceryList, planFingerprint, mealsWithoutIngredients } from '../src/lib/groceryEngine.js';
import { nightlySlots, zonedTime } from '../src/deals/services/refresh.js';

const ing = (name, quantity, unit = null) => ({ name, quantity, unit });
const chicken = { id: 1, name: 'Brown sugar chicken', ingredients: [ing('chicken thighs', 2, 'lb'), ing('brown sugar', 0.25, 'cup')] };
const rice = { id: 2, name: 'Rice pilaf', ingredients: [ing('long grain rice', 1, 'cup'), ing('chicken broth', 2, 'cup')] };
const meal = (sides) => ({ plannedMeals: [{ dayOfWeek: 'MON', mealType: 'DINNER', recipe: chicken, sides }] });

test('side recipes add their ingredients to the grocery list', () => {
  const { items } = buildGroceryList(meal([{ id: 9, recipe: rice, name: null }]), []);
  const names = items.map((i) => i.normalizedName).sort();
  assert.deepEqual(names, ['brown sugar', 'chicken broth', 'chicken thigh', 'long grain rice']);
});

test('a quick side with no recipe goes on the list as one item', () => {
  const { items } = buildGroceryList(meal([{ id: 9, recipe: null, name: 'Bagged salad' }, { id: 10, recipe: null, name: '  ' }]), []);
  assert.ok(items.some((i) => i.normalizedName === 'bagged salad' && i.quantity == null));
  assert.equal(items.length, 3);
});

test('a meal with no sides builds the same list as before', () => {
  const a = buildGroceryList(meal([]), []).items;
  const b = buildGroceryList({ plannedMeals: [{ dayOfWeek: 'MON', mealType: 'DINNER', recipe: chicken }] }, []).items;
  assert.deepEqual(a, b);
});

test('adding or removing a side changes the plan fingerprint', () => {
  const none = planFingerprint(meal([]), []);
  const withRice = planFingerprint(meal([{ id: 9, recipe: rice, name: null }]), []);
  const withSalad = planFingerprint(meal([{ id: 9, recipe: null, name: 'Bagged salad' }]), []);
  assert.notEqual(none, withRice);
  assert.notEqual(withRice, withSalad);
});

test('side recipes without ingredients are reported', () => {
  const empty = { id: 3, name: 'Garlic bread', ingredients: [] };
  const r = mealsWithoutIngredients(meal([{ id: 9, recipe: empty, name: null }]));
  assert.deepEqual(r.map((x) => x.recipeName), ['Garlic bread']);
});

test('zonedTime gives the right instant across daylight saving', () => {
  // 3:45 in Chicago: CST is UTC-6 in January, CDT is UTC-5 in July.
  assert.equal(zonedTime(2026, 1, 15, 3, 45, 'America/Chicago').toISOString(), '2026-01-15T09:45:00.000Z');
  assert.equal(zonedTime(2026, 7, 15, 3, 45, 'America/Chicago').toISOString(), '2026-07-15T08:45:00.000Z');
});

test('nightly slots: last is on or before now, next is the following one', () => {
  const tz = 'America/Chicago';
  const before = nightlySlots(new Date('2026-11-26T09:00:00Z'), tz, '03:45'); // 3:00 local
  assert.equal(before.next.toISOString(), '2026-11-26T09:45:00.000Z');
  assert.equal(before.last.toISOString(), '2026-11-25T09:45:00.000Z');
  const after = nightlySlots(new Date('2026-11-26T10:00:00Z'), tz, '03:45'); // 4:00 local
  assert.equal(after.last.toISOString(), '2026-11-26T09:45:00.000Z');
  assert.equal(after.next.toISOString(), '2026-11-27T09:45:00.000Z');
  // DST ends 2026-11-01: the slot after it is an hour later in UTC.
  const dst = nightlySlots(new Date('2026-10-31T12:00:00Z'), tz, '03:45');
  assert.equal(dst.next.toISOString(), '2026-11-01T09:45:00.000Z');
});

test('quick sides land in sensible aisles', async () => {
  const { categorizeIngredient } = await import('../src/lib/groceryEngine.js');
  const cat = (n) => categorizeIngredient(n);
  assert.equal(cat('Bagged salad'), 'PRODUCE');
  assert.equal(cat('Garlic bread'), 'GRAINS');
  assert.equal(cat('Dinner rolls'), 'GRAINS');
  assert.equal(cat('Green beans'), 'PRODUCE');
  assert.equal(cat('Fruit'), 'PRODUCE');
  assert.equal(cat('Ranch salad dressing'), 'CANNED');
  assert.equal(cat('garlic'), 'PRODUCE');
});
