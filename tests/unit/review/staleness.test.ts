import { describe, it, expect } from 'vitest';
import { isStale, hoursSinceUpdate } from '@/lib/review/staleness';
import { ONE_HOUR_MS } from '@/lib/util/time';
import type { Draft } from '@/lib/types';

const mk = (hoursAgo: number): Draft => ({
  id: 'd',
  version: 1,
  status: 'PENDING_REVIEW',
  body: '',
  hashtags: [],
  mentions: [],
  pillar: 'x',
  source_url: 'https://x',
  conversation: [],
  content_kind: 'text',
  created_at: 0,
  updated_at: Date.now() - hoursAgo * ONE_HOUR_MS,
});

describe('isStale', () => {
  it('false before the threshold', () => {
    expect(isStale(mk(24), 48)).toBe(false);
  });
  it('false right at the threshold (strictly greater)', () => {
    expect(isStale(mk(48), 48)).toBe(false);
  });
  it('true past the threshold', () => {
    expect(isStale(mk(72), 48)).toBe(true);
  });
});

describe('hoursSinceUpdate', () => {
  it('returns ~hoursAgo', () => {
    expect(hoursSinceUpdate(mk(5))).toBeCloseTo(5, 1);
  });
});
