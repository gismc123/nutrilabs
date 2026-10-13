import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeEqual, hashToken, safeHttpUrl, normalizeEmail, rateLimit } from '../src/lib/security.js';
import { canEditRecipe, visibleRecipes } from '../src/lib/access.js';

test('safeEqual compares secrets without leaking length or type mismatches', () => {
  assert.equal(safeEqual('a'.repeat(64), 'a'.repeat(64)), true);
  assert.equal(safeEqual('a'.repeat(64), 'b'.repeat(64)), false);
  assert.equal(safeEqual('short', 'a much longer secret'), false);
  assert.equal(safeEqual(undefined, 'secret'), false);
  assert.equal(safeEqual(['secret'], 'secret'), false);
});

test('reset tokens are stored as a stable SHA-256 hash', () => {
  assert.equal(hashToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.notEqual(hashToken('abc'), 'abc');
});

test('only http(s) URLs survive safeHttpUrl', () => {
  assert.equal(safeHttpUrl('https://www.youtube.com/watch?v=1'), 'https://www.youtube.com/watch?v=1');
  assert.equal(safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpUrl('JaVaScRiPt:alert(1)'), null);
  assert.equal(safeHttpUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(safeHttpUrl('not a url'), null);
  assert.equal(safeHttpUrl(''), null);
});

test('emails are compared case-insensitively', () => {
  assert.equal(normalizeEmail('  Gerardo@Example.COM '), 'gerardo@example.com');
});

function fakeRes() {
  return {
    statusCode: 200, headers: {}, body: null,
    set(h) { Object.assign(this.headers, typeof h === 'string' ? { [h]: arguments[1] } : h); return this; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test('rateLimit blocks after max requests per key and reports Retry-After', () => {
  const limiter = rateLimit({ windowMs: 60_000, max: 2 });
  const run = (ip) => {
    const res = fakeRes();
    let passed = false;
    limiter({ ip }, res, () => { passed = true; });
    return { passed, res };
  };
  assert.equal(run('1.1.1.1').passed, true);
  assert.equal(run('1.1.1.1').passed, true);
  const third = run('1.1.1.1');
  assert.equal(third.passed, false);
  assert.equal(third.res.statusCode, 429);
  assert.ok(Number(third.res.headers['Retry-After']) > 0);
  assert.equal(run('2.2.2.2').passed, true, 'other clients are unaffected');
});

test('recipes: owners edit their own, admins edit shared, nobody edits others', () => {
  const alice = { userId: 1, isAdmin: false };
  const admin = { userId: 9, isAdmin: true };
  assert.equal(canEditRecipe(alice, { userId: 1 }), true);
  assert.equal(canEditRecipe(alice, { userId: 2 }), false);
  assert.equal(canEditRecipe(alice, { userId: null }), false);
  assert.equal(canEditRecipe(admin, { userId: null }), true);
  assert.equal(canEditRecipe(admin, { userId: 2 }), false, 'admins do not get other users\' private recipes');
  assert.deepEqual(visibleRecipes(alice), { OR: [{ userId: null }, { userId: 1 }] });
});
