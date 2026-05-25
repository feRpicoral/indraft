import { createHash } from 'node:crypto';
import type { HistoryEntry, Pillar } from '../types';
import { getKv } from './kv';
import { k } from './keys';

const HISTORY_CAP = 200;
const ROTATION_WINDOW = 5;

export async function recordPublished(entry: Omit<HistoryEntry, 'body_hash'> & { body: string }): Promise<void> {
  const kv = getKv();
  const record: HistoryEntry = {
    draft_id: entry.draft_id,
    body_hash: hashBody(entry.body),
    source_url: entry.source_url,
    pillar: entry.pillar,
    urn: entry.urn,
    published_at: entry.published_at,
  };
  await kv.lpush(k.historyPosts(), JSON.stringify(record));
  await kv.ltrim(k.historyPosts(), 0, HISTORY_CAP - 1);
  await kv.set(k.historyPillarLast(), entry.pillar);
}

export async function listHistory(limit = 20): Promise<HistoryEntry[]> {
  const kv = getKv();
  const raw = await kv.lrange(k.historyPosts(), 0, limit - 1);
  return raw
    .map((s) => {
      try {
        return JSON.parse(s) as HistoryEntry;
      } catch {
        return null;
      }
    })
    .filter((x): x is HistoryEntry => x !== null);
}

export async function recentPillars(n = ROTATION_WINDOW): Promise<Pillar[]> {
  const items = await listHistory(n);
  return items.map((i) => i.pillar);
}

export async function lastPillar(): Promise<Pillar | null> {
  const kv = getKv();
  return kv.get<Pillar>(k.historyPillarLast());
}

/** Returns true if the same source URL or body hash was published recently. */
export async function isDuplicate(args: { source_url: string; body: string }): Promise<boolean> {
  const recent = await listHistory(HISTORY_CAP);
  const hash = hashBody(args.body);
  return recent.some((r) => r.source_url === args.source_url || r.body_hash === hash);
}

export function hashBody(body: string): string {
  return createHash('sha256').update(body.trim().toLowerCase()).digest('hex').slice(0, 16);
}
