// Central configuration. Reads env, then exposes the strategy rules and the
// hard guardrail limits from section 5 of the design doc. Everything here is a
// constant or read from the environment — no business logic.

/** @returns {string|undefined} */
function env(name) {
  const v = process.env[name];
  if (v === undefined) return undefined;
  // Trim stray whitespace/newlines that sneak in when pasting secrets.
  const trimmed = v.trim();
  return trimmed === '' ? undefined : trimmed;
}

function bool(name, fallback = false) {
  const v = env(name);
  if (v === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(v);
}

export const config = {
  // Secrets / endpoints
  anthropicApiKey: env('ANTHROPIC_API_KEY'),
  telegramBotToken: env('TELEGRAM_BOT_TOKEN'),
  telegramChatId: env('TELEGRAM_CHAT_ID'),

  // The analyst model. Judgment only — never used to compute numbers.
  analystModel: env('ANALYST_MODEL') ?? 'claude-opus-4-8',

  // Section 8 — the two things only the human sets.
  taxWrapper: (env('TAX_WRAPPER') ?? 'depot').toLowerCase(), // 'depot' | 'ask'
  primaryBenchmark: (env('PRIMARY_BENCHMARK') ?? 'msci_world').toLowerCase(), // 'msci_world' | 'sp500'

  // Switches.
  killSwitch: bool('KILL_SWITCH', false),
  allowSpeculative: bool('ALLOW_SPECULATIVE', false),
  allowExotic: bool('ALLOW_EXOTIC', false),
};

// Strategy rules — fed to the analyst as context, also referenced by guardrails.
export const STRATEGY = {
  depositDkk: 20000,
  targetPositions: 8,
  targetWeightPct: 12.5, // 100 / 8
  // Section 5 hard guardrails (sized for 20,000 DKK).
  maxSinglePositionPct: 20, // hard cap, non-ETF
  minCashBufferPct: 5,
  maxChangesPerWeek: 2,
  maxSectorNames: 2,
  speculative: {
    maxPositions: 1,
    maxWeightPct: 10,
  },
};

// Benchmarks. Tickers are the market-data adapter's symbols (Yahoo Finance).
// MSCI World is proxied by URTH (iShares MSCI World ETF, USD); S&P 500 by ^GSPC.
// These are levels for the since-inception ratio — the bookkeeper never needs
// them in DKK because a benchmark *return* is currency-neutral as a ratio.
export const BENCHMARKS = {
  msci_world: { key: 'msci_world', label: 'MSCI World', symbol: 'URTH' },
  sp500: { key: 'sp500', label: 'S&P 500', symbol: '^GSPC' },
};

export function primaryBenchmark() {
  return BENCHMARKS[config.primaryBenchmark] ?? BENCHMARKS.msci_world;
}

export function secondaryBenchmark() {
  return config.primaryBenchmark === 'sp500' ? BENCHMARKS.msci_world : BENCHMARKS.sp500;
}
