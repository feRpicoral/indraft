import type { Draft, DraftStatus } from '../types';
import { newId } from '../util/id';
import { getKv } from './kv';
import { k } from './keys';

/**
 * Allowed state-machine transitions. Anything not listed is rejected by
 * `transition()`. The publish-guard invariant relies on this table.
 *
 * Publish is a two-step flow:
 *   PENDING_REVIEW → PUBLISHING → PUBLISHED      (happy path)
 *                              → PUBLISH_FAILED  (LinkedIn rejected the post)
 *   PUBLISH_FAILED → PUBLISHING                  (operator retries with a fresh assertion)
 *                  → DISCARDED                   (operator gives up)
 *
 * The intermediate PUBLISHING state is what keeps a publisher failure from
 * stranding a draft as terminal PUBLISHED with no URN.
 */
const ALLOWED: Record<DraftStatus, readonly DraftStatus[]> = {
  DRAFTED: ['PENDING_REVIEW', 'DISCARDED'],
  PENDING_REVIEW: ['PUBLISHING', 'DISCARDED', 'EDITED', 'STALE'],
  PUBLISHING: ['PUBLISHED', 'PUBLISH_FAILED'],
  PUBLISH_FAILED: ['PUBLISHING', 'DISCARDED'],
  EDITED: ['DRAFTED'],
  STALE: ['DRAFTED', 'DISCARDED'],
  PUBLISHED: [],
  DISCARDED: [],
} as const;

export class TransitionError extends Error {
  override name = 'TransitionError';
}

export class MissingPublishProofError extends Error {
  override name = 'MissingPublishProofError';
}

export class MissingPublishedUrnError extends Error {
  override name = 'MissingPublishedUrnError';
}

export type CreateDraftInput = Omit<
  Draft,
  'id' | 'version' | 'created_at' | 'updated_at' | 'status'
>;

export async function createDraft(input: CreateDraftInput): Promise<Draft> {
  const kv = getKv();
  const now = Date.now();
  const draft: Draft = {
    ...input,
    id: newId('draft'),
    version: 1,
    status: 'DRAFTED',
    created_at: now,
    updated_at: now,
  };
  await kv.set(k.draft(draft.id), draft);
  await kv.sadd(k.draftIndexByStatus('DRAFTED'), draft.id);
  return draft;
}

export async function getDraft(id: string): Promise<Draft | null> {
  const kv = getKv();
  return (await kv.get<Draft>(k.draft(id))) ?? null;
}

export async function listPending(): Promise<Draft[]> {
  const kv = getKv();
  const ids = await kv.zrange(k.draftIndexPending(), 0, -1);
  const out: Draft[] = [];
  for (const id of ids) {
    const d = await kv.get<Draft>(k.draft(id));
    if (d) out.push(d);
  }
  return out;
}

/**
 * Drafts the owner can still act on from a review session: PENDING_REVIEW
 * (the normal queue) plus PUBLISH_FAILED (a previous attempt rejected by
 * LinkedIn, awaiting retry). A draft drops off the pending sorted set the
 * moment it leaves PENDING_REVIEW, so PUBLISH_FAILED is otherwise invisible
 * to `/api/access/request`. Callers should prefer this over `listPending()`
 * anywhere the goal is "what does the owner still need to act on".
 */
export async function listReviewable(): Promise<Draft[]> {
  const kv = getKv();
  const pending = await listPending();
  const failedIds = await kv.smembers(k.draftIndexByStatus('PUBLISH_FAILED'));
  const seen = new Set(pending.map((d) => d.id));
  const out: Draft[] = [...pending];
  for (const id of failedIds) {
    if (seen.has(id)) continue;
    const d = await kv.get<Draft>(k.draft(id));
    if (d) out.push(d);
  }
  return out;
}

/**
 * A PUBLISHING draft older than this is assumed dead — the request that put
 * it there crashed, timed out, or was killed mid-flight. Recovery routes use
 * this to demote the draft to PUBLISH_FAILED so the owner can retry instead
 * of being permanently locked out.
 *
 * LinkedIn's publish API normally returns in well under a second. We use 5
 * minutes here purely as a "no chance this is still running" floor.
 */
export const PUBLISHING_TIMEOUT_MS = 5 * 60 * 1000;

export function isStalePublishing(d: Draft, now: number = Date.now()): boolean {
  if (d.status !== 'PUBLISHING') return false;
  const attemptedAt = d.publish_attempted_at ?? 0;
  return now - attemptedAt >= PUBLISHING_TIMEOUT_MS;
}

interface TransitionOpts {
  patch?: Partial<Draft>;
  /**
   * Required when transitioning to PUBLISHING. Opaque proof token derived from
   * a verified WebAuthn assertion. The state layer never validates this — it
   * only enforces presence. The publish route is responsible for the verify.
   */
  publishProof?: string;
  publishedUrn?: string;
  publishError?: string;
}

/**
 * The ONLY writer for draft.status. Enforces the state machine and the
 * publish-proof requirement. Bumps version on `EDITED` and immediately
 * re-promotes to PENDING_REVIEW.
 *
 * Returns the post-transition draft.
 */
export async function transition(
  id: string,
  to: DraftStatus,
  opts: TransitionOpts = {},
): Promise<Draft> {
  const kv = getKv();
  const current = await kv.get<Draft>(k.draft(id));
  if (!current) throw new TransitionError(`draft ${id} not found`);

  const allowed = ALLOWED[current.status];
  if (!allowed.includes(to)) {
    throw new TransitionError(
      `illegal transition ${current.status} → ${to} for draft ${id}`,
    );
  }
  if (to === 'PUBLISHING' && !opts.publishProof) {
    throw new MissingPublishProofError(
      `publish requires a verified WebAuthn assertion proof`,
    );
  }
  if (to === 'PUBLISHED' && !opts.publishedUrn) {
    throw new MissingPublishedUrnError(
      `PUBLISHED requires the LinkedIn URN returned by the publisher`,
    );
  }

  const now = Date.now();
  const isEdited = to === 'EDITED';
  const newVersion = isEdited ? current.version + 1 : current.version;

  const next: Draft = {
    ...current,
    ...opts.patch,
    id: current.id,
    status: to,
    version: newVersion,
    updated_at: now,
    ...(opts.publishProof ? { publishProof: opts.publishProof } : {}),
    ...(opts.publishedUrn ? { publishedUrn: opts.publishedUrn } : {}),
    ...(to === 'PUBLISHING' ? { publish_attempted_at: now } : {}),
    ...(to === 'PUBLISH_FAILED' && opts.publishError !== undefined
      ? { publishError: opts.publishError }
      : {}),
  };

  await kv.set(k.draft(id), next);
  await kv.srem(k.draftIndexByStatus(current.status), id);
  await kv.sadd(k.draftIndexByStatus(to), id);

  // Maintain pending sorted-set membership.
  if (to === 'PENDING_REVIEW') {
    await kv.zadd(k.draftIndexPending(), { score: now, member: id });
  } else if (current.status === 'PENDING_REVIEW') {
    await kv.zrem(k.draftIndexPending(), id);
  }

  // EDITED is transient — immediately re-promote to PENDING_REVIEW so the
  // owner sees the new version in their open review session.
  if (isEdited) {
    return transition(id, 'DRAFTED');
  }
  if (current.status === 'EDITED' && to === 'DRAFTED') {
    return transition(id, 'PENDING_REVIEW');
  }
  return next;
}
