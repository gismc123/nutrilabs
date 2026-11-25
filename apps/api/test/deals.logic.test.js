// Pure logic tests: no database, no network. Coupon shapes mirror the live v2
// payload documented in COUPON-SCHEMA.md (hand-written, not a data dump).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, parseCoupon, applyCoupon } from '../src/deals/services/couponParser.js';
import { queryVariants } from '../src/deals/lib/ingredients.js';
import { scoreLink, productPhrase, couponKeywords } from '../src/deals/services/matcher.js';
import { priceProduct, buildBundles } from '../src/deals/services/deals.js';
import { parseSize } from '../src/deals/lib/units.js';
import { groupFor, isFood } from '../src/deals/lib/categories.js';

const raw = (over) => ({
  id: '1', title: 'Save $1.00', shortDescription: 'Save $1.00 on Brand', value: 1, savings: 1, brand: 'Brand',
  categories: ['Dairy'], requirementQuantity: 1, requirements: [{ type: 'QUANTITY', amount: 1 }],
  redemptionsAllowed: 1, modalities: ['PICKUP', 'IN_STORE', 'DELIVERY'], specialSavings: [{ name: 'General Savings' }],
  expirationDate: '2099-01-01T00:00:00Z', displayStartDate: '2026-11-01T00:00:00Z', addedToCard: false, ...over,
});

test('classifies the discount types seen live', () => {
  assert.equal(classify(raw({ title: 'Save $3.00 on 2', shortDescription: 'Save $3.00 on 2 Colgate', value: 3, requirementQuantity: 2 })).discountType, 'AMOUNT_OFF');
  assert.equal(classify(raw({ title: 'Save 50¢', value: 0.5 })).amountOff, 0.5);
  const fixed = classify(raw({ title: '$2.49', shortDescription: '$2.49 Sabra Hummus', value: 2.49, specialSavings: [{ name: 'WDD' }] }));
  assert.deepEqual([fixed.discountType, fixed.fixedPrice, fixed.perLb], ['FIXED_PRICE', 2.49, false]);
  const lb = classify(raw({ title: '58¢/lb Kroger Frozen Turkey', shortDescription: '$0.58 lb Kroger Frozen Turkey', value: 0.58 }));
  assert.deepEqual([lb.discountType, lb.fixedPrice, lb.perLb], ['FIXED_PRICE', 0.58, true]);
  assert.equal(classify(raw({ title: '17.99 PS Cheesecakes', value: 17.99 })).discountType, 'FIXED_PRICE');
  assert.equal(classify(raw({ title: 'Save 20%', value: 20 })).percentOff, 20);
  assert.equal(classify(raw({ title: 'Buy 1, Get 1 Free', shortDescription: 'Buy 1 Coca-Cola, Get 1 FREE', value: 0, requirementQuantity: 2 })).discountType, 'BOGO');
  assert.equal(classify(raw({ title: 'Get 4x POINTS', value: 2 })).discountType, 'POINTS');
  assert.equal(classify(raw({ title: 'Get 500 POINTS', value: 500, requirements: [{ type: 'SPEND', amount: 100 }] })).discountType, 'POINTS');
  assert.equal(classify(raw({ title: 'Free Express Delivery for Boost Members', value: 0 })).discountType, 'SERVICE');
});

test('reads quantity, usage limit, pickup-only, and grocery flags', () => {
  const c = parseCoupon(raw({ title: 'Save $1.00 on 4', shortDescription: 'SAVE $1.00 on 4 Progresso Soup', requirementQuantity: 4, redemptionsAllowed: -1, modalities: ['PICKUP', 'DELIVERY'] }));
  assert.equal(c.minQuantity, 4);
  assert.equal(c.usageLimit, null);
  assert.equal(c.pickupDeliveryOnly, true);
  assert.equal(c.grocery, true);
  assert.equal(parseCoupon(raw({ categories: ['Adult Beverage'] })).grocery, false);
  assert.equal(parseCoupon(raw({ title: 'Get 4x POINTS' })).grocery, false);
  // Signed out, clip state is unknown and must not read as clipped.
  assert.equal(parseCoupon(raw({ addedToCard: true })).clipped, false);
  assert.equal(parseCoupon(raw({ addedToCard: true }), { signedIn: true }).clipped, true);
});

