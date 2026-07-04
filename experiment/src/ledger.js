// The ledger is the single source of truth. Positions, cash, and weights are
// DERIVED from `fills` (see bookkeeper.js) — never stored. `snapshots` is a
// derived cache used only for period-over-period deltas and drawdown, and is
// safe to rebuild. `telegram_state` tracks the getUpdates offset and the
// pending propose→approve→fill workflow.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BENCHMARKS } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const LEDGER_PATH = process.env.LEDGER_PATH ?? join(__dirname, '..', 'data', 'ledger.json');

/**
 * @typedef {Object} Fill
 * @property {string} date         ISO date
 * @property {'buy'|'sell'|'add'|'trim'} action
 * @property {string} instrument
 * @property {string} ticker
 * @property {number} shares
 * @property {number} price_dkk
 * @property {number} fee_dkk
 * @property {'estimated'|'confirmed'} est_or_confirmed
 */

export async function loadLedger() {
  const raw = await readFile(LEDGER_PATH, 'utf8');
  const led = JSON.parse(raw);
  // Defensive defaults so a hand-edited file never crashes the bookkeeper.
  led.fills ??= [];
  led.snapshots ??= [];
  led.telegram_state ??= { last_update_id: 0, pending: {} };
  led.telegram_state.pending ??= {};
  return led;
}

export async function saveLedger(led) {
  await mkdir(dirname(LEDGER_PATH), { recursive: true });
  await writeFile(LEDGER_PATH, JSON.stringify(led, null, 2) + '\n', 'utf8');
}

/** True once inception has been stamped (deposit placed, benchmark levels captured). */
export function isInceptionSet(led) {
  return Boolean(led?.inception?.date && led?.inception?.benchmark_levels);
}

/**
 * Stamp inception the first time we have benchmark levels. Idempotent: never
 * overwrites an existing inception (that would silently rebase every return).
 * @param {object} led
 * @param {{ date?: string, levels: { msci_world: number, sp500: number } }} opts
 */
export function setInception(led, { date, levels }) {
  if (isInceptionSet(led)) return led;
  led.inception ??= { deposit_dkk: 20000 };
  led.inception.date = date ?? new Date().toISOString().slice(0, 10);
  led.inception.benchmark_levels = { msci_world: levels.msci_world, sp500: levels.sp500 };
  // Record which proxy symbols the levels came from, so a later proxy change
  // can be detected and re-based instead of silently mixing scales.
  led.inception.benchmark_symbols = {
    msci_world: BENCHMARKS.msci_world.symbol,
    sp500: BENCHMARKS.sp500.symbol,
  };
  return led;
}

/**
 * Append a confirmed/estimated fill. Returns the appended fill.
 * Trades carry shares/price_dkk; a `dividend` carries amount_dkk (cash paid
 * out) with fee_dkk usable for withholding tax.
 */
export function appendFill(led, fill) {
  const normalized = {
    date: fill.date ?? new Date().toISOString().slice(0, 10),
    action: fill.action,
    instrument: fill.instrument,
    ticker: fill.ticker ?? '',
    shares: Number(fill.shares ?? 0),
    price_dkk: Number(fill.price_dkk ?? 0),
    fee_dkk: Number(fill.fee_dkk ?? 0),
    est_or_confirmed: fill.est_or_confirmed ?? 'confirmed',
  };
  if (fill.amount_dkk != null) normalized.amount_dkk = Number(fill.amount_dkk);
  led.fills.push(normalized);
  return normalized;
}

/** Append a periodic snapshot for period-delta and drawdown math (a cache). */
export function appendSnapshot(led, snapshot) {
  led.snapshots.push({
    date: snapshot.date ?? new Date().toISOString().slice(0, 10),
    total_value_dkk: snapshot.total_value_dkk,
    benchmark_levels: snapshot.benchmark_levels,
    kind: snapshot.kind ?? 'pulse', // 'pulse' | 'monthly'
  });
  return led;
}
