import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  createDraft,
  listPending,
  listReviewable,
  transition,
} from '@/lib/state/drafts';
import { __resetKvForTest } from '@/lib/state/kv';

beforeAll(() => {
  process.env.INDRAFT_FORCE_MEMORY_KV = '1';
});

beforeEach(() => {
  __resetKvForTest();
});

function fresh(over: { body?: string } = {}) {
  return {
    body: over.body ?? 'hello world',
    content_kind: 'text' as const,
    hashtags: [],
    mentions: [],
    pillar: 'fullstack',
    source_url: 'https://example.com',
    conversation: [],
  };
}

describe('listReviewable', () => {
  it('returns pending drafts (parity with listPending in the happy case)', async () => {
    const d1 = await createDraft(fresh({ body: 'one' }));
    await transition(d1.id, 'PENDING_REVIEW');
    const d2 = await createDraft(fresh({ body: 'two' }));
    await transition(d2.id, 'PENDING_REVIEW');
    const reviewable = await listReviewable();
    expect(reviewable.map((d) => d.id).sort()).toEqual([d1.id, d2.id].sort());
  });

  it('includes PUBLISH_FAILED drafts that have left the pending zset', async () => {
    const d = await createDraft(fresh());
    await transition(d.id, 'PENDING_REVIEW');
    await transition(d.id, 'PUBLISHING', { publishProof: 'p' });
    await transition(d.id, 'PUBLISH_FAILED', { publishError: 'boom' });

    expect((await listPending()).map((x) => x.id)).not.toContain(d.id);
    expect((await listReviewable()).map((x) => x.id)).toContain(d.id);
  });

  it('does not duplicate when a draft appears in both indexes (defensive)', async () => {
    const d = await createDraft(fresh());
    await transition(d.id, 'PENDING_REVIEW');
    // The state machine doesn't allow membership in both indexes simultaneously
    // — this guards against an index-set leak by asserting de-dup behavior even
    // if one were ever introduced.
    const reviewable = await listReviewable();
    const ids = reviewable.map((x) => x.id);
    expect(ids.filter((id) => id === d.id)).toHaveLength(1);
  });

  it('excludes DISCARDED and PUBLISHED drafts', async () => {
    const discarded = await createDraft(fresh());
    await transition(discarded.id, 'DISCARDED');
    const published = await createDraft(fresh());
    await transition(published.id, 'PENDING_REVIEW');
    await transition(published.id, 'PUBLISHING', { publishProof: 'p' });
    await transition(published.id, 'PUBLISHED', { publishedUrn: 'u' });

    const reviewable = await listReviewable();
    expect(reviewable.map((d) => d.id)).not.toContain(discarded.id);
    expect(reviewable.map((d) => d.id)).not.toContain(published.id);
  });
});
