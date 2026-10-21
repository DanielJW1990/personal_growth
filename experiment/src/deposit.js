// ENTRYPOINT: book a deposit (or withdrawal) into the ledger.
//
// The portfolio is priced BEFORE the money is recorded, so the time-weighted
// return has an exact cut point to chain across. That is the whole reason this
// is a job and not a hand edit: get the value wrong and every return after it
// is wrong, quietly and forever.
//
// Usage:  node src/deposit.js <amount_dkk> ["note"]
// or set DEPOSIT_DKK / DEPOSIT_NOTE in the environment (the workflow does).

import { loadLedger, saveLedger, appendCashFlow } from './ledger.js';
import { getPricesDkk } from './marketdata.js';
import { computePortfolio, keyOf } from './bookkeeper.js';
import { sendMessage } from './telegram.js';
import { isTransientNetworkError } from './net.js';

const fmt = (n) => `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('da-DK', { maximumFractionDigits: 0 })} DKK`;

export async function bookDeposit({ amountDkk, note, date } = {}) {
  const amount = Number(amountDkk);
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error(`deposit: amount must be a non-zero number, got "${amountDkk}"`);
  }

  const led = await loadLedger();

  // Value the book at today's prices, before the money is recorded.
  const { open } = computePortfolio(led, {});
  const tickers = open.map((p) => keyOf(p));
  const prices = await getPricesDkk(tickers);
  const before = computePortfolio(led, prices);

  // A deposit priced against an incomplete book would bake a bad cut point into
  // every future return. Refuse rather than record something subtly wrong.
  if (before.missingPrices.length) {
    throw new Error(
      `deposit: refusing to book — no price for ${before.missingPrices.join(', ')}. ` +
        'The value-before figure must be exact; retry when quotes are available.',
    );
  }

  const valueBefore = before.totalValueDkk;
  const entry = appendCashFlow(led, {
    date,
    amount_dkk: amount,
    value_before_dkk: valueBefore,
    note,
  });
  await saveLedger(led);

  const after = computePortfolio(led, prices);
  const verb = amount > 0 ? 'Deposit' : 'Withdrawal';
  await sendMessage(
    `🏦 ${verb} booked: ${fmt(amount)}\n` +
      `Portfolio before: ${fmt(valueBefore)} → after: ${fmt(after.totalValueDkk)}\n` +
      `Cash now: ${fmt(after.cashDkk)} (${after.cashPct.toFixed(1)}%)\n\n` +
      'Returns are time-weighted, so this does not count as a gain — the ' +
      'scoreboard still measures decisions, not deposits.',
  );

  return { booked: entry, valueBeforeDkk: valueBefore, totalAfterDkk: after.totalValueDkk };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const amountDkk = process.argv[2] ?? process.env.DEPOSIT_DKK;
  const note = process.argv[3] ?? process.env.DEPOSIT_NOTE ?? undefined;
  bookDeposit({ amountDkk, note })
    .then((r) => console.log('deposit:', JSON.stringify(r)))
    .catch((err) => {
      // A deposit is a one-shot operator action, so even a transient failure
      // must be visible — silently skipping it would leave the books wrong.
      if (isTransientNetworkError(err)) {
        console.error(`deposit: network failure (${err.message}) — NOT booked. Run it again.`);
      } else {
        console.error(err);
      }
      process.exit(1);
    });
}
