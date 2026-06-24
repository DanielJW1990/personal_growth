// REPORTING — pure formatting. Takes the bookkeeper's report model and renders
// the weekly pulse and the monthly full report (section 4). No numbers are
// computed here beyond trivial display rounding; the bookkeeper owns the math.

import { primaryBenchmark, secondaryBenchmark, BENCHMARKS } from './config.js';
import { keyOf, yearsBetween } from './bookkeeper.js';

export function fmtDkk(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '−' : '';
  const s = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${s} DKK`;
}

export function fmtPct(x, digits = 1) {
  if (x == null || !Number.isFinite(x)) return '—';
  const pct = x * 100;
  const sign = pct >= 0 ? '+' : '−';
  return `${sign}${Math.abs(pct).toFixed(digits)}%`;
}

function ahead(delta) {
  if (delta == null) return '—';
  return delta >= 0 ? '✅' : '❌';
}

function weekNumber(report) {
  if (!report.inceptionDate) return 1;
  return Math.floor(yearsBetween(report.inceptionDate, report.date) * 52.143) + 1;
}

function bestWorst(positions) {
  const withPl = positions
    .filter((p) => p.unrealizedPlDkk != null && p.costBasisDkk > 0)
    .map((p) => ({ label: keyOf(p), pct: p.unrealizedPlDkk / p.costBasisDkk }));
  if (!withPl.length) return null;
  withPl.sort((a, b) => b.pct - a.pct);
  return { best: withPl[0], worst: withPl[withPl.length - 1] };
}

/** Weekly pulse (short) — section 4. */
export function formatWeeklyPulse(report) {
  const prim = primaryBenchmark();
  const sec = secondaryBenchmark();
  const lines = [];
  lines.push(`📊 Week ${weekNumber(report)} pulse — ${report.date}`);
  lines.push(`Portfolio: ${fmtDkk(report.totalValueDkk)}  (${fmtPct(report.sinceReturn)} since start)`);
  lines.push(`This week: ${report.weekReturn == null ? '— (first pulse)' : fmtPct(report.weekReturn)}`);

  for (const b of [prim, sec]) {
    const m = report.benchmarks[b.key];
    lines.push(
      `${b.label} since start: ${fmtPct(m.sinceReturn)}   → you: ${fmtPct(m.deltaVsPortfolio)} vs ${shortName(b)} ${ahead(m.deltaVsPortfolio)}`,
    );
  }

  lines.push(`Cash: ${fmtDkk(report.cashDkk)} (${report.cashPct.toFixed(1)}%)`);

  const bw = bestWorst(report.positions);
  if (bw) {
    lines.push(`Best: ${bw.best.label} ${fmtPct(bw.best.pct)} · Worst: ${bw.worst.label} ${fmtPct(bw.worst.pct)}`);
  }
  if (report.missingPrices.length) {
    lines.push(`⚠️ No price for: ${report.missingPrices.join(', ')} (excluded from value)`);
  }
  return lines.join('\n');
}

function shortName(b) {
  return b.key === BENCHMARKS.sp500.key ? 'S&P' : 'world';
}

/** Monthly full report — section 4. */
export function formatMonthlyReport(report) {
  const prim = primaryBenchmark();
  const sec = secondaryBenchmark();
  const L = [];
  L.push(`🗓️ Monthly report — ${report.date}`);
  L.push('');
  L.push(`Total value: ${fmtDkk(report.totalValueDkk)}`);
  L.push(`Since inception: ${fmtPct(report.sinceReturn)} (${fmtDkk(report.sinceReturnDkk)})`);
  L.push(`This month: ${report.monthReturn == null ? '— (first monthly)' : fmtPct(report.monthReturn)}`);
  L.push('');
  L.push('Benchmark deltas (the scoreboard):');
  for (const b of [prim, sec]) {
    const m = report.benchmarks[b.key];
    L.push(`  ${b.label}: ${fmtPct(m.sinceReturn)} → you ${fmtPct(m.deltaVsPortfolio)} ${ahead(m.deltaVsPortfolio)}`);
  }
  // Flag the split-decision case explicitly rather than spinning it.
  const pd = report.benchmarks[prim.key].deltaVsPortfolio;
  const sd = report.benchmarks[sec.key].deltaVsPortfolio;
  if (pd != null && sd != null && Math.sign(pd) !== Math.sign(sd)) {
    L.push('  ⚖️ Beating one benchmark but not the other — flagged, not spun.');
  }
  L.push('');
  L.push(`Annualized (CAGR): ${report.cagr == null ? '— (need ≥3 months)' : fmtPct(report.cagr)}`);
  L.push(`Realized P/L: ${fmtDkk(report.realizedPlDkk)} · Unrealized P/L: ${fmtDkk(report.unrealizedPlDkk)}`);
  L.push(`Max drawdown since inception: ${fmtPct(report.maxDrawdown)}`);
  const t = report.turnover;
  const churn = t.pctOfPortfolio > 100 ? '  ⚠️ high turnover' : '';
  L.push(`Turnover: ${t.trades} trades, ${t.pctOfPortfolio.toFixed(0)}% of portfolio${churn}`);
  L.push(
    `Hit rate (closed positions): ${report.hitRate.pct == null ? '— (none closed yet)' : `${report.hitRate.pct.toFixed(0)}% (${report.hitRate.profitable}/${report.hitRate.closed})`}`,
  );
  L.push('');
  L.push('Allocation:');
  for (const p of report.positions) {
    const w = p.weightPct == null ? '—' : `${p.weightPct.toFixed(1)}%`;
    const pl = p.unrealizedPlDkk == null ? '—' : fmtPct(p.unrealizedPlDkk / p.costBasisDkk);
    L.push(`  ${keyOf(p)}: ${w} · ${fmtDkk(p.marketValueDkk)} · ${pl}`);
  }
  L.push(`  Cash: ${report.cashPct.toFixed(1)}% · ${fmtDkk(report.cashDkk)}`);
  L.push('');
  L.push(verdictLine(report, prim));
  return L.join('\n');
}

/** One honest verdict line, with the noise caveat until ~12 months. */
export function verdictLine(report, prim) {
  const m = report.benchmarks[prim.key];
  const months = report.monthsOfHistory;
  const monthsTxt = months >= 1 ? `${months.toFixed(0)} month${months >= 2 ? 's' : ''}` : 'under a month';
  if (m.deltaVsPortfolio == null) {
    return `Verdict: not enough data yet (${monthsTxt} in).`;
  }
  const dir = m.deltaVsPortfolio >= 0 ? 'Ahead of' : 'Behind';
  const mag = `${(Math.abs(m.deltaVsPortfolio) * 100).toFixed(1)}%`;
  const caveat =
    months < 12
      ? ' — within noise; too early to conclude anything.'
      : ' — past the 12-month mark, so this starts to mean something.';
  return `Verdict: ${dir} ${prim.label} by ${mag} since inception over ${monthsTxt}${caveat}`;
}
