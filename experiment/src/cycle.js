// ENTRYPOINT: weekly propose cycle.
// Bookkeeper loads ledger + market data → analyst proposes → guardrails validate
// → Telegram posts each accepted proposal with Approve/Modify/Reject. Approval
// and fills are handled later by handle-updates.js.

import { config } from './config.js';
import { saveLedger } from './ledger.js';
import { gatherState } from './state.js';
import { runAnalyst } from './analyst.js';
import { validateProposals } from './guardrails.js';
import { sendMessage, sendProposal, formatProposal } from './telegram.js';

function shortId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export async function runCycle() {
  // Kill switch: pause everything, send "paused", do not call the analyst.
  if (config.killSwitch) {
    await sendMessage('⏸️ Experiment paused (kill switch on). No proposals this cycle.');
    return { paused: true };
  }

  const { led, portfolio, report } = await gatherState();

  const analyst = await runAnalyst({ portfolio, report });
  const { accepted, rejected } = validateProposals(analyst.proposals, portfolio, {
    allowSpeculative: config.allowSpeculative,
    allowExotic: config.allowExotic,
  });

  // Stay silent when there's nothing to act on. This is the common case for a
  // low-turnover strategy — we only ping when the analyst has surfaced a real
  // opportunity. Everything else is logged to the run for the record only.
  if (accepted.length === 0) {
    console.log(`No actionable proposal this screen. cycle_note: ${analyst.cycle_note}`);
    if (analyst.do_nothing_is_correct_if) console.log(`do_nothing_is_correct_if: ${analyst.do_nothing_is_correct_if}`);
    for (const r of rejected) {
      console.log(`Guardrail-blocked: ${r.proposal.action} ${r.proposal.instrument} — ${r.reasons.join('; ')}`);
    }
    return { paused: false, accepted: 0, rejected: rejected.length, messaged: false };
  }

  // There IS an opportunity — introduce it, then send each proposal to approve.
  const header = [`💡 Screened a new opportunity — ${report.date}`, analyst.cycle_note].filter(Boolean).join('\n');
  await sendMessage(header);

  for (const p of accepted) {
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

  // Since we're already messaging, surface any guardrail rejections for context.
  for (const r of rejected) {
    await sendMessage(
      `🚫 Guardrail blocked: ${r.proposal.action?.toUpperCase()} ${r.proposal.instrument}\n` +
        r.reasons.map((x) => `• ${x}`).join('\n'),
    );
  }

  await saveLedger(led);
  return { paused: false, accepted: accepted.length, rejected: rejected.length, messaged: true };
}

// Run when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  runCycle()
    .then((r) => console.log('cycle:', JSON.stringify(r)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
