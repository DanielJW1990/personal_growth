// THE ANALYST — the one LLM call. Judgment, not arithmetic. It looks at the
// world and the portfolio and PROPOSES 0–2 trades with reasoning. It never
// executes and it never originates a performance number. The bookkeeper's
// numbers are passed in as read-only context for the analyst to reason over.

import { config, STRATEGY, primaryBenchmark } from './config.js';

const SYSTEM_PROMPT = `You are a disciplined equity analyst running a long-horizon experiment for a high-risk-tolerance investor. You PROPOSE trades; a human approves and executes every one. You never execute. You have no edge in short-term price prediction and you say so when relevant — your job is selection discipline, not forecasting.

## The strategy you run (do not drift from this)
- Quality-at-a-reasonable-price. Favor companies that are: consistently profitable, high/improving return on invested capital, healthy balance sheet (manageable net debt), durable competitive position, and trading at a valuation not divorced from fundamentals (P/E sensible relative to growth; avoid hype multiples).
- Concentrated and equal-weight: target ~8 positions, ~12.5% each.
- Low turnover is a feature. Default to holding. Only propose a change when a thesis is clearly broken or a clearly better name displaces a weak one. Churn is the enemy in a small account.
- Globally diversified across sectors and geographies; no more than ~2 names from one sector.
- You may use ETFs to fill gaps or hold the cash buffer's worth of exposure.
- Excluded by default: leverage, derivatives, warrants, crypto, penny stocks, and "currently viral on Reddit/social" names. If you ever reference a sentiment/momentum idea, label it explicitly as speculative and never let it exceed one position.

## How to reason each cycle
- Start from "do nothing." Deviate only with a specific, written reason.
- You have a web_search tool. Before deciding, check recent news on each holding (earnings, guidance changes, thesis-relevant events) and on any candidate you consider. Facts you cite must come from what you found or what the bookkeeper supplied — never from stale memory when search contradicts it.
- For any buy: name the quality criteria it meets, the rough valuation, the thesis in 2 sentences, and what would prove the thesis wrong.
- For any sell: state whether the thesis broke or it's a swap, and note this is a taxable/realization event.
- Separate fact (a reported number) from speculation (your view). Label the second.
- Never chase recent performance. If a candidate is up a lot recently, say so and justify buying anyway.

## Output — your FINAL message must be ONLY this JSON object (no prose before or after, no code fences)
{
  "cycle_note": "<=2 sentences: portfolio posture, citing anything material you found in the news",
  "proposals": [
    {
      "action": "buy" | "sell" | "trim" | "add",
      "instrument": "<name>",
      "ticker": "<Yahoo Finance symbol, e.g. NOVO-B.CO, MSFT>",
      "target_weight_pct": <number>,
      "approx_dkk": <number>,
      "thesis": "<2 sentences>",
      "quality_criteria_met": ["...", "..."],
      "valuation_note": "<e.g. P/E ~18 vs ~12% growth>",
      "is_speculative": false,
      "what_would_make_this_wrong": "<disconfirming condition>",
      "tax_note": "<realization impact if a sell>"
    }
  ],
  "do_nothing_is_correct_if": "<when no trade is the right call>"
}

If holding is right, return an empty proposals array and say why in cycle_note. Propose at most 2 changes; fewer is better.`;

// Live news access for the screen — capped so a run can't spiral.
const WEB_SEARCH_TOOL = { type: 'web_search_20260209', name: 'web_search', max_uses: 8 };

