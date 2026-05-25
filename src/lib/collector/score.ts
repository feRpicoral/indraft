import type { SourceItem } from '../types';
import { ONE_DAY_MS } from '../util/time';

/**
 * Freshness score: 1.0 for items < 6h old, decays linearly to 0 over 7 days,
 * 0 thereafter. Items with a future timestamp are clamped to "now".
 */
export function freshnessScore(item: SourceItem, now = Date.now()): number {
  const ageMs = Math.max(0, now - item.published_at);
  if (ageMs < 6 * 60 * 60 * 1000) return 1.0;
  const days = ageMs / ONE_DAY_MS;
  if (days >= 7) return 0;
  return 1 - days / 7;
}

export function withScores(items: SourceItem[], now = Date.now()): SourceItem[] {
  return items.map((it) => ({ ...it, score: freshnessScore(it, now) }));
}

export function sortByScore(items: SourceItem[]): SourceItem[] {
  return [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
