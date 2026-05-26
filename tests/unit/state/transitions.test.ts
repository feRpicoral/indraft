import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  createDraft,
  getDraft,
  transition,
  TransitionError,
  MissingPublishProofError,
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
    expect(d.status).toBe('DRAFTED');
    expect(d.version).toBe(1);
    expect(d.id).toMatch(/^draft_/);
    const back = await getDraft(d.id);
    expect(back?.id).toBe(d.id);
  });
});

describe('transition', () => {
  it('allows DRAFTED → PENDING_REVIEW', async () => {
    const d = await createDraft(freshInput());
    const next = await transition(d.id, 'PENDING_REVIEW');
    expect(next.status).toBe('PENDING_REVIEW');
    const pending = await listPending();
    expect(pending.map((p) => p.id)).toContain(d.id);
  });

  it('allows PENDING_REVIEW → PUBLISHED with a proof', async () => {
    const d = await createDraft(freshInput());
    await transition(d.id, 'PENDING_REVIEW');
    const next = await transition(d.id, 'PUBLISHED', { publishProof: 'proof-token' });
    expect(next.status).toBe('PUBLISHED');
    expect(next.publishProof).toBe('proof-token');
    const pending = await listPending();
    expect(pending.map((p) => p.id)).not.toContain(d.id);
  });

  it('rejects PENDING_REVIEW → PUBLISHED without a proof', async () => {
    const d = await createDraft(freshInput());
    await transition(d.id, 'PENDING_REVIEW');
    await expect(transition(d.id, 'PUBLISHED')).rejects.toBeInstanceOf(MissingPublishProofError);
  });

  it('rejects DRAFTED → PUBLISHED (must go through PENDING_REVIEW)', async () => {
    const d = await createDraft(freshInput());
    await expect(
      transition(d.id, 'PUBLISHED', { publishProof: 'p' }),
    ).rejects.toBeInstanceOf(TransitionError);
  });

  it('rejects illegal transitions out of terminal states', async () => {
    const d = await createDraft(freshInput());
    await transition(d.id, 'PENDING_REVIEW');
    await transition(d.id, 'PUBLISHED', { publishProof: 'p' });
    await expect(transition(d.id, 'PENDING_REVIEW')).rejects.toBeInstanceOf(TransitionError);
    await expect(
      transition(d.id, 'PUBLISHED', { publishProof: 'p' }),
    ).rejects.toBeInstanceOf(TransitionError);

    const d2 = await createDraft(freshInput());
    await transition(d2.id, 'DISCARDED');
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
    expect(recovered.status).toBe('DRAFTED');
    const promoted = await transition(recovered.id, 'PENDING_REVIEW');
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
      ['DRAFTED', 'PUBLISHED'],
      ['PUBLISHED', 'DRAFTED'],
      ['DISCARDED', 'PENDING_REVIEW'],
      ['STALE', 'PUBLISHED'],
    ];
    for (const [from, to] of cases) {
      const d = await createDraft(freshInput());
      if (from !== 'DRAFTED') {
        // Steer the draft into the `from` state through legal moves.
        if (from === 'PUBLISHED') {
          await transition(d.id, 'PENDING_REVIEW');
          await transition(d.id, 'PUBLISHED', { publishProof: 'p' });
        } else if (from === 'DISCARDED') {
          await transition(d.id, 'DISCARDED');
        } else if (from === 'STALE') {
          await transition(d.id, 'PENDING_REVIEW');
          await transition(d.id, 'STALE');
        }
      }
      await expect(
        transition(d.id, to, to === 'PUBLISHED' ? { publishProof: 'p' } : undefined),
      ).rejects.toBeInstanceOf(TransitionError);
    }
  });
});
