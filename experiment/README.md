# The 20,000 DKK Index-Beating Experiment

A **propose → approve → you-execute → confirm-fill** system with Telegram trade
proposals and benchmark-tracked performance reporting. Platform-agnostic — it
works identically whether you place the actual orders in Pluto or Nordnet,
because **the system never touches your brokerage.** The only actor that can
move money is you, with a tap and a manual order.

The honest hypothesis: *"A disciplined, AI-assisted quality basket can beat a
cheap world index over time."* The honest prior: it probably won't. The point is
to find out with real numbers.

---

## The split that keeps this honest

Two jobs, kept strictly separate in code:

- **The analyst** (`src/analyst.js`) — one LLM call. Looks at the world and the
  portfolio and *proposes* 0–2 trades with reasoning. Judgment, not arithmetic.
  It never executes and **never originates a number**.
- **The bookkeeper** (`src/bookkeeper.js`) — plain, pure code. Computes every
  number: portfolio value, returns, benchmark deltas, drawdown, CAGR, turnover,
  hit rate. Reads the ledger and does the math. Fully unit-tested.

The analyst may *narrate* the bookkeeper's numbers in one plain line. It must
never produce them — an LLM will hallucinate a plausible-looking return.

---

## How it runs (the backend)

This repo has no server, so the "backend" is **GitHub Actions**: cron for
scheduling, repository secrets for keys, and the ledger committed back to the
repo as JSON. Nothing else to host.

| Workflow | When | What |
|---|---|---|
| `experiment-cycle.yml` | Weekday mornings (Mon–Fri) | Screens for opportunities → guardrails → Telegram with Approve/Modify/Reject. **Silent unless it finds a real buy/sell idea** |
| `experiment-pulse.yml` | Sun 16:00 UTC | Weekly performance pulse to Telegram |
| `experiment-monthly.yml` | 1st of month | Full monthly report |
| `experiment-handle-updates.yml` | every 15 min | Reads your taps + fill replies, books fills into the ledger |

The opportunity screen runs frequently but only pings you when the analyst surfaces something worth acting on — there is no "here's a trade every week" scheme. Proposals aren't time-sensitive (low-turnover, long-horizon), so you place the approved order whenever the market is next open.

The full loop:

```
Bookkeeper loads LEDGER → pulls prices + benchmark levels
        → Analyst proposes (strict JSON, 0–2 trades, empty is valid)
        → Code validates against hard guardrails (section 5)
        → Telegram: each proposal with [✅ Approve][✏️ Modify][❌ Reject]
        → You tap Approve, place the order yourself in Pluto/Nordnet
        → You reply with the fill: "filled 3.4 shares @ 142.10 DKK"
        → Code appends the fill to the LEDGER. Done.
        → Separately: weekly pulse + monthly report, benchmarked vs MSCI World & S&P 500.
```

No credentials, no order API, no way for the system to trade.

---

## Setup