test('coupon math never invents savings', () => {
  const amt = parseCoupon(raw({ title: 'Save $3.00 on 2', value: 3, requirementQuantity: 2 }));
  assert.deepEqual(applyCoupon(amt, 4.0), { each: 2.5, quantity: 2, savingsEach: 1.5 });
  const fixed = parseCoupon(raw({ title: '$2.49', value: 2.49 }));
  assert.equal(applyCoupon(fixed, 4.29).each, 2.49);
  assert.equal(applyCoupon(fixed, 1.99), null, 'a fixed price above the shelf price saves nothing');
  const lb = parseCoupon(raw({ title: '58¢/lb Kroger Frozen Turkey', value: 0.58 }));
  assert.equal(applyCoupon(lb, 20, { soldBy: 'UNIT' }), null, 'per-lb price cannot apply to a unit item');
  assert.equal(applyCoupon(parseCoupon(raw({ title: 'Get 4x POINTS', value: 2 })), 5), null);
  const pct = parseCoupon(raw({ title: 'Save 25%', value: 25 }));
  assert.equal(applyCoupon(pct, 4).each, 3);
  const bogo = parseCoupon(raw({ title: 'Buy 1, Get 1 Free', value: 0, requirementQuantity: 2 }));
  assert.deepEqual(applyCoupon(bogo, 3), { each: 1.5, quantity: 2, savingsEach: 1.5 });
  assert.equal(applyCoupon(amt, 1.0).each, 0, 'never below zero');
});

test('turns recipe wording into shelf searches', () => {
  assert.equal(queryVariants('2 cloves garlic, minced')[0], 'garlic');
  assert.equal(queryVariants('garlic clove')[0], 'garlic');
  assert.equal(queryVariants('1 lb boneless skinless chicken breasts')[0], 'boneless skinless chicken breast');
  assert.equal(queryVariants('3 large eggs')[0], 'eggs');
  assert.equal(queryVariants('scallions, sliced')[0], 'green onions');
  assert.ok(queryVariants('1 cup shredded sharp cheddar cheese').includes('cheddar cheese'));
});

test('coupon phrases and keywords', () => {
  assert.equal(productPhrase('Save $3.00 on 2 Colgate'), 'Colgate');
  assert.equal(productPhrase('$1.49 Kroger Large Eggs, Grade A'), 'Kroger Large Eggs, Grade A');
  assert.equal(productPhrase('$0.58 lb Kroger Frozen Turkey, Valid in Kroger Nashville Stores'), 'Kroger Frozen Turkey,');
  assert.deepEqual(couponKeywords({ brand: 'Kroger', description: '$1.49 Kroger Large Eggs, Grade A' }), ['large', 'egg', 'grade']);
});

test('matching: confident, possible, or no link', () => {
  const eggs = { brand: 'Kroger', description: '$1.49 Kroger Large Eggs, Grade A', categories: ['Dairy', 'Breakfast'] };
  assert.equal(scoreLink(eggs, { name: 'Kroger® Grade A Large Eggs', brand: 'Kroger', categories: ['Dairy'] })?.confidence, 'high');
  assert.equal(scoreLink(eggs, { name: 'Kroger® 2% Milk', brand: 'Kroger', categories: ['Dairy'] }), null, 'same brand, different product: no link');
  const brandWide = { brand: "Dolly Parton's", description: "Save $2.00 on Dolly Parton's", categories: ['Frozen'] };
  assert.equal(scoreLink(brandWide, { name: "Dolly Parton's Biscuits", brand: "Dolly Parton's", categories: ['Frozen'] })?.confidence, 'medium');
  const multi = { brand: 'Ruffles', description: '$2.99 Ruffles, Tostitos or Smartfood', categories: ['Snacks'] };
  assert.ok(scoreLink(multi, { name: 'Tostitos Scoops Tortilla Chips', brand: 'Tostitos', categories: ['Snacks'] }));
  const ps = { brand: 'Private Selection', description: '$3.99 PS Sliced Italian Meats', categories: ['Deli'] };
  assert.equal(scoreLink(ps, { name: 'Private Selection® Sliced Italian Dry Salame', brand: 'Private Selection', categories: ['Deli'] })?.confidence, 'high');
  assert.equal(scoreLink(eggs, { name: 'Eggland Best Large Eggs', brand: "Eggland's Best", categories: ['Dairy'] }), null, 'other brand: no link');
  assert.equal(scoreLink(eggs, { name: 'Kroger® Grade A Jumbo White Eggs', brand: 'Kroger', categories: ['Dairy'] })?.confidence, 'medium', 'different egg size is only possible');
});

