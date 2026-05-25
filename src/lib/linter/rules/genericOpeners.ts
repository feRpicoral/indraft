import type { LinterConfig } from '../../config/schema';
import type { Failure } from '../index';

const DEFAULT_OPENERS: readonly string[] = [
  "in today's fast-paced",
  'in an era of',
  "let's dive in",
  "i'm thrilled to share",
  "it's not just",
  'game-changer',
  'unlock the power',
  'in a world where',
  'imagine a world',
  'buckle up',
];

const OPENER_WINDOW = 150;

export function genericOpenersRule(body: string, cfg: LinterConfig): Failure[] {
  const head = body.slice(0, OPENER_WINDOW).toLowerCase();
  const patterns = [...DEFAULT_OPENERS, ...cfg.generic_openers.map((s) => s.toLowerCase())];
  for (const p of patterns) {
    if (head.includes(p)) {
      return [
        {
          rule: 'genericOpeners',
          detail: `opens with cliché "${p}"`,
        },
      ];
    }
  }
  return [];
}
