import type { LinterConfig } from '../../config/schema';
import type { Failure } from '../index';

const HASHTAG_RE = /#\w+/g;

export function hashtagWallRule(body: string, cfg: LinterConfig): Failure[] {
  const failures: Failure[] = [];
  const matches = body.match(HASHTAG_RE) ?? [];
  if (matches.length > cfg.max_hashtags) {
    failures.push({
      rule: 'hashtagWall',
      detail: `${matches.length} hashtag(s); max is ${cfg.max_hashtags}`,
    });
  }
  // Detect mid-sentence hashtags: anything before the final newline-separated block.
  const trailingBlockStart = findTrailingBlockStart(body);
  for (const m of HASHTAG_RE_with_index(body)) {
    if (m.index < trailingBlockStart) {
      failures.push({
        rule: 'hashtagWall',
        detail: `hashtag "${m.tag}" appears mid-sentence`,
      });
      break;
    }
  }
  return failures;
}

function* HASHTAG_RE_with_index(s: string): Generator<{ tag: string; index: number }> {
  const re = /#\w+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) yield { tag: m[0], index: m.index };
}

/**
 * Heuristic: a "trailing block" is the run of lines at the end that contain
 * only hashtags / whitespace. Returns the index in `body` where that run
 * starts, or `body.length` if there is no such trailing block.
 */
function findTrailingBlockStart(body: string): number {
  const lines = body.split('\n');
  let i = lines.length - 1;
  while (i >= 0) {
    const line = lines[i]!.trim();
    if (line === '') {
      i--;
      continue;
    }
    if (/^(?:#\w+\s*)+$/.test(line)) {
      i--;
      continue;
    }
    break;
  }
  // i is the last non-hashtag line; the trailing block starts after it.
  let charIdx = 0;
  for (let j = 0; j <= i; j++) charIdx += lines[j]!.length + 1; // +1 for \n
  return charIdx;
}