const product = (over) => ({ upc: over.upc || 'u1', name: 'Thing', brand: 'B', size: '16 oz', soldBy: 'UNIT', categories: ['Dairy'], coupons: [], ...over });
const sp = (regular, promo = null, promoEnds = null) => ({ regular, promo, promoEnds, capturedAt: new Date() });

test('pricing: sale, high coupon stacks, medium coupon is not counted, expired sale ignored', () => {
  const sale = priceProduct(product({}), sp(4, 3, new Date(Date.now() + 86_400_000)));
  assert.deepEqual([sale.effectiveEach, sale.savingsEach, sale.onSale], [3, 1, true]);
  const expired = priceProduct(product({}), sp(4, 3, new Date(Date.now() - 1000)));
  assert.deepEqual([expired.effectiveEach, expired.onSale, expired.isDeal], [4, false, false]);

  const coupon = parseCoupon(raw({ id: 'c1', title: 'Save $1.00', value: 1 }));
  const withHigh = priceProduct(product({ coupons: [{ confidence: 'high', coupon: { ...coupon, status: 'active' } }] }), sp(4, 3));
  assert.equal(withHigh.effectiveEach, 2, 'coupon applies on top of the sale price');
  assert.equal(withHigh.coupon.needsClip, true);
  const withMedium = priceProduct(product({ coupons: [{ confidence: 'medium', coupon: { ...coupon, status: 'active' } }] }), sp(4));
  assert.equal(withMedium.effectiveEach, 4);
  assert.equal(withMedium.possibleCoupon.id, 'c1');
  assert.equal(withMedium.isDeal, false);
});

test('bundles stay under budget, put wanted items first, and list coupons to clip', () => {
  const coupon = { ...parseCoupon(raw({ id: 'c9', title: 'Save $1.00', value: 1 })), status: 'active' };
  const mk = (i, cat, regular, promo, withCoupon = false) => priceProduct(
    product({ upc: `p${i}`, name: `${cat} item number${i} unique${i}`, categories: [cat], coupons: withCoupon ? [{ confidence: 'high', coupon }] : [] }),
    sp(regular, promo),
  );
  const deals = [
    mk(1, 'Produce', 3, 2), mk(2, 'Produce', 4, 3), mk(3, 'Meat & Seafood', 10, 7), mk(4, 'Dairy', 4, 3, true),
    mk(5, 'Canned & Packaged', 2, 1.5), mk(6, 'Frozen', 6, 4), mk(7, 'Bakery', 3, 2.5), mk(8, 'Pasta', 2, 1),
  ];
  const wantedBest = mk(99, 'Dairy', 3.49, null);
  const bundles = buildBundles(deals, { budget: 20, people: 2, wanted: [{ ingredient: 'milk', best: wantedBest }] });
  assert.ok(bundles.length >= 1);
  for (const b of bundles) {
    assert.ok(b.total <= 20 + 1e-9, `${b.name} total ${b.total} is within budget`);
    assert.equal(b.items[0].wantedFor, 'milk', 'wanted item comes first');
    assert.equal(new Set(b.items.map((l) => l.upc)).size, b.items.length, 'no duplicates');
  }
  const balanced = bundles.find((b) => b.key === 'balanced');
  assert.ok(balanced.items.some((l) => l.group === 'produce') && balanced.items.some((l) => l.group === 'protein'));
  const withClip = bundles.find((b) => b.items.some((l) => l.upc === 'p4'));
  if (withClip) assert.ok(withClip.clipList.some((c) => c.couponId === 'c9'));
});

