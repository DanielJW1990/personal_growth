import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFill } from '../src/fills-parse.js';

test('parses "filled 3.4 shares @ 142.10 DKK" as confirmed', () => {
  const f = parseFill('filled 3.4 shares @ 142.10 DKK');
  assert.equal(f.shares, 3.4);
  assert.equal(f.price_dkk, 142.1);
  assert.equal(f.est_or_confirmed, 'confirmed');
  assert.equal(f.atMarket, false);
});

test('parses "filled at market" as estimated with no price', () => {
  const f = parseFill('filled at market');
  assert.equal(f.atMarket, true);
  assert.equal(f.price_dkk, null);
  assert.equal(f.est_or_confirmed, 'estimated');
});

test('tolerates Danish decimal comma and a fee', () => {
  const f = parseFill('bought 2 @ 99,5 kr fee 29');
  assert.equal(f.shares, 2);
  assert.equal(f.price_dkk, 99.5);
  assert.equal(f.fee_dkk, 29);
});

test('falls back to first number as shares', () => {
  const f = parseFill('filled 5 @ 200');
  assert.equal(f.shares, 5);
  assert.equal(f.price_dkk, 200);
});

test('returns null for non-fill text', () => {
  assert.equal(parseFill('what is the weather'), null);
  assert.equal(parseFill(''), null);
});
