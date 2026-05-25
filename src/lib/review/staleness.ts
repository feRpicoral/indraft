import type { Draft } from '../types';
import { ONE_HOUR_MS } from '../util/time';

export function isStale(draft: Draft, staleAfterHours: number, now = Date.now()): boolean {
  return now - draft.updated_at > staleAfterHours * ONE_HOUR_MS;
}

export function hoursSinceUpdate(draft: Draft, now = Date.now()): number {
  return Math.max(0, (now - draft.updated_at) / ONE_HOUR_MS);
}
