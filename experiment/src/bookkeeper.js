// THE BOOKKEEPER — plain code, no LLM, no I/O. Every number the system reports
// originates here, computed from the ledger's fills + market data. The analyst
// may narrate these numbers but must never originate them.
//
// All functions are pure: data in, numbers out. That is what makes them
// testable and trustworthy.

const SHARE_EPSILON = 1e-6;

/** Key a position/price by ticker when present, else instrument name. */
export function keyOf(x) {
  return (x.ticker && String(x.ticker).trim()) || x.instrument;
}

/**
 * Derive positions and realized P/L from the chronological fill list using the
 * average-cost method. Buy fees fold into cost basis; sell fees reduce proceeds.
 *
 * @param {import('./ledger.js').Fill[]} fills
 * @returns {{ open: Object[], closed: Object[], realizedPlDkk: number, byKey: Map<string, object> }}
 */
export function derivePositions(fills) {
  /** @type {Map<string, any>} */
  const byKey = new Map();

  const sorted = [...fills].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  for (const f of sorted) {
    const key = keyOf(f);
    let p = byKey.get(key);
    if (!p) {
      p = {
        instrument: f.instrument,
        ticker: f.ticker ?? '',
        shares: 0,
        costBasisDkk: 0, // total cost of the shares currently held
        realizedPlDkk: 0,
        tradeCount: 0,
        closed: false,
      };
      byKey.set(key, p);
    }
    p.tradeCount += 1;
    const shares = Number(f.shares);
    const price = Number(f.price_dkk);
    const fee = Number(f.fee_dkk ?? 0);

    if (f.action === 'buy' || f.action === 'add') {
      p.shares += shares;
      p.costBasisDkk += shares * price + fee;
      p.closed = false;
    } else if (f.action === 'sell' || f.action === 'trim') {
      const avgCost = p.shares > SHARE_EPSILON ? p.costBasisDkk / p.shares : 0;
      const sellShares = Math.min(shares, p.shares);
      const costRemoved = avgCost * sellShares;
      const proceeds = sellShares * price - fee;
      p.realizedPlDkk += proceeds - costRemoved;
      p.shares -= sellShares;
      p.costBasisDkk -= costRemoved;
      if (p.shares <= SHARE_EPSILON) {
        p.shares = 0;
        p.costBasisDkk = 0;
        p.closed = true;
      }
    }
  }

  const open = [];
  const closed = [];
  let realizedPlDkk = 0;
  for (const p of byKey.values()) {
    p.avgCostDkk = p.shares > SHARE_EPSILON ? p.costBasisDkk / p.shares : 0;
    realizedPlDkk += p.realizedPlDkk;
    if (p.shares > SHARE_EPSILON) open.push(p);
    else closed.push(p);
  }
  return { open, closed, realizedPlDkk, byKey };
}

/**
 * Cash = deposit − (buys notional + fees) + (sells notional − fees).
 * @param {number} depositDkk
 * @param {import('./ledger.js').Fill[]} fills
 */
export function computeCash(depositDkk, fills) {
  let cash = depositDkk;
  for (const f of fills) {
    const notional = Number(f.shares) * Number(f.price_dkk);
    const fee = Number(f.fee_dkk ?? 0);
    if (f.action === 'buy' || f.action === 'add') cash -= notional + fee;
    else if (f.action === 'sell' || f.action === 'trim') cash += notional - fee;
  }
  return cash;
}

/**
 * Full current portfolio snapshot from fills + a price map.
 * @param {object} led
 * @param {Record<string, number>} prices  key (ticker|instrument) -> price_dkk
 */
export function computePortfolio(led, prices) {
  const depositDkk = led.inception?.deposit_dkk ?? 0;
  const fills = led.fills ?? [];
  const { open, closed, realizedPlDkk } = derivePositions(fills);
  const cashDkk = computeCash(depositDkk, fills);

  let unrealizedPlDkk = 0;
  const positions = open.map((p) => {
    const key = keyOf(p);
    const price = prices?.[key];
    const hasPrice = Number.isFinite(price);
    const marketValueDkk = hasPrice ? p.shares * price : null;
    const unreal = hasPrice ? marketValueDkk - p.costBasisDkk : null;
    if (hasPrice) unrealizedPlDkk += unreal;
    return {
      instrument: p.instrument,
      ticker: p.ticker,
      shares: p.shares,
      avgCostDkk: p.avgCostDkk,
      priceDkk: hasPrice ? price : null,
      marketValueDkk,
      costBasisDkk: p.costBasisDkk,
      unrealizedPlDkk: unreal,
    };
  });

  const positionsValueDkk = positions.reduce((s, p) => s + (p.marketValueDkk ?? 0), 0);
  const totalValueDkk = cashDkk + positionsValueDkk;

  // Weights are of total portfolio value.
  for (const p of positions) {
    p.weightPct = totalValueDkk > 0 && p.marketValueDkk != null ? (p.marketValueDkk / totalValueDkk) * 100 : null;
  }

  return {
    depositDkk,
    cashDkk,
    cashPct: totalValueDkk > 0 ? (cashDkk / totalValueDkk) * 100 : 0,
    positions,
    positionsValueDkk,
    totalValueDkk,
    realizedPlDkk,
    unrealizedPlDkk,
    closedPositions: closed,
    missingPrices: positions.filter((p) => p.priceDkk == null).map((p) => keyOf(p)),
  };
}

