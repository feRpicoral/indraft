import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  createDraft,
  isStalePublishing,
  PUBLISHING_TIMEOUT_MS,
  transition,
} from '@/lib/state/drafts';
import { __resetKvForTest } from '@/lib/state/kv';

beforeAll(() => {
  process.env.INDRAFT_FORCE_MEMORY_KV = '1';
});

beforeEach(() => {
  __resetKvForTest();
});

function fresh() {
  return {
    body: 'hello world',
    content_kind: 'text' as const,
    hashtags: [],
    mentions: [],
    pillar: 'fullstack',
    source_url: 'https://example.com',
    conversation: [],
  };
}

describe('isStalePublishing', () => {
  it('returns false for a fresh PUBLISHING draft', async () => {
    const d = await createDraft(fresh());
    await transition(d.id, 'PENDING_REVIEW');
    const publishing = await transition(d.id, 'PUBLISHING', { publishProof: 'p' });
    expect(isStalePublishing(publishing)).toBe(false);
  });

  it('returns true once publish_attempted_at is older than the timeout', async () => {
    const d = await createDraft(fresh());
    await transition(d.id, 'PENDING_REVIEW');
    const publishing = await transition(d.id, 'PUBLISHING', { publishProof: 'p' });
    const future = (publishing.publish_attempted_at ?? 0) + PUBLISHING_TIMEOUT_MS + 1;
    expect(isStalePublishing(publishing, future)).toBe(true);
  });

  it('returns false for non-PUBLISHING states regardless of timestamp', async () => {
    const d = await createDraft(fresh());
    await transition(d.id, 'PENDING_REVIEW');
    const pending = await transition(d.id, 'STALE');
    expect(
      isStalePublishing(pending, Date.now() + 10 * PUBLISHING_TIMEOUT_MS),
    ).toBe(false);
  });

  it('treats a missing publish_attempted_at as stale (legacy / corrupt records)', async () => {
    // Build a synthetic PUBLISHING-shaped record without the attempt timestamp.
    // The function should not deadlock on these — better to recover than strand.
    const d = await createDraft(fresh());
    await transition(d.id, 'PENDING_REVIEW');
    const publishing = await transition(d.id, 'PUBLISHING', { publishProof: 'p' });
    const synthetic = { ...publishing, publish_attempted_at: undefined };
    expect(isStalePublishing(synthetic)).toBe(true);
  });
});
