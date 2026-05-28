import { log } from './logger';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

export interface FetchOpts extends RequestInit {
  /** Per-call timeout. Defaults to 30s. */
  timeoutMs?: number;
  /** Number of retries on network errors / 5xx. Defaults to 3. */
  retries?: number;
  /** Hook to compute backoff in ms for retry attempt N (0-indexed). */
  backoffMs?: (attempt: number) => number;
}

/**
 * `fetch` with timeout, exponential backoff, and structured error logging.
 * Returns the Response untouched — callers parse JSON / decide what to do
 * with status codes (we don't throw on 4xx).
 *
 * If `opts.signal` is supplied, it is combined with the per-attempt timeout
 * signal so the external aborter and the timeout both kill the request.
 */
export async function fetchWithRetry(url: string, opts: FetchOpts = {}): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    backoffMs = (attempt) => BASE_BACKOFF_MS * 2 ** attempt,
    signal: externalSignal,
    ...init
  } = opts;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (externalSignal?.aborted) throw externalSignal.reason ?? new HttpError('aborted', { url });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort(externalSignal!.reason);
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
      if ((res.status >= 500 || res.status === 429) && attempt < retries) {
        const wait = backoffMs(attempt);
        log.warn('http retry', { url, status: res.status, attempt, wait_ms: wait });
        await sleep(wait);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
      if (externalSignal?.aborted) throw err;
      lastError = err;
      if (attempt < retries) {
        const wait = backoffMs(attempt);
        log.warn('http error retry', { url, attempt, wait_ms: wait, err: String(err) });
        await sleep(wait);
        continue;
      }
    }
  }
  throw new HttpError(`fetch failed after ${retries + 1} attempts`, { url, cause: lastError });
}

export class HttpError extends Error {
  readonly url: string;
  override readonly cause?: unknown;
  constructor(message: string, opts: { url: string; cause?: unknown }) {
    super(message);
    this.name = 'HttpError';
    this.url = opts.url;
    this.cause = opts.cause;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