### 1. Telegram bot
1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the **bot token**.
2. Message your new bot once (so it can message you back).
3. Message [@userinfobot](https://t.me/userinfobot) → copy your numeric **chat id**.

### 2. Anthropic API key
Create a key at the [Claude Console](https://console.claude.com/). The analyst
uses `claude-opus-4-8`.

### 3. GitHub configuration
In the repo: **Settings → Secrets and variables → Actions**.

**Secrets** (encrypted):
- `ANTHROPIC_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

**Variables** (non-secret knobs):
- `TAX_WRAPPER` = `depot` *(your account is a regular depot — every sale is a realization event)*
- `PRIMARY_BENCHMARK` = `msci_world`
- `KILL_SWITCH` = `false`
- `ALLOW_SPECULATIVE` = `false`
- `ALLOW_EXOTIC` = `false`

Then enable Actions for the repo. The workflows commit the updated `data/ledger.json`
back automatically (they have `contents: write`).

### 4. Inception & first positions
- **Inception is stamped automatically** on the first scheduled run: the
  bookkeeper records the date and the current MSCI World / S&P 500 levels, so
  since-inception returns start from the moment the experiment begins. It is
  written once and never rebased.
- The experiment starts as a **single 20,000 DKK lump sum in cash**. As the
  analyst proposes buys and you fill them, positions build up.
- Tickers in fills are the market-data adapter's symbols (Yahoo Finance), e.g.
  `NOVO-B.CO`, `ASML.AS`, `URTH`. The adapter converts each quote to DKK via FX,
  so you can hold names listed in any currency.

---

## Local use

```bash
cd experiment
npm install
cp .env.example .env        # fill in your keys for local runs
npm test                    # runs the pure-core suite (no network/keys needed)
npm run report              # prints pulse + monthly to stdout (needs network, no keys)

npm run cycle               # run a propose cycle now
npm run pulse               # send a pulse now
npm run monthly             # send the monthly report now
npm run handle-updates      # process pending Telegram replies now
```

---

## The ledger (single source of truth)

`data/ledger.json`. Positions, cash, and weights are **derived** from `fills` —
never stored — so there is no reconciliation drift.

```jsonc
{
  "inception": { "date": "...", "deposit_dkk": 20000,
                 "benchmark_levels": { "msci_world": X, "sp500": Y } },
  "fills": [
    { "date", "action": "buy|sell|add|trim", "instrument", "ticker",
      "shares", "price_dkk", "fee_dkk", "est_or_confirmed": "confirmed|estimated" }
  ],
  "snapshots": [ /* derived cache: weekly/monthly value points for period deltas + drawdown */ ],
  "telegram_state": { "last_update_id": 0, "pending": { /* proposal workflow */ } }
}
```

> **If you add cash later**, the simple since-inception return silently mixes in
> deposits and the benchmark comparison becomes meaningless. Switch the
> bookkeeper to time-weighted return first. Today it assumes one lump sum.

---

## Guardrails (enforced in code, section 5)

Any proposal that would breach these is rejected **before** it reaches you
(`src/guardrails.js`, unit-tested):

- Target ~8 positions, equal-weight (~2,500 DKK each). Hard cap any single
  **non-ETF** position at **20%**.
- Cash buffer **≥ 5%**.
- **Max 2** proposed changes per week (overflow rejected).
- Allow-list: listed stocks + ETFs only. Crypto / derivatives / leverage off by
  default (`ALLOW_EXOTIC`).
- Speculative sleeve: max 1 position, max ~10%, off by default (`ALLOW_SPECULATIVE`).
- No hard price stop-losses (they whipsaw long-horizon investors).
- **Kill switch** (`KILL_SWITCH=true`) pauses all proposals and sends "paused".

---

## How we judge it (decided up front)

- **Horizon:** at least 12 months before drawing conclusions.
- **Win condition:** beat **MSCI World**, net of fees and estimated tax, over the
  full window. Beating the S&P only, or a single quarter, doesn't count.
- **Pre-registered honesty:** the monthly verdict states the delta plainly,
  including when losing, and flags beating one index but not the other rather
  than spinning it.
- **Likely outcome, stated in advance:** roughly tracking or slightly trailing
  the index. If that's what happens, the experiment *succeeded* — it answered the
  question — even though the strategy "lost." Until ~12 months, any lead or lag
  is noise, and the reports say so.

---

## Design decisions & caveats

- **Tax wrapper: regular depot.** Each sell is a realization event; the analyst's
  `tax_note` reflects that. Switch `TAX_WRAPPER=ask` if you move to an
  Aktiesparekonto.
- **Primary benchmark: MSCI World** (proxied by the `URTH` ETF), S&P 500 (`^GSPC`)
  secondary. A benchmark *return* is a ratio of index levels, so it's
  currency-neutral — no FX needed for the scoreboard.
- **Cron is UTC.** Sun 17:00 UTC ≈ 18:00 CET in winter, 19:00 CEST in summer.
  Edit the cron lines if you want a fixed local time year-round.
- **`snapshots` is a cache,** not authoritative. Positions and cash always come
  from `fills`; snapshots only provide period-over-period deltas and the
  drawdown series, and can be rebuilt.
- **Market data** uses Yahoo Finance's public endpoint. If a quote is missing,
  that position is excluded from value and flagged in the report rather than
  guessed.

---

## Layout

```
experiment/
  src/
    config.js        env + strategy constants + guardrail limits
    ledger.js        load/save, inception, append fills/snapshots (I/O)
    bookkeeper.js    PURE math: positions, cash, returns, deltas, drawdown, CAGR…
    guardrails.js    PURE: validate proposals against section 5
    report.js        PURE: format weekly pulse + monthly report
    fills-parse.js   PURE: parse "filled 3.4 @ 142.10" replies
    marketdata.js    adapter: quotes + FX→DKK + benchmark levels (Yahoo)
    analyst.js       the one LLM call (Anthropic, strict JSON)
    telegram.js      send proposals/reports, read taps + replies
    state.js         glue: gather ledger + market data → report model
    cycle.js / pulse.js / monthly.js / handle-updates.js   entrypoints
    print-report.js  local: print reports to stdout
  test/              pure-core test suite (node:test, no deps)
  data/ledger.json   the single source of truth
```
