import type { LinterConfig } from '../config/schema';
import { emDashRule } from './rules/emDash';
import { emojiCapRule } from './rules/emojiCap';
import { genericOpenersRule } from './rules/genericOpeners';
import { hashtagWallRule } from './rules/hashtagWall';
import { pressReleaseCadenceRule } from './rules/pressReleaseCadence';

export interface Failure {
  rule: string;
  detail: string;
}

export interface LintResult {
  ok: boolean;
  failures: Failure[];
}

export type LintRule = (body: string, cfg: LinterConfig) => Failure[];

const RULES: ReadonlyArray<{ name: string; fn: LintRule }> = [
  { name: 'emDash', fn: emDashRule },
  { name: 'emojiCap', fn: emojiCapRule },
  { name: 'genericOpeners', fn: genericOpenersRule },
  { name: 'hashtagWall', fn: hashtagWallRule },
  { name: 'pressReleaseCadence', fn: pressReleaseCadenceRule },
];

/**
 * Lint a draft body. When `skipRanges` is provided, the substrings covered by
 * those ranges are blanked out before rule evaluation — verbatim owner text
 * is exempt from style rules but still subject to hard constraints elsewhere.
 */
export function lint(
  body: string,
  cfg: LinterConfig,
  skipRanges?: Array<[number, number]>,
): LintResult {
  const target = skipRanges?.length ? applySkipRanges(body, skipRanges) : body;
  const failures: Failure[] = [];
  for (const { fn } of RULES) failures.push(...fn(target, cfg));
  return { ok: failures.length === 0, failures };
}

function applySkipRanges(body: string, ranges: Array<[number, number]>): string {
  // Replace each skipped range with same-length spaces. Same length preserves
  // indices so failure details that reference positions stay meaningful.
  const chars = [...body];
  for (const [start, end] of ranges) {
    for (let i = Math.max(0, start); i < Math.min(end, chars.length); i++) {
      chars[i] = ' ';
    }
  }
  return chars.join('');
}