test('size parsing and grouping', () => {
  assert.deepEqual(parseSize('1/2 gal'), { base: 64, unit: 'fl oz' });
  assert.equal(parseSize('8 ct / 30.4 ounce').unit, 'oz');
  assert.equal(groupFor(['Natural & Organic', 'Dairy']), 'dairy');
  assert.equal(groupFor(['Meat & Seafood', 'Frozen']), 'protein');
  assert.equal(groupFor(['Personal Care']), 'other');
  assert.equal(isFood(['Health', 'Natural & Organic']), false, 'vitamins are not groceries');
  assert.equal(isFood(['Natural & Organic', 'Dairy']), true);
});

test('regressions from the first live run', () => {
  // "frozen" alone must not link a frozen turkey deal to frozen broccoli.
  const turkey = { brand: 'Kroger', description: '$0.58 lb Kroger Frozen Turkey, Valid in Kroger Nashville Stores in TN, KY, AL', categories: ['Meat & Seafood', 'Frozen'] };
  assert.equal(scoreLink(turkey, { name: 'Kroger® Frozen Broccoli Florets', brand: 'Kroger', categories: ['Frozen'] }), null);
  assert.equal(scoreLink(turkey, { name: 'Kroger® Frozen Whole Turkey', brand: 'Kroger', categories: ['Meat & Seafood'] })?.confidence, 'high');
  // Coupon says Mayonnaise, the shelf says Mayo.
  const mayo = { brand: "Hellmann's", description: "$4.49 Hellmann's Mayonnaise", categories: ['Condiment & Sauces'] };
  assert.equal(scoreLink(mayo, { name: "Hellmann's Real Mayo", brand: "Hellmann's", categories: ['Condiment & Sauces'] })?.confidence, 'high');
  // "$4.99 Kroger Cheese" must not price a $13.99 4 lb bag at $4.99.
  const cheese = { ...parseCoupon(raw({ id: 'ch', title: '$4.99', shortDescription: '$4.99 Kroger Cheese', value: 4.99 })), status: 'active' };
  const big = priceProduct(product({ upc: 'big', coupons: [{ confidence: 'high', coupon: cheese }] }), sp(13.99, 13.49));
  assert.equal(big.effectiveEach, 13.49, 'only the sale price counts');
  assert.equal(big.coupon, null);
  assert.equal(big.possibleCoupon?.sizeUncertain, true);
  const family = priceProduct(product({ upc: 'fam', coupons: [{ confidence: 'high', coupon: cheese }] }), sp(7.29));
  assert.equal(family.effectiveEach, 4.99);
});

test('a one-size deal price is not applied to bigger packs', () => {
  const eggs = { ...parseCoupon(raw({ id: 'eg', title: '$1.49', shortDescription: '$1.49 Kroger Large Eggs, Grade A', value: 1.49 })), status: 'active', sizeRefPrice: 1.79 };
  const dozen = priceProduct(product({ upc: 'e12', coupons: [{ confidence: 'high', coupon: eggs }] }), sp(1.79));
  assert.equal(dozen.effectiveEach, 1.49);
  const eighteen = priceProduct(product({ upc: 'e18', coupons: [{ confidence: 'high', coupon: eggs }] }), sp(2.65));
  assert.equal(eighteen.effectiveEach, 2.65);
  assert.equal(eighteen.possibleCoupon?.sizeUncertain, true);
  assert.equal(queryVariants('shredded cheddar cheese')[0], 'shredded cheddar cheese');
});

test('a specific product name must match, a generic noun is not enough', () => {
  const chex = { brand: 'General Mills', description: '$1.79 General Mills Chex Cereal', categories: ['Breakfast'] };
  assert.equal(scoreLink(chex, { name: 'General Mills Cheerios Cereal', brand: 'General Mills', categories: ['Breakfast'] }), null);
  assert.equal(scoreLink(chex, { name: 'General Mills Rice Chex Cereal', brand: 'General Mills', categories: ['Breakfast'] })?.confidence, 'high');
  const gm = { brand: 'General Mills', description: 'SAVE $1.00 on 2 General Mills Cereals', categories: ['Breakfast'] };
  assert.equal(scoreLink(gm, { name: 'General Mills Cheerios Cereal', brand: 'General Mills', categories: ['Breakfast'] })?.confidence, 'high');
});
