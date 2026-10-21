import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  derivePositions,
  computeCash,
  computePortfolio,
  sinceInceptionReturn,
  benchmarkReturn,
  periodReturn,
  maxDrawdown,
  cagr,
  turnover,
  hitRate,
  buildReport,
  timeWeightedReturn,
} from '../src/bookkeeper.js';

function approx(a, b, eps = 1e-6) {
  assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
}

test('derivePositions: average cost, realized P/L, and closing', () => {
  const fills = [
    { date: '2026-01-01', action: 'buy', instrument: 'Novo', ticker: 'NOVO-B.CO', shares: 10, price_dkk: 100, fee_dkk: 0 },
    { date: '2026-01-10', action: 'add', instrument: 'Novo', ticker: 'NOVO-B.CO', shares: 10, price_dkk: 120, fee_dkk: 0 },
    // avg cost now 110 over 20 shares
    { date: '2026-02-01', action: 'sell', instrument: 'Novo', ticker: 'NOVO-B.CO', shares: 5, price_dkk: 130, fee_dkk: 0 },
  ];
  const { open, realizedPlDkk } = derivePositions(fills);
  assert.equal(open.length, 1);
  approx(open[0].shares, 15);
  approx(open[0].avgCostDkk, 110); // unchanged by a partial sale
  approx(realizedPlDkk, (130 - 110) * 5); // 100
});

test('derivePositions: fully closed position is profitable', () => {
  const fills = [
    { date: '2026-01-01', action: 'buy', instrument: 'X', ticker: 'X', shares: 4, price_dkk: 50, fee_dkk: 0 },
    { date: '2026-03-01', action: 'sell', instrument: 'X', ticker: 'X', shares: 4, price_dkk: 60, fee_dkk: 0 },
  ];
  const { open, closed, realizedPlDkk } = derivePositions(fills);
  assert.equal(open.length, 0);
  assert.equal(closed.length, 1);
  assert.ok(closed[0].closed);
  approx(realizedPlDkk, 40);
});

test('computeCash: deposit minus buys plus sells, fees both ways', () => {
  const fills = [
    { action: 'buy', shares: 10, price_dkk: 100, fee_dkk: 29 }, // -1029
    { action: 'sell', shares: 5, price_dkk: 130, fee_dkk: 19 }, // +631
  ];
  approx(computeCash(20000, fills), 20000 - 1029 + 631);
});

test('computePortfolio: market value, weights, total, missing prices', () => {
  const led = {
    inception: { deposit_dkk: 20000 },
    fills: [
      { action: 'buy', instrument: 'A', ticker: 'A', shares: 10, price_dkk: 100, fee_dkk: 0 },
      { action: 'buy', instrument: 'B', ticker: 'B', shares: 10, price_dkk: 100, fee_dkk: 0 },
    ],
  };
  // A up to 120, B has no price.
  const pf = computePortfolio(led, { A: 120 });
  approx(pf.cashDkk, 20000 - 1000 - 1000); // 18000
  const a = pf.positions.find((p) => p.ticker === 'A');
  approx(a.marketValueDkk, 1200);
  approx(a.unrealizedPlDkk, 200);
  approx(pf.totalValueDkk, 18000 + 1200); // B excluded
  assert.deepEqual(pf.missingPrices, ['B']);
});

test('sinceInceptionReturn and benchmarkReturn', () => {
  approx(sinceInceptionReturn(20740, 20000), 0.037, 1e-9);
  approx(benchmarkReturn(102.9, 100), 0.029, 1e-9);
  assert.equal(benchmarkReturn(100, null), null);
});

test('periodReturn uses the last snapshot of the matching kind', () => {
  const snaps = [
    { date: '2026-01-01', total_value_dkk: 20000, kind: 'pulse' },
    { date: '2026-01-08', total_value_dkk: 20200, kind: 'pulse' },
  ];
  approx(periodReturn(20402, snaps, 'pulse'), 20402 / 20200 - 1, 1e-9);
  assert.equal(periodReturn(20402, [], 'pulse'), null);
});

