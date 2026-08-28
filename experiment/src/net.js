// Shared network-failure policy for the two outbound dependencies (Telegram,
// market data). Those calls fail for reasons that have nothing to do with this
// program: a DNS hiccup, a dropped socket, an API having a bad minute. Such
// failures are TRANSIENT — worth retrying, and never worth failing a scheduled
// run over, because the ledger is untouched and the next run catches up.
// Everything else (a bad token, a rejected request, a malformed reply) is a
// real error the operator must see.

/** True for failures caused by the network rather than by our request. */
export function isTransientNetworkError(err) {
  if (!err) return false;
  if (err.transient) return true; // explicitly tagged by a caller (e.g. HTTP 5xx)
  const name = err.name ?? '';
  if (name === 'TimeoutError' || name === 'AbortError') return true;
  // undici reports DNS/connection failures as `TypeError: fetch failed`, with
  // the real reason on `cause`.
  const text = `${err.message ?? ''} ${err.cause?.message ?? ''} ${err.cause?.code ?? ''}`;
  return /fetch failed|network|socket|timeout|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|UND_ERR/i.test(text);
}

/**
 * Run `fn`, retrying only transient failures with exponential backoff.
 * A non-transient error is thrown immediately — retrying a rejected request
 * just wastes time and hides the real problem.
 */
export async function withRetry(fn, { attempts = 3, baseDelayMs = 2000, label = 'request' } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientNetworkError(err) || i === attempts - 1) break;
      const delay = baseDelayMs * 2 ** i;
      console.warn(`${label}: transient failure (${err.message}) — retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
