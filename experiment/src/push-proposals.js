// Ad-hoc channel: push a hand-curated set of proposals to Telegram as
// Approve/Reject messages with fill tracking — used for one-off ideas or swaps
// outside the automated weekday screen. Reads data/extra-proposals.json (or the
// file in PROPOSALS_FILE). Not guarded — each run sends whatever is in the file,
// so update the file before re-triggering.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLedger, saveLedger } from './ledger.js';
import { sendMessage, sendProposal, formatProposal } from './telegram.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = process.env.PROPOSALS_FILE ?? join(__dirname, '..', 'data', 'extra-proposals.json');

function shortId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export async function pushProposals() {
  const led = await loadLedger();
  const { proposals, intro } = JSON.parse(await readFile(FILE, 'utf8'));
  if (!proposals?.length) {
    console.log('No proposals to push.');
    return { sent: 0 };
  }

  if (intro) await sendMessage(intro);

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

  await saveLedger(led);
  return { sent: proposals.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  pushProposals()
    .then((r) => console.log('push:', JSON.stringify(r)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
