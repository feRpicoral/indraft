import type { SkipReason } from '../scheduler/runScheduledJob';
import { getKv } from './kv';
import { k } from './keys';

const AUDIT_HISTORY_CAP = 50;

export type CronAuditStatus = 'started' | 'success' | 'skipped' | 'error';

export interface CronAuditEntry {
  id: string;
  status: CronAuditStatus;
  started_at: number;
  finished_at?: number;
  dry_run: boolean;
  force: boolean;
  day?: string;
  hour?: number;
  target_days?: string[];
  target_hour?: number;
  timezone?: string;
  skipped?: SkipReason;
  draft_id?: string;
  warnings?: string[];
  error?: string;
}

export async function recordCronAudit(entry: CronAuditEntry): Promise<void> {
  const kv = getKv();
  const encoded = JSON.stringify(entry);
  await kv.set(k.cronAuditLatest(), encoded);
  if (entry.status !== 'started') {
    await kv.lpush(k.cronAuditHistory(), encoded);
    await kv.ltrim(k.cronAuditHistory(), 0, AUDIT_HISTORY_CAP - 1);
  }
}

export async function latestCronAudit(): Promise<CronAuditEntry | null> {
  return decodeCronAudit(await getKv().get(k.cronAuditLatest()));
}

export async function listCronAudit(limit = 10): Promise<CronAuditEntry[]> {
  const capped = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 50) : 10;
  const raw = await getKv().lrange(k.cronAuditHistory(), 0, capped - 1);
  return raw.map(decodeCronAudit).filter((entry): entry is CronAuditEntry => entry !== null);
}

function decodeCronAudit(raw: unknown): CronAuditEntry | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as CronAuditEntry;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw as CronAuditEntry;
  return null;
}
