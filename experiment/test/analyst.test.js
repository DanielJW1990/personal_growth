import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickDecisionFromTexts, parseAnalystJson } from '../src/analyst.js';

test('pickDecisionFromTexts: finds the decision object in the last text block', () => {
  const texts = ['Let me check the news…', '{"cycle_note":"holding","proposals":[],"do_nothing_is_correct_if":"theses intact"}'];
  const out = pickDecisionFromTexts(texts);
  assert.equal(out.cycle_note, 'holding');
  assert.deepEqual(out.proposals, []);
});

test('pickDecisionFromTexts: returns null for the prose that broke the Oct-16 cycle', () => {
  const texts = [
    "Based on my review, I verified Microsoft's latest results and checked portfolio posture against the guardrails. Search budget was limited this cycle, but the key thesis-relevant event (MSFT earnings)",
  ];
  assert.equal(pickDecisionFromTexts(texts), null);
});

test('pickDecisionFromTexts: ignores JSON that is not a decision', () => {
  assert.equal(pickDecisionFromTexts(['42', '[1,2,3]', '{"unrelated":true}']), null);
});

test('pickDecisionFromTexts: tolerates a fenced block and defaults proposals', () => {
  const out = pickDecisionFromTexts(['```json\n{"cycle_note":"ok","do_nothing_is_correct_if":"x"}\n```']);
  assert.equal(out.cycle_note, 'ok');
  assert.deepEqual(out.proposals, []);
});

test('pickDecisionFromTexts: empty input is null, not a throw', () => {
  assert.equal(pickDecisionFromTexts([]), null);
});