test('maxDrawdown: peak-to-trough across snapshots + current', () => {
  const snaps = [
    { total_value_dkk: 20000 },
    { total_value_dkk: 22000 }, // peak
    { total_value_dkk: 19800 }, // -10% from peak
  ];
  approx(maxDrawdown(snaps, 21000), 19800 / 22000 - 1, 1e-9);
  approx(maxDrawdown([{ total_value_dkk: 100 }], 110), 0); // only ever up
});

test('cagr: null before 3 months, sane after', () => {
  assert.equal(cagr(0.05, '2026-06-01', '2026-06-20'), null); // ~3 weeks
  const c = cagr(0.1, '2025-06-24', '2026-06-24'); // ~1 year, +10%
  approx(c, 0.1, 1e-3);
});

test('turnover and hitRate', () => {
  const fills = [
    { action: 'buy', shares: 10, price_dkk: 100 },
    { action: 'sell', shares: 10, price_dkk: 110 },
  ];
  const t = turnover(fills, 20000);
  assert.equal(t.trades, 2);
  approx(t.tradedNotionalDkk, 1000 + 1100);
  approx(t.pctOfPortfolio, ((1000 + 1100) / 20000) * 100);

  const hr = hitRate([
    { closed: true, realizedPlDkk: 40 },
    { closed: true, realizedPlDkk: -10 },
    { closed: false, realizedPlDkk: 0 },
  ]);
  assert.equal(hr.closed, 2);
  assert.equal(hr.profitable, 1);
  approx(hr.pct, 50);
});

test('buildReport: ties it together with both benchmark deltas', () => {
  const led = {
    inception: { date: '2026-01-01', deposit_dkk: 20000, benchmark_levels: { msci_world: 100, sp500: 100 } },
    fills: [{ action: 'buy', instrument: 'A', ticker: 'A', shares: 100, price_dkk: 100, fee_dkk: 0 }],
    snapshots: [],
  };
  // A now 110 → positions 11000, cash 10000, total 21000 → +5% since start.
  const report = buildReport({
    led,
    prices: { A: 110 },
    benchLevels: { msci_world: 102.9, sp500: 103.4 },
    now: '2026-04-01',
  });
  approx(report.totalValueDkk, 21000);
  approx(report.sinceReturn, 0.05, 1e-9);
  // world +2.9% → ahead by ~2.1pts; sp500 +3.4% → ahead by ~1.6pts
  approx(report.benchmarks.msci_world.deltaVsPortfolio, 0.05 - 0.029, 1e-9);
  approx(report.benchmarks.sp500.deltaVsPortfolio, 0.05 - 0.034, 1e-9);
});

test('dividends: add to cash net of withholding, tracked per position, no share change', () => {
  const fills = [
    { date: '2026-01-01', action: 'buy', instrument: 'Novo', ticker: 'NOVO-B.CO', shares: 10, price_dkk: 100, fee_dkk: 0 },
    { date: '2026-03-15', action: 'dividend', instrument: 'Novo', ticker: 'NOVO-B.CO', amount_dkk: 50, fee_dkk: 13.5 },
  ];
  const { open, dividendsDkk } = derivePositions(fills);
  assert.equal(open.length, 1);
  approx(open[0].shares, 10); // unchanged
  approx(dividendsDkk, 36.5); // 50 − 13.5 withholding
  approx(computeCash(20000, fills), 20000 - 1000 + 36.5);
});

test('buildReport exposes dividendsDkk', () => {
  const led = {
    inception: { date: '2026-01-01', deposit_dkk: 20000, benchmark_levels: { msci_world: 100, sp500: 100 } },
    fills: [
      { action: 'buy', instrument: 'A', ticker: 'A', shares: 10, price_dkk: 100, fee_dkk: 0 },
      { action: 'dividend', instrument: 'A', ticker: 'A', amount_dkk: 25, fee_dkk: 0 },
    ],
    snapshots: [],
  };
  const report = buildReport({ led, prices: { A: 100 }, benchLevels: { msci_world: 101, sp500: 101 }, now: '2026-04-01' });
  approx(report.dividendsDkk, 25);
  approx(report.cashDkk, 20000 - 1000 + 25);
});

