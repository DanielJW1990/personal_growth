// REPORTING — pure formatting. Takes the bookkeeper's report model and renders
// the weekly pulse and monthly report (section 4) as Telegram-HTML, with an
// aligned monospace holdings table so every position's gain/loss is visible.
// No numbers are computed here beyond display rounding; the bookkeeper owns the
// math.

import { primaryBenchmark, secondaryBenchmark, BENCHMARKS } from './config.js';
import { keyOf, yearsBetween } from './bookkeeper.js';

// Pulses/reports are sent with parse_mode: 'HTML' so the <pre> table renders
// monospace. Anything outside <pre> must have &, <, > escaped.
export const PARSE_MODE = 'HTML';

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Plain grouped number, no currency suffix, − for negatives. */
export function fmtNum(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const r = Math.round(n);
  const sign = r < 0 ? '−' : '';
  return sign + Math.abs(r).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function fmtDkk(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${fmtNum(n)} DKK`;
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

function shortName(b) {
  return b.key === BENCHMARKS.sp500.key ? 'S&P' : 'world';
}

function clip(name, n) {
  return name.length > n ? name.slice(0, n - 1) + '…' : name;
}

/**
 * Aligned monospace holdings table (for inside a <pre> block): every position
 * with current value, weight, and P/L (% and DKK), plus a cash row.
 */
export function holdingsTable(report) {
  const W = { name: 12, val: 7, wt: 6, pl: 7, pld: 7 };
  const pad = (s, w) => String(s).padStart(w);
  const row = (name, val, wt, pl, pld) =>
    clip(name, W.name).padEnd(W.name) + pad(val, W.val) + pad(wt, W.wt) + pad(pl, W.pl) + pad(pld, W.pld);

  const lines = [row('Holding', 'Value', 'Wt', 'P/L', 'DKK')];

  // Sort by weight desc so the biggest positions read first.
  const positions = [...report.positions].sort((a, b) => (b.marketValueDkk ?? 0) - (a.marketValueDkk ?? 0));
  for (const p of positions) {
    const val = fmtNum(p.marketValueDkk);
    const wt = p.weightPct == null ? '—' : `${p.weightPct.toFixed(1)}%`;
    const plPct = p.unrealizedPlDkk == null || !p.costBasisDkk ? '—' : fmtPct(p.unrealizedPlDkk / p.costBasisDkk);
    const plDkk = p.unrealizedPlDkk == null ? '—' : fmtNum(p.unrealizedPlDkk);
    lines.push(row(p.instrument, val, wt, plPct, plDkk));
  }
  lines.push(row('Cash', fmtNum(report.cashDkk), `${report.cashPct.toFixed(1)}%`, '—', '—'));
  return lines.join('\n');
}

/** Weekly pulse (short) — section 4, with full holdings table. Returns HTML. */
export function formatWeeklyPulse(report) {
  const prim = primaryBenchmark();
  const sec = secondaryBenchmark();
  const head = [];
  head.push(`📊 Week ${weekNumber(report)} pulse — ${report.date}`);
  head.push(`Portfolio: ${fmtDkk(report.totalValueDkk)}  (${fmtPct(report.sinceReturn)} since start)`);
  head.push(`This week: ${report.weekReturn == null ? '— (first pulse)' : fmtPct(report.weekReturn)}`);
  for (const b of [prim, sec]) {
    const m = report.benchmarks[b.key];
    head.push(`${b.label}: ${fmtPct(m.sinceReturn)}  → you ${fmtPct(m.deltaVsPortfolio)} vs ${shortName(b)} ${ahead(m.deltaVsPortfolio)}`);
  }
  head.push(`Cash: ${fmtDkk(report.cashDkk)} (${report.cashPct.toFixed(1)}%)`);
  head.push('');
  head.push('📦 Holdings');

  const foot = [];
  foot.push(`P/L — unrealized ${fmtDkk(report.unrealizedPlDkk)} · realized ${fmtDkk(report.realizedPlDkk)}`);
  if (report.missingPrices.length) foot.push(`⚠️ No live price for: ${report.missingPrices.join(', ')} (shown as —)`);

  return (
    head.map(esc).join('\n') +
    '\n<pre>' +
    esc(holdingsTable(report)) +
    '</pre>\n' +
    foot.map(esc).join('\n')
  );
}

/** Monthly full report — section 4. Returns HTML. */
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

  const out =
    L.map(esc).join('\n') +
    '\n<pre>' +
    esc(holdingsTable(report)) +
    '</pre>\n' +
    esc(verdictLine(report, prim));
  return out;
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
