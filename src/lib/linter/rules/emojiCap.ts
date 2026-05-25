import type { LinterConfig } from '../../config/schema';
import type { Failure } from '../index';

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

export function emojiCapRule(body: string, cfg: LinterConfig): Failure[] {
  const matches = body.match(EMOJI_RE);
  const count = matches?.length ?? 0;
  if (count > cfg.max_emojis) {
    return [
      {
        rule: 'emojiCap',
        detail: `${count} emoji(s); max is ${cfg.max_emojis}`,
      },
    ];
  }
  return [];
}