/** Simple since-inception return (correct for a single lump-sum deposit). */
export function sinceInceptionReturn(totalValueDkk, depositDkk) {
  if (!depositDkk) return null;
  return totalValueDkk / depositDkk - 1;
}

/** Benchmark return is currency-neutral as a ratio of index levels. */
export function benchmarkReturn(currentLevel, inceptionLevel) {
  if (!inceptionLevel || !Number.isFinite(currentLevel)) return null;
  return currentLevel / inceptionLevel - 1;
}

/** Period return vs the most recent snapshot of a given kind (null if none). */
export function periodReturn(totalValueDkk, snapshots, kind) {
  const prior = lastSnapshot(snapshots, kind);
  if (!prior || !prior.total_value_dkk) return null;
  return totalValueDkk / prior.total_value_dkk - 1;
}

export function lastSnapshot(snapshots, kind) {
  const list = (snapshots ?? []).filter((s) => !kind || s.kind === kind);
  return list.length ? list[list.length - 1] : null;
}

/**
 * Max drawdown across the snapshot series plus the current value (peak-to-trough
 * decline as a negative fraction; 0 if never below a prior peak).
 */
export function maxDrawdown(snapshots, currentValueDkk) {
  const series = (snapshots ?? []).map((s) => s.total_value_dkk).filter((v) => Number.isFinite(v));
  if (Number.isFinite(currentValueDkk)) series.push(currentValueDkk);
  let peak = -Infinity;
  let maxDd = 0;
  for (const v of series) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = v / peak - 1;
      if (dd < maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

/** Years between two ISO dates (fractional). */
export function yearsBetween(fromIso, toIso) {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  return (to - from) / (365.25 * 24 * 3600 * 1000);
}

/**
 * Annualized return (CAGR). Returns null until there is ≥ minMonths of history,
 * because annualizing a few weeks produces nonsense.
 */
export function cagr(sinceReturn, inceptionDate, now, minMonths = 3) {
  if (sinceReturn == null || !inceptionDate) return null;
  const years = yearsBetween(inceptionDate, now);
  if (years < minMonths / 12) return null;
  return Math.pow(1 + sinceReturn, 1 / years) - 1;
}

/** Turnover: trade count and % of portfolio traded (sum trade notional / value). */
export function turnover(fills, totalValueDkk) {
  const trades = (fills ?? []).filter((f) => ['buy', 'sell', 'add', 'trim'].includes(f.action));
  const tradedNotional = trades.reduce((s, f) => s + Math.abs(Number(f.shares) * Number(f.price_dkk)), 0);
  return {
    trades: trades.length,
    tradedNotionalDkk: tradedNotional,
    pctOfPortfolio: totalValueDkk > 0 ? (tradedNotional / totalValueDkk) * 100 : 0,
  };
}

/** Hit rate: % of CLOSED positions that were net profitable on realized P/L. */
export function hitRate(closedPositions) {
  const closed = (closedPositions ?? []).filter((p) => p.closed);
  if (!closed.length) return { closed: 0, profitable: 0, pct: null };
  const profitable = closed.filter((p) => p.realizedPlDkk > 0).length;
  return { closed: closed.length, profitable, pct: (profitable / closed.length) * 100 };
}

/**
 * Assemble the full report model that report.js formats. Bundles the portfolio,
 * both benchmark deltas, period returns, drawdown, CAGR, turnover, and hit rate.
 *
 * @param {object} args
 * @param {object} args.led       the ledger
 * @param {Record<string, number>} args.prices  position prices in DKK
 * @param {{ msci_world: number, sp500: number }} args.benchLevels current index levels
 * @param {string} [args.now]     ISO date (defaults to today)
 */
export function buildReport({ led, prices, benchLevels, now }) {
  const today = now ?? new Date().toISOString().slice(0, 10);
  const pf = computePortfolio(led, prices);
  const inception = led.inception ?? {};
  const sinceReturn = sinceInceptionReturn(pf.totalValueDkk, pf.depositDkk);

  const benchInception = inception.benchmark_levels ?? {};
  const benchmarks = {};
  for (const key of ['msci_world', 'sp500']) {
    const since = benchmarkReturn(benchLevels?.[key], benchInception?.[key]);
    benchmarks[key] = {
      sinceReturn: since,
      // Positive delta = the portfolio is ahead of this benchmark.
      deltaVsPortfolio: since == null || sinceReturn == null ? null : sinceReturn - since,
    };
  }

  return {
    date: today,
    inceptionDate: inception.date ?? null,
    depositDkk: pf.depositDkk,
    totalValueDkk: pf.totalValueDkk,
    cashDkk: pf.cashDkk,
    cashPct: pf.cashPct,
    positions: pf.positions,
    positionsValueDkk: pf.positionsValueDkk,
    sinceReturn,
    sinceReturnDkk: pf.totalValueDkk - pf.depositDkk,
    weekReturn: periodReturn(pf.totalValueDkk, led.snapshots, 'pulse'),
    monthReturn: periodReturn(pf.totalValueDkk, led.snapshots, 'monthly'),
    benchmarks,
    realizedPlDkk: pf.realizedPlDkk,
    unrealizedPlDkk: pf.unrealizedPlDkk,
    maxDrawdown: maxDrawdown(led.snapshots, pf.totalValueDkk),
    cagr: cagr(sinceReturn, inception.date, today),
    turnover: turnover(led.fills, pf.totalValueDkk),
    hitRate: hitRate(pf.closedPositions),
    missingPrices: pf.missingPrices,
    monthsOfHistory: inception.date ? yearsBetween(inception.date, today) * 12 : 0,
  };
}
