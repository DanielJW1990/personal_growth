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

test('parses "Sold 8,032 novo shares for 2677,60 dkk" (total-based, Danish commas)', () => {
  const f = parseFill('Sold 8,032 novo shares for 2677,60 dkk');
  assert.equal(f.shares, 8.032);
  assert.ok(Math.abs(f.price_dkk - 2677.6 / 8.032) < 1e-9);
  assert.equal(f.est_or_confirmed, 'confirmed');
});

test('parses "Bought 2,611 novartis shares for 2630 dkk at stockprice 153,67$" — USD price ignored, DKK total used', () => {
  const f = parseFill('Bought 2,611 novartis shares for 2630 dkk at stockprice 153,67$');
  assert.equal(f.shares, 2.611);
  assert.ok(Math.abs(f.price_dkk - 2630 / 2.611) < 1e-9);
});

test('explicit @price still wins over a total', () => {
  const f = parseFill('filled 2 shares @ 140 dkk for 300 dkk');
  assert.equal(f.price_dkk, 140);
});
