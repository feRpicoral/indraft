import type { Draft, DraftStatus } from '../types';
import { newId } from '../util/id';
import { getKv } from './kv';
import { k } from './keys';

/**
 * Allowed state-machine transitions. Anything not listed is rejected by
 * `transition()`. The publish-guard invariant relies on this table.
 */
const ALLOWED: Record<DraftStatus, readonly DraftStatus[]> = {
  DRAFTED: ['PENDING_REVIEW', 'DISCARDED'],
  PENDING_REVIEW: ['PUBLISHED', 'DISCARDED', 'EDITED', 'STALE'],
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

export type CreateDraftInput = Omit<
  Draft,
  'id' | 'version' | 'created_at' | 'updated_at' | 'status' | 'content_kind'
> & { content_kind?: ContentKind };

export async function createDraft(input: CreateDraftInput): Promise<Draft> {
  const kv = getKv();
  const now = Date.now();
  const draft: Draft = {
    ...input,
    content_kind: input.content_kind ?? (input.media ? 'single_image' : 'text'),
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

interface TransitionOpts {
  /** Partial fields to write atomically with the status change. */
  patch?: Partial<Draft>;
  /**
   * Required when transitioning to PUBLISHED. Opaque proof token derived from
   * a verified WebAuthn assertion. The state layer never validates this — it
   * only enforces presence. The publish route is responsible for the verify.
   */
  publishProof?: string;
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
  if (to === 'PUBLISHED' && !opts.publishProof) {
    throw new MissingPublishProofError(
      `publish requires a verified WebAuthn assertion proof`,
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
