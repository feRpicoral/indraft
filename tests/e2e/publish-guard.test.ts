/**
 * Publish-guard invariant — the load-bearing safety test.
 *
 * Proves at the unit level that the publish path is reachable ONLY through:
 *   1. A draft in status PENDING_REVIEW
 *   2. With the version the assertion was bound to
 *   3. With a publishProof token (representing a verified assertion)
 *
 * Any other shape is blocked by `transition()`. The route handler at
 * src/app/api/review/publish/route.ts is the only HTTP surface that supplies
 * a publishProof; this test reasons about every input path that could reach
 * it and confirms the state machine rejects them.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  createDraft,
  transition,
  TransitionError,
  MissingPublishProofError,
  getDraft,
} from '@/lib/state/drafts';
import { __resetKvForTest } from '@/lib/state/kv';
import { challengeFor } from '@/lib/review';

beforeAll(() => {
  process.env.INDRAFT_FORCE_MEMORY_KV = '1';
});
beforeEach(() => {
  __resetKvForTest();
});

const fresh = () => ({
  body: 'Hello world',
  content_kind: 'text' as const,
  hashtags: [],
  mentions: [],
  pillar: 'fullstack',
  source_url: 'https://example.com/x',
  conversation: [],
});

describe('publish-guard invariant', () => {
  it('PUBLISHING requires a publishProof (no proof → throw)', async () => {
    const d = await createDraft(fresh());
    await transition(d.id, 'PENDING_REVIEW');

    await expect(transition(d.id, 'PUBLISHING')).rejects.toBeInstanceOf(MissingPublishProofError);
    const after = await getDraft(d.id);

    expect(after?.status).toBe('PENDING_REVIEW');
  });

  it('PUBLISHING requires PENDING_REVIEW or PUBLISH_FAILED as the source state', async () => {
    const d = await createDraft(fresh());

    // From DRAFTED — illegal
    await expect(
      transition(d.id, 'PUBLISHING', { publishProof: 'p' }),
    ).rejects.toBeInstanceOf(TransitionError);
    // From DISCARDED — illegal
    await transition(d.id, 'DISCARDED');
    await expect(
      transition(d.id, 'PUBLISHING', { publishProof: 'p' }),
    ).rejects.toBeInstanceOf(TransitionError);
  });

  it('STALE → PUBLISHING is rejected (must recover via DRAFTED first)', async () => {
    const d = await createDraft(fresh());
    await transition(d.id, 'PENDING_REVIEW');
    await transition(d.id, 'STALE');

    await expect(
      transition(d.id, 'PUBLISHING', { publishProof: 'p' }),
    ).rejects.toBeInstanceOf(TransitionError);
  });

  it('challengeFor is sensitive to body, version, and id', () => {
    const c1 = challengeFor({ id: 'd1', version: 1, body: 'A' });
    const c2 = challengeFor({ id: 'd1', version: 1, body: 'A' });

    expect(c1).toBe(c2); // deterministic
    expect(challengeFor({ id: 'd1', version: 1, body: 'A' })).not.toBe(
      challengeFor({ id: 'd1', version: 1, body: 'B' }),
    );
    expect(challengeFor({ id: 'd1', version: 1, body: 'A' })).not.toBe(
      challengeFor({ id: 'd1', version: 2, body: 'A' }),
    );
    expect(challengeFor({ id: 'd1', version: 1, body: 'A' })).not.toBe(
      challengeFor({ id: 'd2', version: 1, body: 'A' }),
    );
  });

  it('EDIT bumps version and a stale assertion against the old version would not match', async () => {
    const d = await createDraft(fresh());
    await transition(d.id, 'PENDING_REVIEW');
    const v1 = (await getDraft(d.id))!;
    const challengeAtV1 = challengeFor(v1);

    await transition(d.id, 'EDITED', { patch: { body: 'Edited' } });
    const v2 = (await getDraft(d.id))!;
    const challengeAtV2 = challengeFor(v2);

    expect(v2.version).toBe(2);
    // Captured assertion bound to v1 would carry challengeAtV1; the route compares
    // against challengeFor(currentDraft) === challengeAtV2 and rejects.
    expect(challengeAtV1).not.toBe(challengeAtV2);
  });

  it('Terminal states cannot leave (no PUBLISHED → anything)', async () => {
    const d = await createDraft(fresh());
    await transition(d.id, 'PENDING_REVIEW');
    await transition(d.id, 'PUBLISHING', { publishProof: 'p' });
    await transition(d.id, 'PUBLISHED', { publishedUrn: 'u' });

    await expect(transition(d.id, 'PENDING_REVIEW')).rejects.toBeInstanceOf(TransitionError);
    await expect(transition(d.id, 'EDITED')).rejects.toBeInstanceOf(TransitionError);
    await expect(transition(d.id, 'DISCARDED')).rejects.toBeInstanceOf(TransitionError);
  });

  it('content_kind change still requires a publishProof to enter PUBLISHING', async () => {
    const d = await createDraft({ ...fresh(), content_kind: 'text' });
    await transition(d.id, 'PENDING_REVIEW');

    // Switch to article via an EDITED transition — version bumps, no publish gained.
    const edited = await transition(d.id, 'EDITED', {
      patch: { content_kind: 'article', article: { source: 'https://x/y', title: 'T' } },
    });

    expect(edited.content_kind).toBe('article');
    expect(edited.version).toBe(2);
    // Without proof, publish still rejected.
    await expect(transition(d.id, 'PUBLISHING')).rejects.toBeInstanceOf(MissingPublishProofError);
  });

  it('PUBLISH_FAILED is a retry surface — NOT terminal — and version is preserved', async () => {
    const d = await createDraft(fresh());
    await transition(d.id, 'PENDING_REVIEW');
    const v = (await getDraft(d.id))!.version;
    await transition(d.id, 'PUBLISHING', { publishProof: 'p1' });

    const failed = await transition(d.id, 'PUBLISH_FAILED', { publishError: 'LinkedIn 502' });

    expect(failed.version).toBe(v);
    expect(failed.publishError).toBe('LinkedIn 502');
    // Retry must supply a fresh proof.
    await expect(transition(d.id, 'PUBLISHING')).rejects.toBeInstanceOf(MissingPublishProofError);
    const retry = await transition(d.id, 'PUBLISHING', { publishProof: 'p2' });
    expect(retry.status).toBe('PUBLISHING');
    expect(retry.publishProof).toBe('p2');
    expect(retry.version).toBe(v);
  });

  it('No scheduled / auto path can publish: scheduler never calls transition(_, PUBLISHING|PUBLISHED)', async () => {
    // The scheduler only ever transitions DRAFTED → PENDING_REVIEW (and at most
    // creates a fresh draft). It is structurally impossible for it to call
    // transition(_, "PUBLISHING") or "PUBLISHED" because those branches do not
    // exist in src/lib/scheduler/runScheduledJob.ts.
    // This test is a structural placeholder: greenlight indicates the test
    // suite acknowledges the invariant. The assertion is grep-style on the file.
    const fs = await import('node:fs');

    const src = fs.readFileSync('src/lib/scheduler/runScheduledJob.ts', 'utf8');

    expect(src).not.toMatch(/transition\([^)]*['"]PUBLISHING['"]/);
    expect(src).not.toMatch(/transition\([^)]*['"]PUBLISHED['"]/);
  });
});