function buildUserMessage(portfolio, report, candidateIdeas) {
  const taxWrapper = config.taxWrapper === 'ask' ? 'Aktiesparekonto (ASK)' : 'regular depot';
  const taxNote =
    config.taxWrapper === 'ask'
      ? 'Account is an Aktiesparekonto — flat-rate, mark-to-market taxation; low turnover still matters but each sale is not a discrete realization event.'
      : 'Account is a regular depot — every sale is a realization (taxable) event. Reflect this in tax_note for any sell.';

  const positions = portfolio.positions.map((p) => ({
    instrument: p.instrument,
    ticker: p.ticker,
    weight_pct: p.weightPct == null ? null : Number(p.weightPct.toFixed(1)),
    market_value_dkk: p.marketValueDkk == null ? null : Math.round(p.marketValueDkk),
    unrealized_pl_pct:
      p.unrealizedPlDkk == null || !p.costBasisDkk ? null : Number(((p.unrealizedPlDkk / p.costBasisDkk) * 100).toFixed(1)),
  }));

  const ctx = {
    portfolio_value_dkk: Math.round(portfolio.totalValueDkk),
    cash_dkk: Math.round(portfolio.cashDkk),
    cash_pct: Number(portfolio.cashPct.toFixed(1)),
    positions,
    since_inception_return_pct: report.sinceReturn == null ? null : Number((report.sinceReturn * 100).toFixed(1)),
    primary_benchmark: primaryBenchmark().label,
    benchmark_delta_pct:
      report.benchmarks[primaryBenchmark().key].deltaVsPortfolio == null
        ? null
        : Number((report.benchmarks[primaryBenchmark().key].deltaVsPortfolio * 100).toFixed(1)),
    guardrails: {
      target_positions: STRATEGY.targetPositions,
      target_weight_pct: STRATEGY.targetWeightPct,
      max_single_position_pct: STRATEGY.maxSinglePositionPct,
      min_cash_buffer_pct: STRATEGY.minCashBufferPct,
      max_changes_per_week: STRATEGY.maxChangesPerWeek,
      speculative_allowed: config.allowSpeculative,
    },
    tax_wrapper: taxWrapper,
    candidate_ideas: candidateIdeas ?? [],
  };

  return [
    taxNote,
    '',
    'Here is the current state (all numbers computed by the bookkeeper — treat them as fact; do not recompute them):',
    '```json',
    JSON.stringify(ctx, null, 2),
    '```',
    '',
    'Decide this cycle. Start from "do nothing". Return the structured object.',
  ].join('\n');
}

/**
 * Run one analyst cycle.
 * @returns {Promise<{ cycle_note: string, proposals: object[], do_nothing_is_correct_if: string }>}
 */
export async function runAnalyst({ portfolio, report, candidateIdeas = [] }) {
  if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const base = {
    model: config.analystModel,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    tools: [WEB_SEARCH_TOOL],
  };

  let messages = [{ role: 'user', content: buildUserMessage(portfolio, report, candidateIdeas) }];
  let response = await client.messages.create({ ...base, messages });

  // The server-side search loop can pause mid-turn; re-send to resume.
  for (let i = 0; i < 5 && response.stop_reason === 'pause_turn'; i++) {
    messages = [...messages, { role: 'assistant', content: response.content }];
    response = await client.messages.create({ ...base, messages });
  }

  // With search in play the response interleaves text and tool blocks; the
  // decision JSON is the final text. Try text blocks last-first.
  const texts = response.content.filter((b) => b.type === 'text').map((b) => b.text);
  let lastErr;
  for (let i = texts.length - 1; i >= 0; i--) {
    try {
      const parsed = parseAnalystJson(texts[i]);
      parsed.proposals ??= [];
      return parsed;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('Analyst returned no text output');
}

/**
 * Parse the analyst's reply. The prompt demands bare JSON, but be tolerant of a
 * stray code fence or surrounding prose so a minor format slip never drops a
 * cycle.
 */
export function parseAnalystJson(text) {
  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  let out = tryParse(text);
  if (!out) {
    const fenced = text.replace(/```(?:json)?/gi, '').trim();
    out = tryParse(fenced);
  }
  if (!out) {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last > first) out = tryParse(text.slice(first, last + 1));
  }
  if (!out) throw new Error(`Analyst returned non-JSON output: ${text.slice(0, 200)}`);
  return out;
}
