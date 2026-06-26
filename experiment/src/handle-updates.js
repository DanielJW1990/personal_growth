// ENTRYPOINT: process inbound Telegram updates (button taps + fill replies) and
// append confirmed fills to the ledger. This is the only path by which a trade
// enters the books — and it only runs after the human has tapped Approve and
// placed the order by hand.

import { config } from './config.js';
import { loadLedger, saveLedger, appendFill } from './ledger.js';
import { getUpdates, answerCallback, annotateMessage, sendMessage } from './telegram.js';
import { parseFill } from './fills-parse.js';
import { getPricesDkk } from './marketdata.js';

function findPendingByMessageId(led, messageId) {
  for (const [id, entry] of Object.entries(led.telegram_state.pending)) {
    if (entry.message_id === messageId) return { id, entry };
  }
  return null;
}

async function handleCallback(led, cb) {
  const [action, id] = String(cb.data ?? '').split(':');
  // A callback expires ~1 minute after the tap, but our poller may run minutes
  // later. Make both the acknowledgement and the message edit best-effort, so a
  // stale callback never blocks the status change or the visible ❌/✅ update.
  const ack = (text) => answerCallback(cb.id, text).catch((e) => console.error(`answerCallback: ${e.message}`));
  const annotate = (msgId, orig, suffix) =>
    annotateMessage(msgId, orig, suffix).catch((e) => console.error(`annotate: ${e.message}`));

  const entry = led.telegram_state.pending[id];
  if (!entry) {
    await ack('This proposal is no longer pending.');
    return;
  }
  if (action === 'apr') {
    entry.status = 'approved';
    await ack('Approved — place the order, then reply with the fill.');
    await annotate(entry.message_id, entry.original_text, '✅ Approved. Reply to this message with your fill.');
  } else if (action === 'rej') {
    entry.status = 'rejected';
    await ack('Rejected.');
    await annotate(entry.message_id, entry.original_text, '❌ Rejected — no action taken.');
  } else if (action === 'mod') {
    entry.status = 'modify';
    await ack('Reply with your modified size/price.');
    await annotate(
      entry.message_id,
      entry.original_text,
      '✏️ Modify — reply with the version you want, e.g. "filled 2 @ 140".',
    );
  }
}

async function handleMessage(led, msg) {
  const text = msg.text ?? '';
  const replyTo = msg.reply_to_message?.message_id;
  const match = replyTo ? findPendingByMessageId(led, replyTo) : null;

  const parsed = parseFill(text);
  if (!parsed) {
    if (match) await sendMessage('Could not read that as a fill. Try: "filled 3.4 shares @ 142.10 DKK".');
    return;
  }

  if (!match) {
    await sendMessage('Got a fill, but it was not a reply to a specific proposal. Reply to the proposal message so I know which trade it is.');
    return;
  }

  const { id, entry } = match;
  if (entry.status === 'rejected') {
    await sendMessage('That proposal was rejected — ignoring the fill.');
    return;
  }

  const proposal = entry.proposal;
  let price = parsed.price_dkk;
  let estimated = parsed.est_or_confirmed === 'estimated';

  // "filled at market": grab the current price as an estimate, flag it.
  if (price == null && parsed.atMarket) {
    const ticker = proposal.ticker || proposal.instrument;
    const prices = await getPricesDkk([ticker]);
    price = prices[ticker] ?? null;
    estimated = true;
  }

  if (parsed.shares == null) {
    await sendMessage('I need the share count. Reply e.g. "filled 3.4 shares @ 142.10 DKK".');
    return;
  }
  if (price == null) {
    await sendMessage('I could not determine a price. Reply with "@ <price>" so I can book it.');
    return;
  }

  const fill = appendFill(led, {
    date: new Date().toISOString().slice(0, 10),
    action: proposal.action,
    instrument: proposal.instrument,
    ticker: proposal.ticker,
    shares: parsed.shares,
    price_dkk: price,
    fee_dkk: parsed.fee_dkk ?? 0,
    est_or_confirmed: estimated ? 'estimated' : 'confirmed',
  });

  entry.status = 'filled';
  entry.fill = fill;

  const flag = estimated ? ' (estimated — confirm exact price/qty later)' : '';
  await sendMessage(
    `📒 Booked: ${fill.action.toUpperCase()} ${fill.shares} ${fill.instrument} @ ${fill.price_dkk.toFixed(2)} DKK${flag}.`,
  );
}

export async function handleUpdates() {
  const led = await loadLedger();
  const updates = await getUpdates(led.telegram_state.last_update_id);

  let maxId = led.telegram_state.last_update_id;
  for (const u of updates) {
    maxId = Math.max(maxId, u.update_id);
    try {
      if (u.callback_query) await handleCallback(led, u.callback_query);
      else if (u.message?.text) await handleMessage(led, u.message);
    } catch (err) {
      console.error(`update ${u.update_id} failed: ${err.message}`);
    }
  }
  led.telegram_state.last_update_id = maxId;
  await saveLedger(led);
  return { processed: updates.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (config.killSwitch) {
    console.log('kill switch on — still processing inbound fills.');
  }
  handleUpdates()
    .then((r) => console.log('handle-updates:', JSON.stringify(r)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
