import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtDkk, fmtPct, fmtNum, holdingsTable, formatWeeklyPulse, formatMonthlyReport } from '../src/report.js';
import { buildReport } from '../src/bookkeeper.js';

test('fmtDkk, fmtNum and fmtPct', () => {
  assert.equal(fmtDkk(20740), '20,740 DKK');
  assert.equal(fmtDkk(-1234.6), '−1,235 DKK');
  assert.equal(fmtDkk(null), '—');
  assert.equal(fmtNum(20313), '20,313');
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

test('holdingsTable lists every position + cash with P/L', () => {
  const t = holdingsTable(sampleReport());
  assert.match(t, /Holding/);
  assert.match(t, /Novo/);
  assert.match(t, /ASML/);
  assert.match(t, /Cash/);
  assert.match(t, /\+6\.0%/); // Novo gain
  assert.match(t, /−2\.4%/); // ASML loss
});

test('weekly pulse: headline, benchmarks, and a <pre> holdings table', () => {
  const out = formatWeeklyPulse(sampleReport());
  assert.match(out, /📊 Week \d+ pulse —/);
  assert.match(out, /Portfolio:/);
  assert.match(out, /MSCI World:/);
  assert.match(out, /<pre>/);
  assert.match(out, /<\/pre>/);
  assert.match(out, /Novo/);
  assert.match(out, /unrealized/);
  // S&P label is HTML-escaped for parse_mode HTML.
  assert.match(out, /S&amp;P/);
});

test('monthly report: scoreboard, verdict, and allocation table', () => {
  const out = formatMonthlyReport(sampleReport());
  assert.match(out, /Benchmark deltas \(the scoreboard\):/);
  assert.match(out, /Verdict:/);
  assert.match(out, /within noise/);
  assert.match(out, /Allocation:/);
  assert.match(out, /<pre>/);
});

test('verdict flags split decision when ahead of one index and behind the other', () => {
  const led = {
    inception: { date: '2026-01-01', deposit_dkk: 20000, benchmark_levels: { msci_world: 100, sp500: 100 } },
    fills: [{ action: 'buy', instrument: 'A', ticker: 'A', shares: 100, price_dkk: 100, fee_dkk: 0 }],
    snapshots: [],
  };
  const report = buildReport({
    led,
    prices: { A: 106 }, // 10600 + 10000 cash = 20600 → +3%
    benchLevels: { msci_world: 102, sp500: 104 },
    now: '2026-04-01',
  });
  const out = formatMonthlyReport(report);
  assert.match(out, /Beating one benchmark but not the other/);
});
