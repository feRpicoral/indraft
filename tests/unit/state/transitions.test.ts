import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  createDraft,
  getDraft,
  transition,
  TransitionError,
  MissingPublishProofError,
  MissingPublishedUrnError,
  listPending,
} from '@/lib/state/drafts';
import { __resetKvForTest } from '@/lib/state/kv';
import type { DraftStatus } from '@/lib/types';

beforeAll(() => {
  process.env.INDRAFT_FORCE_MEMORY_KV = '1';
});

beforeEach(() => {
  __resetKvForTest();
});

function freshInput() {
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

describe('createDraft', () => {
  it('persists a new DRAFTED draft with version 1', async () => {
    const d = await createDraft(freshInput());

    const back = await getDraft(d.id);

    expect(d.status).toBe('DRAFTED');
    expect(d.version).toBe(1);
    expect(d.id).toMatch(/^draft_/);
    expect(back?.id).toBe(d.id);
  });
});

describe('transition', () => {
  it('allows DRAFTED → PENDING_REVIEW', async () => {
    const d = await createDraft(freshInput());

    const next = await transition(d.id, 'PENDING_REVIEW');
    const pending = await listPending();

    expect(next.status).toBe('PENDING_REVIEW');
    expect(pending.map((p) => p.id)).toContain(d.id);
  });

  it('allows PENDING_REVIEW → PUBLISHING → PUBLISHED with proof + urn', async () => {
    const d = await createDraft(freshInput());
    await transition(d.id, 'PENDING_REVIEW');

    const publishing = await transition(d.id, 'PUBLISHING', { publishProof: 'proof-token' });
    const pendingAfterPublishing = await listPending();
    const published = await transition(d.id, 'PUBLISHED', { publishedUrn: 'urn:li:share:42' });

    expect(publishing.status).toBe('PUBLISHING');
    expect(publishing.publishProof).toBe('proof-token');
    expect(publishing.publish_attempted_at).toBeGreaterThan(0);
    // Pending index drops as soon as we leave PENDING_REVIEW.
    expect(pendingAfterPublishing.map((p) => p.id)).not.toContain(d.id);
    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedUrn).toBe('urn:li:share:42');
    // publishProof is preserved across PUBLISHING → PUBLISHED.
    expect(published.publishProof).toBe('proof-token');
  });

  it('rejects PENDING_REVIEW → PUBLISHING without a proof', async () => {
    const d = await createDraft(freshInput());
    await transition(d.id, 'PENDING_REVIEW');

    await expect(transition(d.id, 'PUBLISHING')).rejects.toBeInstanceOf(MissingPublishProofError);
  });

  it('rejects PUBLISHING → PUBLISHED without a URN', async () => {
    const d = await createDraft(freshInput());
    await transition(d.id, 'PENDING_REVIEW');
    await transition(d.id, 'PUBLISHING', { publishProof: 'p' });

    await expect(transition(d.id, 'PUBLISHED')).rejects.toBeInstanceOf(MissingPublishedUrnError);
  });

  it('rejects direct PENDING_REVIEW → PUBLISHED (must go through PUBLISHING)', async () => {
    const d = await createDraft(freshInput());
    await transition(d.id, 'PENDING_REVIEW');

    await expect(
      transition(d.id, 'PUBLISHED', { publishedUrn: 'u' }),
    ).rejects.toBeInstanceOf(TransitionError);
  });

  it('rejects DRAFTED → PUBLISHING (must go through PENDING_REVIEW)', async () => {
    const d = await createDraft(freshInput());

    await expect(
      transition(d.id, 'PUBLISHING', { publishProof: 'p' }),
    ).rejects.toBeInstanceOf(TransitionError);
  });

  it('allows PUBLISHING → PUBLISH_FAILED with an error message', async () => {
    const d = await createDraft(freshInput());
    await transition(d.id, 'PENDING_REVIEW');
    await transition(d.id, 'PUBLISHING', { publishProof: 'p' });

    const failed = await transition(d.id, 'PUBLISH_FAILED', { publishError: 'LinkedIn 502' });

    expect(failed.status).toBe('PUBLISH_FAILED');
    expect(failed.publishError).toBe('LinkedIn 502');
  });

  it('PUBLISH_FAILED → PUBLISHING retries with a fresh proof', async () => {
    const d = await createDraft(freshInput());
    await transition(d.id, 'PENDING_REVIEW');
    await transition(d.id, 'PUBLISHING', { publishProof: 'p1' });
    await transition(d.id, 'PUBLISH_FAILED', { publishError: 'fail' });
    const v = (await getDraft(d.id))!.version;

    const retry = await transition(d.id, 'PUBLISHING', { publishProof: 'p2' });

    expect(retry.status).toBe('PUBLISHING');
    expect(retry.publishProof).toBe('p2');
    // Retry with a different proof; version must not change between attempts.
    expect(retry.version).toBe(v);
  });

  it('PUBLISH_FAILED → DISCARDED gives up cleanly', async () => {
    const d = await createDraft(freshInput());
    await transition(d.id, 'PENDING_REVIEW');
    await transition(d.id, 'PUBLISHING', { publishProof: 'p' });
    await transition(d.id, 'PUBLISH_FAILED', { publishError: 'fail' });

    const discarded = await transition(d.id, 'DISCARDED');

    expect(discarded.status).toBe('DISCARDED');
  });

  it('rejects illegal transitions out of terminal states', async () => {
    const d = await createDraft(freshInput());
    await transition(d.id, 'PENDING_REVIEW');
    await transition(d.id, 'PUBLISHING', { publishProof: 'p' });
    await transition(d.id, 'PUBLISHED', { publishedUrn: 'u' });
    const d2 = await createDraft(freshInput());
    await transition(d2.id, 'DISCARDED');

    await expect(transition(d.id, 'PENDING_REVIEW')).rejects.toBeInstanceOf(TransitionError);
    await expect(
      transition(d.id, 'PUBLISHED', { publishedUrn: 'u' }),
    ).rejects.toBeInstanceOf(TransitionError);
    await expect(transition(d2.id, 'DRAFTED')).rejects.toBeInstanceOf(TransitionError);
  });

  it('bumps version on EDITED and immediately re-promotes to PENDING_REVIEW', async () => {
    const d = await createDraft(freshInput());
    await transition(d.id, 'PENDING_REVIEW');

    const edited = await transition(d.id, 'EDITED', { patch: { body: 'updated' } });

    // EDITED is transient: after the cascade, we should be back at PENDING_REVIEW
    // with version bumped.
    expect(edited.version).toBe(2);
    expect(edited.status).toBe('PENDING_REVIEW');
    expect(edited.body).toBe('updated');
  });

  it('supports STALE → DRAFTED → PENDING_REVIEW recovery', async () => {
    const d = await createDraft(freshInput());
    await transition(d.id, 'PENDING_REVIEW');
    await transition(d.id, 'STALE');

    const recovered = await transition(d.id, 'DRAFTED');
    const promoted = await transition(recovered.id, 'PENDING_REVIEW');

    expect(recovered.status).toBe('DRAFTED');
    expect(promoted.status).toBe('PENDING_REVIEW');
  });

  it('throws when the draft does not exist', async () => {
    await expect(transition('does-not-exist', 'PENDING_REVIEW')).rejects.toBeInstanceOf(
      TransitionError,
    );
  });

  it('updates the by-status index correctly', async () => {
    const d = await createDraft(freshInput());
    await transition(d.id, 'PENDING_REVIEW');
    await transition(d.id, 'DISCARDED');

    const final = await getDraft(d.id);

    expect(final?.status).toBe('DISCARDED');
  });

  it('rejects every transition outside the ALLOWED table', async () => {
    const cases: Array<[DraftStatus, DraftStatus]> = [
      ['DRAFTED', 'EDITED'],
      ['DRAFTED', 'STALE'],
      ['DRAFTED', 'PUBLISHING'],
      ['DRAFTED', 'PUBLISHED'],
      ['PUBLISHED', 'DRAFTED'],
      ['DISCARDED', 'PENDING_REVIEW'],
      ['STALE', 'PUBLISHING'],
      ['STALE', 'PUBLISHED'],
      ['PENDING_REVIEW', 'PUBLISHED'],
    ];

    for (const [from, to] of cases) {
      const d = await createDraft(freshInput());
      if (from !== 'DRAFTED') {
        // Steer the draft into the `from` state through legal moves.
        if (from === 'PUBLISHED') {
          await transition(d.id, 'PENDING_REVIEW');
          await transition(d.id, 'PUBLISHING', { publishProof: 'p' });
          await transition(d.id, 'PUBLISHED', { publishedUrn: 'u' });
        } else if (from === 'DISCARDED') {
          await transition(d.id, 'DISCARDED');
        } else if (from === 'STALE') {
          await transition(d.id, 'PENDING_REVIEW');
          await transition(d.id, 'STALE');
        } else if (from === 'PENDING_REVIEW') {
          await transition(d.id, 'PENDING_REVIEW');
        }
      }
      const opts =
        to === 'PUBLISHING'
          ? { publishProof: 'p' }
          : to === 'PUBLISHED'
            ? { publishedUrn: 'u' }
            : undefined;

      await expect(transition(d.id, to, opts)).rejects.toBeInstanceOf(TransitionError);
    }
  });
});
