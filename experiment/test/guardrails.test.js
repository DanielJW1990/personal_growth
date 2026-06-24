import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProposals, isEtf } from '../src/guardrails.js';

// A simple portfolio: 20,000 total, 18,000 cash, one 2,000 DKK position in A.
function portfolio() {
  return {
    totalValueDkk: 20000,
    cashDkk: 18000,
    cashPct: 90,
    positions: [
      { instrument: 'A', ticker: 'A', marketValueDkk: 2000, weightPct: 10, isSpeculative: false },
    ],
  };
}

test('accepts a sensible buy within all limits', () => {
  const { accepted, rejected } = validateProposals(
    [{ action: 'buy', instrument: 'B', ticker: 'B', approx_dkk: 2500 }],
    portfolio(),
    {},
  );
  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 0);
});

test('rejects a buy that breaches the 20% single-name cap', () => {
  const { accepted, rejected } = validateProposals(
    [{ action: 'buy', instrument: 'A', ticker: 'A', approx_dkk: 3000 }], // 2000+3000=5000 = 25%
    portfolio(),
    {},
  );
  assert.equal(accepted.length, 0);
  assert.match(rejected[0].reasons.join(' '), /single-name cap/);
});

test('ETF is exempt from the single-name cap', () => {
  const { accepted } = validateProposals(
    [{ action: 'buy', instrument: 'iShares MSCI World ETF', ticker: 'URTH', approx_dkk: 6000, is_etf: true }],
    portfolio(),
    {},
  );
  assert.equal(accepted.length, 1);
});

test('rejects a buy that would drop cash under the 5% buffer', () => {
  const pf = portfolio();
  pf.cashDkk = 1500; // 7.5%
  pf.cashPct = 7.5;
  const { rejected } = validateProposals(
    [{ action: 'buy', instrument: 'B', ticker: 'B', approx_dkk: 1000 }], // leaves 500 = 2.5%
    pf,
    {},
  );
  assert.match(rejected[0].reasons.join(' '), /buffer/);
});

test('enforces max 2 changes per week — overflow rejected', () => {
  const proposals = [
    { action: 'buy', instrument: 'B', ticker: 'B', approx_dkk: 1000 },
    { action: 'buy', instrument: 'C', ticker: 'C', approx_dkk: 1000 },
    { action: 'buy', instrument: 'D', ticker: 'D', approx_dkk: 1000 },
  ];
  const { accepted, rejected } = validateProposals(proposals, portfolio(), {});
  assert.equal(accepted.length, 2);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reasons.join(' '), /changes\/week/);
});

test('blocks excluded instrument types unless opted in', () => {
  const exotic = [{ action: 'buy', instrument: 'Bitcoin ETP leveraged 2x', ticker: 'BTC2X', approx_dkk: 500 }];
  const blocked = validateProposals(exotic, portfolio(), { allowExotic: false });
  assert.equal(blocked.accepted.length, 0);
  const allowed = validateProposals(exotic, portfolio(), { allowExotic: true });
  assert.equal(allowed.accepted.length, 1);
});

test('speculative proposals are blocked unless allowed, then weight-capped', () => {
  const spec = [{ action: 'buy', instrument: 'MemeCo', ticker: 'MEME', approx_dkk: 500, is_speculative: true, target_weight_pct: 2 }];
  assert.equal(validateProposals(spec, portfolio(), { allowSpeculative: false }).accepted.length, 0);
  assert.equal(validateProposals(spec, portfolio(), { allowSpeculative: true }).accepted.length, 1);

  const tooBig = [{ action: 'buy', instrument: 'MemeCo', ticker: 'MEME', approx_dkk: 500, is_speculative: true, target_weight_pct: 15 }];
  assert.equal(validateProposals(tooBig, portfolio(), { allowSpeculative: true }).accepted.length, 0);
});

test('isEtf heuristic', () => {
  assert.ok(isEtf({ instrument: 'Vanguard FTSE All-World UCITS ETF', ticker: 'VWCE' }));
  assert.ok(!isEtf({ instrument: 'Novo Nordisk', ticker: 'NOVO-B.CO' }));
  assert.ok(isEtf({ instrument: 'whatever', is_etf: true }));
});
