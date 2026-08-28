import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTransientNetworkError, withRetry } from '../src/net.js';

test('classifies a fetch timeout as transient', () => {
  const err = new Error('The operation was aborted due to timeout');
  err.name = 'TimeoutError';
  assert.equal(isTransientNetworkError(err), true);
});

test('classifies undici "fetch failed" and DNS failures as transient', () => {
  const err = new TypeError('fetch failed');
  err.cause = { code: 'EAI_AGAIN', message: 'getaddrinfo EAI_AGAIN api.telegram.org' };
  assert.equal(isTransientNetworkError(err), true);
});

test('respects an explicit transient tag (HTTP 5xx / 429)', () => {
  const err = new Error('Telegram getUpdates: HTTP 502');
  err.transient = true;
  assert.equal(isTransientNetworkError(err), true);
});

test('a rejected request is NOT transient — it must still alert', () => {
  assert.equal(isTransientNetworkError(new Error('Telegram sendMessage failed: chat not found')), false);
  assert.equal(isTransientNetworkError(new Error('TELEGRAM_BOT_TOKEN is not set')), false);
  assert.equal(isTransientNetworkError(null), false);
});

test('withRetry retries transient failures and then succeeds', async () => {
  let calls = 0;
  const out = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) {
        const err = new Error('fetch failed');
        err.name = 'TimeoutError';
        throw err;
      }
      return 'ok';
    },
    { baseDelayMs: 1 },
  );
  assert.equal(out, 'ok');
  assert.equal(calls, 3);
});

test('withRetry does not retry a real error', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        throw new Error('chat not found');
      },
      { baseDelayMs: 1 },
    ),
    /chat not found/,
  );
  assert.equal(calls, 1);
});

test('withRetry gives up after the attempt budget and rethrows', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        const err = new Error('socket hang up');
        err.name = 'TimeoutError';
        throw err;
      },
      { attempts: 3, baseDelayMs: 1 },
    ),
    /socket hang up/,
  );
  assert.equal(calls, 3);
});
