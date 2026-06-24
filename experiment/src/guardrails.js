// GUARDRAILS — section 5, enforced in code. Pure: proposals + current portfolio
// in, accepted/rejected out. Anything that would breach a hard limit is rejected
// here, before it ever reaches the human's Telegram.

import { STRATEGY } from './config.js';
import { keyOf } from './bookkeeper.js';

const EXOTIC_PATTERNS = [
  /crypto/i, /bitcoin/i, /\beth\b/i, /\bbtc\b/i, /warrant/i, /\bcfd\b/i,
  /leverage/i, /\b[23]x\b/i, /futures?/i, /options?/i, /derivativ/i, /\bperp/i,
];

/** Heuristic ETF detection — ETFs are exempt from the 20% single-name cap. */
export function isEtf(p) {
  if (typeof p.is_etf === 'boolean') return p.is_etf;
  const hay = `${p.instrument ?? ''} ${p.ticker ?? ''}`.toLowerCase();
  return /\betf\b|ucits|index fund|\bishares\b|\bvanguard\b|\bspdr\b|\bxtrackers\b/.test(hay);
}

function tradeNotionalDkk(p, totalValueDkk) {
  if (Number.isFinite(p.approx_dkk)) return Math.abs(Number(p.approx_dkk));
  if (Number.isFinite(p.target_weight_pct)) return Math.abs((Number(p.target_weight_pct) / 100) * totalValueDkk);
  return 0;
}

function currentMarketValue(portfolio, p) {
  const k = keyOf(p);
  const pos = portfolio.positions.find((x) => keyOf(x) === k);
  return pos?.marketValueDkk ?? 0;
}

/**
 * Validate the analyst's proposals against the hard guardrails.
 *
 * @param {object[]} proposals
 * @param {object} portfolio   result of computePortfolio()
 * @param {object} opts        { allowSpeculative, allowExotic }
 * @returns {{ accepted: object[], rejected: {proposal: object, reasons: string[]}[] }}
 */
export function validateProposals(proposals, portfolio, opts = {}) {
  const accepted = [];
  const rejected = [];
  const total = portfolio.totalValueDkk;
  const list = Array.isArray(proposals) ? proposals : [];

  // Running projections as we accept proposals in order.
  let projectedCash = portfolio.cashDkk;
  let speculativeCount = portfolio.positions.filter((x) => x.isSpeculative).length;

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const reasons = [];

    // Max changes per week: accept the first N, reject the overflow.
    if (i >= STRATEGY.maxChangesPerWeek) {
      reasons.push(`Exceeds the max ${STRATEGY.maxChangesPerWeek} changes/week limit (fewer is better).`);
    }

    // Valid action.
    if (!['buy', 'sell', 'add', 'trim'].includes(p.action)) {
      reasons.push(`Unknown action "${p.action}".`);
    }

    // Allow-list: no crypto/derivatives/leverage/warrants unless opted in.
    const hay = `${p.instrument ?? ''} ${p.ticker ?? ''}`;
    if (!opts.allowExotic && EXOTIC_PATTERNS.some((re) => re.test(hay))) {
      reasons.push('Excluded instrument type (crypto/derivative/leverage/warrant). Off by default.');
    }

    // Speculative sleeve gating.
    if (p.is_speculative) {
      if (!opts.allowSpeculative) {
        reasons.push('Speculative ideas are disabled (ALLOW_SPECULATIVE=false).');
      } else if (p.action === 'buy' || p.action === 'add') {
        if (speculativeCount + 1 > STRATEGY.speculative.maxPositions) {
          reasons.push(`Speculative sleeve already holds the max ${STRATEGY.speculative.maxPositions} position(s).`);
        }
        if (Number.isFinite(p.target_weight_pct) && p.target_weight_pct > STRATEGY.speculative.maxWeightPct) {
          reasons.push(`Speculative position > ${STRATEGY.speculative.maxWeightPct}% cap.`);
        }
      }
    }

    const notional = tradeNotionalDkk(p, total);

    if (p.action === 'buy' || p.action === 'add') {
      // Single non-ETF position hard cap.
      const projectedMv = currentMarketValue(portfolio, p) + notional;
      const projectedWeight = total > 0 ? (projectedMv / total) * 100 : 0;
      if (!isEtf(p) && projectedWeight > STRATEGY.maxSinglePositionPct + 1e-9) {
        reasons.push(
          `Would push ${p.instrument} to ~${projectedWeight.toFixed(1)}% — over the ${STRATEGY.maxSinglePositionPct}% single-name cap.`,
        );
      }
      // Cash buffer must remain ≥ 5% after this buy.
      const cashAfter = projectedCash - notional;
      const cashPctAfter = total > 0 ? (cashAfter / total) * 100 : 0;
      if (cashPctAfter < STRATEGY.minCashBufferPct - 1e-9) {
        reasons.push(
          `Would drop cash to ~${cashPctAfter.toFixed(1)}% — under the ${STRATEGY.minCashBufferPct}% buffer.`,
        );
      }
      if (reasons.length === 0) projectedCash = cashAfter;
    } else if (p.action === 'sell' || p.action === 'trim') {
      if (reasons.length === 0) projectedCash += notional;
    }

    if (reasons.length === 0) {
      accepted.push(p);
      if (p.is_speculative && (p.action === 'buy' || p.action === 'add')) speculativeCount += 1;
    } else {
      rejected.push({ proposal: p, reasons });
    }
  }

  return { accepted, rejected };
}
