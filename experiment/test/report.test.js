import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtDkk, fmtPct, formatWeeklyPulse, formatMonthlyReport } from '../src/report.js';
import { buildReport } from '../src/bookkeeper.js';

test('fmtDkk and fmtPct', () => {
  assert.equal(fmtDkk(20740), '20,740 DKK');
  assert.equal(fmtDkk(-1234.6), '−1,235 DKK');
  assert.equal(fmtDkk(null), '—');
  assert.equal(fmtPct(0.037), '+3.7%');
  assert.equal(fmtPct(-0.024), '−2.4%');
  assert.equal(fmtPct(null), '—');
});

function sampleReport() {
  const led = {
    inception: { date: '2026-01-01', deposit_dkk: 20000, benchmark_levels: { msci_world: 100, sp500: 100 } },
    fills: [
      { action: 'buy', instrument: 'Novo', ticker: 'NOVO-B.CO', shares: 20, price_dkk: 100, fee_dkk: 0 },
      { action: 'buy', instrument: 'ASML', ticker: 'ASML.AS', shares: 2, price_dkk: 1000, fee_dkk: 0 },
    ],
    snapshots: [{ date: '2026-03-25', total_value_dkk: 20500, kind: 'pulse' }],
  };
  return buildReport({
    led,
    prices: { 'NOVO-B.CO': 106, 'ASML.AS': 976 }, // Novo +6%, ASML -2.4%
    benchLevels: { msci_world: 102.9, sp500: 103.4 },
    now: '2026-04-01',
  });
}

test('weekly pulse contains the headline lines and best/worst', () => {
  const out = formatWeeklyPulse(sampleReport());
  assert.match(out, /pulse —/);
  assert.match(out, /Portfolio:/);
  assert.match(out, /MSCI World since start:/);
  assert.match(out, /S&P 500 since start:/);
  assert.match(out, /Best: NOVO-B\.CO/);
  assert.match(out, /Worst: ASML\.AS/);
});

test('monthly report includes scoreboard, verdict, and allocation', () => {
  const out = formatMonthlyReport(sampleReport());
  assert.match(out, /Benchmark deltas \(the scoreboard\):/);
  assert.match(out, /Verdict:/);
  assert.match(out, /within noise/); // < 12 months → noise caveat
  assert.match(out, /Allocation:/);
  assert.match(out, /Cash:/);
});

test('verdict flags split decision when ahead of one index and behind the other', () => {
  const led = {
    inception: { date: '2026-01-01', deposit_dkk: 20000, benchmark_levels: { msci_world: 100, sp500: 100 } },
    fills: [{ action: 'buy', instrument: 'A', ticker: 'A', shares: 100, price_dkk: 100, fee_dkk: 0 }],
    snapshots: [],
  };
  // Portfolio +3%: ahead of world (+2%), behind sp500 (+4%).
  const report = buildReport({
    led,
    prices: { A: 106 }, // 10600 + 10000 cash = 20600 → +3%
    benchLevels: { msci_world: 102, sp500: 104 },
    now: '2026-04-01',
  });
  const out = formatMonthlyReport(report);
  assert.match(out, /Beating one benchmark but not the other/);
});
