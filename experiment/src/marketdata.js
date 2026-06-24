// MARKET DATA adapter. Pulls current quotes and benchmark levels. Isolated
// behind a small interface so the provider can be swapped without touching the
// bookkeeper. Default provider: Yahoo Finance's public chart endpoint (no key).
//
// Position prices are returned in DKK (converting from the quote currency via an
// FX rate). Benchmark *levels* are returned raw — a benchmark return is a ratio
// of levels and is therefore currency-neutral, so no FX is needed there.

import { BENCHMARKS } from './config.js';

const CHART = (symbol) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (index-beating-experiment)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/**
 * @param {string} symbol
 * @returns {Promise<{ price: number, currency: string } | null>}
 */
export async function getQuote(symbol) {
  try {
    const data = await fetchJson(CHART(symbol));
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    const price = meta?.regularMarketPrice;
    if (!Number.isFinite(price)) return null;
    return { price, currency: meta?.currency ?? 'USD' };
  } catch (err) {
    console.error(`market-data: failed quote for ${symbol}: ${err.message}`);
    return null;
  }
}

/** FX rate from `currency` to DKK (1 if already DKK). null on failure. */
export async function getFxToDkk(currency) {
  if (!currency || currency === 'DKK') return 1;
  const q = await getQuote(`${currency}DKK=X`);
  return q?.price ?? null;
}

/**
 * Resolve a set of symbols to prices in DKK.
 * @param {string[]} symbols
 * @returns {Promise<Record<string, number>>} symbol -> price_dkk (missing on failure)
 */
export async function getPricesDkk(symbols) {
  const unique = [...new Set(symbols.filter(Boolean))];
  const fxCache = new Map();
  const out = {};
  for (const symbol of unique) {
    const q = await getQuote(symbol);
    if (!q) continue;
    let fx = fxCache.get(q.currency);
    if (fx === undefined) {
      fx = await getFxToDkk(q.currency);
      fxCache.set(q.currency, fx);
    }
    if (fx == null) continue;
    out[symbol] = q.price * fx;
  }
  return out;
}

/**
 * Current benchmark levels (raw, currency-neutral).
 * @returns {Promise<{ msci_world: number|null, sp500: number|null }>}
 */
export async function getBenchmarkLevels() {
  const out = {};
  for (const key of Object.keys(BENCHMARKS)) {
    const q = await getQuote(BENCHMARKS[key].symbol);
    out[key] = q?.price ?? null;
  }
  return out;
}
