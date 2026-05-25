import { getKv } from './kv';
import { k } from './keys';

interface BackoffState {
  next_retry_at: number;
  attempt: number;
}

const BASE_MS = 1000;

export async function recordFailure(provider: string): Promise<BackoffState> {
  const kv = getKv();
  const current = (await kv.get<BackoffState>(k.ratelimit(provider))) ?? {
    next_retry_at: 0,
    attempt: 0,
  };
  const attempt = current.attempt + 1;
  const wait = Math.min(BASE_MS * 2 ** attempt, 60 * 60 * 1000); // cap 1h
  const next: BackoffState = { next_retry_at: Date.now() + wait, attempt };
  await kv.set(k.ratelimit(provider), next, { ex: 3600 });
  return next;
}

export async function canRetry(provider: string): Promise<boolean> {
  const state = await getKv().get<BackoffState>(k.ratelimit(provider));
  if (!state) return true;
  return Date.now() >= state.next_retry_at;
}

export async function clearBackoff(provider: string): Promise<void> {
  await getKv().del(k.ratelimit(provider));
}
