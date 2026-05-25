import type { LinterConfig } from '../../config/schema';
import type { Failure } from '../index';

const EM_DASH = '—';

export function emDashRule(body: string, cfg: LinterConfig): Failure[] {
  let count = 0;
  for (const ch of body) if (ch === EM_DASH) count++;
  if (count > cfg.max_em_dashes) {
    return [
      {
        rule: 'emDash',
        detail: `${count} em-dash(es); max is ${cfg.max_em_dashes}`,
      },
    ];
  }
  return [];
}
