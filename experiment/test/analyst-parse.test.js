import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalystJson } from '../src/analyst.js';

test('parses clean JSON', () => {
  const obj = parseAnalystJson('{"cycle_note":"hold","proposals":[],"do_nothing_is_correct_if":"x"}');
  assert.equal(obj.cycle_note, 'hold');
  assert.deepEqual(obj.proposals, []);
});

test('tolerates a ```json code fence', () => {
  const obj = parseAnalystJson('```json\n{"proposals":[{"action":"buy"}]}\n```');
  assert.equal(obj.proposals[0].action, 'buy');
});

test('extracts JSON embedded in surrounding prose', () => {
  const obj = parseAnalystJson('Here you go:\n{"cycle_note":"n","proposals":[]}\nThanks!');
  assert.equal(obj.cycle_note, 'n');
});

test('throws on genuinely non-JSON', () => {
  assert.throws(() => parseAnalystJson('no json at all here'));
});
