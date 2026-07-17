// TELEGRAM adapter. The only outward channel. Sends trade proposals with
// [✅ Approve] [✏️ Modify] [❌ Reject] buttons and performance reports, and reads
// back the user's button taps and fill replies. It cannot place orders — only
// the human can, by hand, in Pluto/Nordnet.

import { config } from './config.js';

const API = (method) => `https://api.telegram.org/bot${config.telegramBotToken}/${method}`;

async function call(method, body) {
  if (!config.telegramBotToken) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  const res = await fetch(API(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description}`);
  return data.result;
}

export async function sendMessage(text, extra = {}) {
  return call('sendMessage', {
    chat_id: config.telegramChatId,
    text,
    disable_web_page_preview: true,
    ...extra,
  });
}

/** Render a proposal as a human-readable message + Approve/Modify/Reject keyboard. */
export async function sendProposal(proposal, proposalId) {
  const text = formatProposal(proposal);
  return sendMessage(text, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `apr:${proposalId}` },
          { text: '✏️ Modify', callback_data: `mod:${proposalId}` },
          { text: '❌ Reject', callback_data: `rej:${proposalId}` },
        ],
      ],
    },
  });
}

export function formatProposal(p) {
  const L = [];
  L.push(`💡 Proposal: ${p.action?.toUpperCase()} ${p.instrument}${p.ticker ? ` (${p.ticker})` : ''}`);
  if (Number.isFinite(p.target_weight_pct)) L.push(`Target weight: ${p.target_weight_pct}%`);
  if (Number.isFinite(p.approx_dkk)) L.push(`Approx size: ~${Math.round(p.approx_dkk)} DKK`);
  if (p.thesis) L.push(`Thesis: ${p.thesis}`);
  if (p.quality_criteria_met?.length) L.push(`Quality: ${p.quality_criteria_met.join(', ')}`);
  if (p.valuation_note) L.push(`Valuation: ${p.valuation_note}`);
  if (p.what_would_make_this_wrong) L.push(`Wrong if: ${p.what_would_make_this_wrong}`);
  if (p.tax_note) L.push(`Tax: ${p.tax_note}`);
  if (p.is_speculative) L.push('⚠️ Tagged SPECULATIVE (tracked separately).');
  L.push('');
  L.push('After you place the order, REPLY to this message (swipe it) with the fill, e.g.:');
  L.push('"filled 3.4 shares @ 142.10 DKK" · "sold 8,03 shares for 2677,60 dkk" · or "filled at market".');
  return L.join('\n');
}

export async function answerCallback(callbackQueryId, text) {
  return call('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
}

/** Append a status line under a proposal message once it's approved/rejected. */
export async function annotateMessage(messageId, originalText, suffix) {
  return call('editMessageText', {
    chat_id: config.telegramChatId,
    message_id: messageId,
    text: `${originalText}\n\n${suffix}`,
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [] },
  });
}

/**
 * Fetch new updates since `offset`. Returns the raw update list; the caller is
 * responsible for advancing the stored offset to highest update_id + 1.
 */
export async function getUpdates(offset) {
  return call('getUpdates', {
    offset: offset ? offset + 1 : undefined,
    timeout: 0,
    allowed_updates: ['message', 'callback_query'],
  });
}
