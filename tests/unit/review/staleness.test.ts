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
    const draft = mk(24);

    expect(isStale(draft, 48)).toBe(false);
  });

  it('false right at the threshold (strictly greater)', () => {
    const draft = mk(48);

    expect(isStale(draft, 48)).toBe(false);
  });

  it('true past the threshold', () => {
    const draft = mk(72);

    expect(isStale(draft, 48)).toBe(true);
  });
});

describe('hoursSinceUpdate', () => {
  it('returns ~hoursAgo', () => {
    const draft = mk(5);

    expect(hoursSinceUpdate(draft)).toBeCloseTo(5, 1);
  });
});
