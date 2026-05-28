import type { Draft, DraftSnapshot, DraftSnapshotFields, SnapshotActor } from '../types';
import { getKv } from './kv';
import { k } from './keys';

/**
 * How many snapshots to retain per draft. Bounds the history list so a draft
 * that gets edited dozens of times doesn't accumulate unbounded KV memory.
 */
export const SNAPSHOT_CAP = 50;

/**
 * Capture the curated subset of mutable fields from a Draft. These are the
 * fields a "restore" operation will write back, so anything not captured here
 * is permanently lost across a restore — keep this list in sync with the
 * patch routes.
 */
export function snapshotFields(d: Draft): DraftSnapshotFields {
  const fields: DraftSnapshotFields = {
    body: d.body,
    content_kind: d.content_kind,
    hashtags: [...d.hashtags],
    mentions: [...d.mentions],
    pillar: d.pillar,
    source_url: d.source_url,
  };
  if (d.link) fields.link = { ...d.link };
  if (d.article) fields.article = { ...d.article };
  if (d.media) fields.media = { ...d.media };
  if (d.verbatim_ranges) fields.verbatim_ranges = d.verbatim_ranges.map((r) => [...r] as [number, number]);
  return fields;
}

export interface AppendArgs {
  draft: Draft;
  actor: SnapshotActor;
  summary: string;
}

export async function appendSnapshot(args: AppendArgs): Promise<DraftSnapshot> {
  const snapshot: DraftSnapshot = {
    version: args.draft.version,
    ts: Date.now(),
    actor: args.actor,
    summary: args.summary,
    fields: snapshotFields(args.draft),
  };
  const kv = getKv();
  await kv.lpush(k.draftSnapshots(args.draft.id), JSON.stringify(snapshot));
  await kv.ltrim(k.draftSnapshots(args.draft.id), 0, SNAPSHOT_CAP - 1);
  return snapshot;
}

export async function listSnapshots(draftId: string): Promise<DraftSnapshot[]> {
  const kv = getKv();
  const raw = await kv.lrange(k.draftSnapshots(draftId), 0, -1);
  const out: DraftSnapshot[] = [];
  for (const entry of raw) {
    const parsed = parseSnapshot(entry);
    if (parsed) out.push(parsed);
  }
  return out;
}

export async function getSnapshotByVersion(
  draftId: string,
  version: number,
): Promise<DraftSnapshot | null> {
  const all = await listSnapshots(draftId);
  return all.find((s) => s.version === version) ?? null;
}

function parseSnapshot(entry: unknown): DraftSnapshot | null {
  if (typeof entry === 'object' && entry !== null) {
    return entry as DraftSnapshot;
  }
  if (typeof entry !== 'string') return null;
  try {
    return JSON.parse(entry) as DraftSnapshot;
  } catch {
    return null;
  }
}