test('TWR: a deposit raises the balance but is not a gain', () => {
  // 20,000 grows to 22,000 (+10%), then 20,000 is added, then 42,000 -> 44,100.
  const r = timeWeightedReturn({
    startBase: 20000,
    endValue: 44100,
    flows: [{ date: '2026-10-21', amount_dkk: 20000, value_before_dkk: 22000 }],
  });
  approx(r, 1.1 * 1.05 - 1, 1e-9); // +15.5%, NOT the +120.5% the balance implies
});

test('TWR: with no cash flows it equals the plain ratio', () => {
  approx(timeWeightedReturn({ startBase: 20000, endValue: 22000 }), 0.1, 1e-9);
  approx(sinceInceptionReturn(22000, 20000), 0.1, 1e-9);
  approx(sinceInceptionReturn(22000, 20000, []), 0.1, 1e-9);
});

test('TWR: a deposit on a flat portfolio still returns 0%', () => {
  const r = timeWeightedReturn({
    startBase: 20000,
    endValue: 40000,
    flows: [{ amount_dkk: 20000, value_before_dkk: 20000 }],
  });
  approx(r, 0, 1e-9);
});

test('TWR: chains several deposits and a withdrawal', () => {
  const r = timeWeightedReturn({
    startBase: 10000,
    endValue: 26400,
    flows: [
      { amount_dkk: 10000, value_before_dkk: 11000 }, // +10%, base -> 21000
      { amount_dkk: -5000, value_before_dkk: 22050 }, // +5%,  base -> 17050
    ],
  });
  approx(r, 1.1 * 1.05 * (26400 / 17050) - 1, 1e-9);
});

test('TWR: guards missing data instead of inventing a return', () => {
  assert.equal(timeWeightedReturn({ startBase: 0, endValue: 100 }), null);
  assert.equal(timeWeightedReturn({ startBase: 100, endValue: NaN }), null);
  assert.equal(
    timeWeightedReturn({ startBase: 100, endValue: 200, flows: [{ amount_dkk: 50 }] }),
    null, // value_before missing
  );
});

test('computeCash includes later deposits', () => {
  const fills = [{ action: 'buy', shares: 10, price_dkk: 100, fee_dkk: 0 }];
  approx(computeCash(20000, fills, [{ amount_dkk: 20000, value_before_dkk: 19000 }]), 39000);
  approx(computeCash(20000, fills), 19000); // unchanged without flows
});

test('periodReturn chains out a deposit made during the week', () => {
  const snaps = [{ date: '2026-10-18', total_value_dkk: 22000, kind: 'pulse' }];
  const flows = [{ date: '2026-10-21', amount_dkk: 20000, value_before_dkk: 22000 }];
  // Deposit, then flat: the week is 0%, not +91%.
  approx(periodReturn(42000, snaps, 'pulse', flows), 0, 1e-9);
  // A flow before the snapshot is already reflected in it and must be ignored.
  const older = [{ date: '2026-10-01', amount_dkk: 20000, value_before_dkk: 10000 }];
  approx(periodReturn(23100, snaps, 'pulse', older), 23100 / 22000 - 1, 1e-9);
});

test('buildReport: deposits never inflate the reported return', () => {
  const led = {
    inception: { date: '2026-01-01', deposit_dkk: 20000, benchmark_levels: { msci_world: 100, sp500: 100 } },
    // 10,000 into A, 10,000 left in cash; A then rises 100 -> 120, so the book
    // was worth 22,000 the moment the 20,000 top-up landed.
    fills: [{ action: 'buy', instrument: 'A', ticker: 'A', shares: 100, price_dkk: 100, fee_dkk: 0 }],
    cash_flows: [{ date: '2026-06-01', amount_dkk: 20000, value_before_dkk: 22000 }],
    snapshots: [],
  };
  const report = buildReport({ led, prices: { A: 120 }, benchLevels: { msci_world: 100, sp500: 100 }, now: '2026-07-01' });
  approx(report.cashDkk, 30000); // 20,000 − 10,000 + 20,000
  approx(report.totalValueDkk, 42000); // 30,000 cash + 12,000 position
  approx(report.contributedDkk, 40000);
  approx(report.sinceReturnDkk, 2000); // real gain, measured against money in
  approx(report.sinceReturn, 0.1, 1e-9); // +10%, not the +110% the balance implies
  // And the benchmark comparison stays honest.
  approx(report.benchmarks.msci_world.deltaVsPortfolio, 0.1, 1e-9);
});
