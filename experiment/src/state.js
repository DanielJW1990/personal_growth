// Shared glue: load the ledger, pull market data, stamp inception on first run,
// and build the bookkeeper's report model. Used by every entrypoint so they all
// see the same derived state.

import { loadLedger, saveLedger, isInceptionSet, setInception } from './ledger.js';
import { getBenchmarkLevels, getPricesDkk } from './marketdata.js';
import { computePortfolio, buildReport, keyOf, derivePositions } from './bookkeeper.js';
import { BENCHMARKS } from './config.js';

/**
 * Gather everything an entrypoint needs. Stamps inception (with current
 * benchmark levels) the first time it runs, so since-inception returns start
 * from the moment the experiment actually begins.
 *
 * @returns {Promise<{ led: object, prices: Record<string, number>,
 *   benchLevels: object, portfolio: object, report: object, saved: boolean }>}
 */
export async function gatherState({ now } = {}) {
  const led = await loadLedger();

  const benchLevels = await getBenchmarkLevels();

  let saved = false;
  if (!isInceptionSet(led) && benchLevels.msci_world && benchLevels.sp500) {
    setInception(led, { date: now, levels: benchLevels });
    await saveLedger(led);
    saved = true;
  }

  // If the configured proxy for a benchmark changed (e.g. URTH → IWDA.AS for a
  // total-return scoreboard), the stored inception level is on the old symbol's
  // scale. Re-base that benchmark to the new symbol's current level and record
  // the symbol. Only sound while the history is short; proxies shouldn't change
  // mid-experiment.
  if (isInceptionSet(led)) {
    led.inception.benchmark_symbols ??= { msci_world: 'URTH', sp500: '^GSPC' }; // pre-migration ledgers
    let rebased = false;
    for (const key of ['msci_world', 'sp500']) {
      const want = BENCHMARKS[key].symbol;
      if (led.inception.benchmark_symbols[key] !== want && Number.isFinite(benchLevels[key])) {
        led.inception.benchmark_levels[key] = benchLevels[key];
        led.inception.benchmark_symbols[key] = want;
        rebased = true;
      }
    }
    if (rebased) {
      await saveLedger(led);
      saved = true;
    }
  }

  // Price every held position (open positions only).
  const { open } = derivePositions(led.fills ?? []);
  const symbols = open.map((p) => keyOf(p));
  const prices = await getPricesDkk(symbols);

  const portfolio = computePortfolio(led, prices);
  const report = buildReport({ led, prices, benchLevels, now });

  return { led, prices, benchLevels, portfolio, report, saved };
}
