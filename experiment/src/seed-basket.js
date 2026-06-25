// ONE-TIME: push a curated initial basket to Telegram as proposals, so you can
// Approve/Reject each and reply with fills exactly like the weekly screen. This
// is the initial build-out (all-cash → ~8 names), which the per-week change cap
// is deliberately not designed for. Reads data/seed-basket.json.
//
// Guarded so it can't double-send: once seeded, it refuses to run again.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLedger, saveLedger } from './ledger.js';
import { sendMessage, sendProposal, formatProposal } from './telegram.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = process.env.SEED_PATH ?? join(__dirname, '..', 'data', 'seed-basket.json');

function shortId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export async function runSeed() {
  const led = await loadLedger();

  if (led.telegram_state.seeded) {
    console.log('Already seeded — refusing to send the initial basket again.');
    return { sent: 0, alreadySeeded: true };
  }

  const { proposals } = JSON.parse(await readFile(SEED_PATH, 'utf8'));
  if (!proposals?.length) {
    console.log('No seed proposals found.');
    return { sent: 0 };
  }

  await sendMessage(
    `🌱 Initial basket — ${proposals.length} buys to build your 20,000 DKK portfolio.\n` +
      'For each: tap ✅ Approve, place the order, then REPLY to that message with your fill ' +
      '(e.g. "filled 8 @ 309 DKK", or for US "buy for amount": "filled 1.006 @ 2361 DKK").\n' +
      'Tap ❌ Reject on any you can\'t buy (e.g. ASML/LVMH if your broker has no fractional European shares).',
  );

  for (const p of proposals) {
    const id = shortId();
    const msg = await sendProposal(p, id);
    led.telegram_state.pending[id] = {
      proposal: p,
      status: 'proposed',
      message_id: msg.message_id,
      original_text: formatProposal(p),
      created: new Date().toISOString(),
    };
  }

  led.telegram_state.seeded = true;
  await saveLedger(led);
  return { sent: proposals.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSeed()
    .then((r) => console.log('seed:', JSON.stringify(r)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
