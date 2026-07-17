// Pure parser for the fill replies the human sends back, e.g.
//   "filled 3.4 shares @ 142.10 DKK"
//   "filled 3.4 @ 142.10"
//   "filled at market"          → shares/price unknown; marked estimated
//   "bought 2 @ 99,5 kr fee 29" → Danish decimal comma + fee tolerated
//
// Returns a partial fill description, or null if the text isn't a fill at all.

const FILL_TRIGGER = /\b(filled|fill|bought|sold|købt|solgt|fyldt)\b/i;

function num(s) {
  if (s == null) return null;
  // Tolerate Danish decimal comma and thousands separators.
  const cleaned = String(s).replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} text
 * @returns {null | { shares: number|null, price_dkk: number|null, fee_dkk: number|null,
 *                     atMarket: boolean, est_or_confirmed: 'estimated'|'confirmed' }}
 */
export function parseFill(text) {
  if (!text || !FILL_TRIGGER.test(text)) return null;

  const atMarket = /\bat market\b|\bmarket\b|\btil marked\b/i.test(text);

  // shares: a number before "shares"/"sh"/"stk", or the first number after the trigger.
  let shares = null;
  const sharesMatch = text.match(/([\d.,]+)\s*(?:shares?|sh|stk|aktier)\b/i);
  if (sharesMatch) shares = num(sharesMatch[1]);

  // price: number after @ or "at"/"@"/"a"/"til".
  let price = null;
  const priceMatch = text.match(/(?:@|\bat\b|\btil\b)\s*([\d.,]+)/i);
  if (priceMatch) price = num(priceMatch[1]);

  // fee: number after "fee"/"gebyr"/"kurtage".
  let fee = null;
  const feeMatch = text.match(/(?:fee|gebyr|kurtage)\s*([\d.,]+)/i);
  if (feeMatch) fee = num(feeMatch[1]);

  // Fallback: "filled 3.4 @ 142.10" — first number = shares, @number = price.
  if (shares == null && !atMarket) {
    const m = text.match(/\b(?:filled|fill|bought|sold|købt|solgt)\b[^\d]*([\d.,]+)/i);
    if (m) shares = num(m[1]);
  }

  // Total consideration: "for 2677,60 dkk" — the natural way people report a
  // fill. When there's no explicit @price, derive per-share price from it.
  if (price == null && shares) {
    const totalMatch = text.match(/\bfor\s*([\d.,]+)\s*(?:dkk|kr)\b/i);
    const total = totalMatch ? num(totalMatch[1]) : null;
    if (total != null && total > 0) price = total / shares;
  }

  const confirmed = price != null && !atMarket;
  return {
    shares,
    price_dkk: price,
    fee_dkk: fee,
    atMarket,
    est_or_confirmed: confirmed ? 'confirmed' : 'estimated',
  };
}
