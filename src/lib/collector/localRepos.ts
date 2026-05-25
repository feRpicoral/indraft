import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { log } from '../util/logger';
import type { SourceItem } from '../types';

/**
 * Read-only scan of the owner's local-repos directory. CLI-only — this is
 * intentionally NOT called from the scheduled job because the serverless
 * environment doesn't have access to the owner's filesystem.
 *
 * For each top-level directory, surfaces the most recent commit's subject
 * line (from .git/COMMIT_EDITMSG or .git/logs/HEAD). Nothing fancy: this is
 * "what am I actually working on" context, not exhaustive analysis.
 */
export function scanLocalRepos(path: string): SourceItem[] {
  const root = path.startsWith('~') ? path.replace(/^~/, homedir()) : path;
  const abs = resolve(root);
  if (!existsSync(abs)) {
    log.warn('local repos path missing', { path: abs });
    return [];
  }
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch (err) {
    log.warn('local repos readdir failed', { path: abs, err: String(err) });
    return [];
  }

  const items: SourceItem[] = [];
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const repoDir = join(abs, name);
    try {
      const stat = statSync(repoDir);
      if (!stat.isDirectory()) continue;
      const headLog = join(repoDir, '.git', 'logs', 'HEAD');
      if (!existsSync(headLog)) continue;
      const content = readFileSync(headLog, 'utf8');
      const lines = content.trim().split('\n');
      const last = lines[lines.length - 1];
      if (!last) continue;
      const parsed = parseHeadLog(last);
      if (!parsed) continue;
      items.push({
        title: `${name}: ${parsed.subject}`,
        url: `file://${repoDir}`,
        summary: parsed.subject,
        source: 'local',
        published_at: parsed.ts,
        category: 'personal',
      });
    } catch (err) {
      log.debug('local repo skip', { name, err: String(err) });
    }
  }
  return items;
}

/** A git reflog line: "<from> <to> <name> <email> <timestamp> <tz>\t<subject>" */
function parseHeadLog(line: string): { ts: number; subject: string } | null {
  const tabIdx = line.indexOf('\t');
  if (tabIdx === -1) return null;
  const head = line.slice(0, tabIdx);
  const subject = line.slice(tabIdx + 1);
  const parts = head.split(/\s+/);
  // Timestamp is the second-to-last numeric field.
  const tsRaw = parts[parts.length - 2];
  if (!tsRaw) return null;
  const tsNum = Number(tsRaw);
  if (isNaN(tsNum)) return null;
  return { ts: tsNum * 1000, subject: subject.replace(/^commit(?:\s\(initial\))?:\s*/, '') };
}
