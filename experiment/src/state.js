// Shared glue: load the ledger, pull market data, stamp inception on first run,
// and build the bookkeeper's report model. Used by every entrypoint so they all
// see the same derived state.

import { loadLedger, saveLedger, isInceptionSet, setInception } from './ledger.js';
import { getBenchmarkLevels, getPricesDkk } from './marketdata.js';
import { computePortfolio, buildReport, keyOf, derivePositions } from './bookkeeper.js';

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

  // Price every held position (open positions only).
  const { open } = derivePositions(led.fills ?? []);
  const symbols = open.map((p) => keyOf(p));
  const prices = await getPricesDkk(symbols);

  const portfolio = computePortfolio(led, prices);
  const report = buildReport({ led, prices, benchLevels, now });

  return { led, prices, benchLevels, portfolio, report, saved };
}
