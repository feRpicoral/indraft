import type { LinterConfig } from '../../config/schema';
import type { Failure } from '../index';

const DEFAULT_BUZZWORDS: readonly string[] = [
  'revolutionary',
  'leverage',
  'synergy',
  'unleash',
  'world-class',
  'transform',
  'cutting-edge',
  'game-changer',
  'paradigm',
  'innovative',
  'state-of-the-art',
  'next-generation',
];

const DENSITY_THRESHOLD = 0.015; // 1.5%

export function pressReleaseCadenceRule(body: string, cfg: LinterConfig): Failure[] {
  const buzzwords = [...DEFAULT_BUZZWORDS, ...cfg.buzzwords.map((w) => w.toLowerCase())];
  const words = body.toLowerCase().match(/\b[\w-]+\b/g) ?? [];
  if (words.length < 30) return []; // too short for density to be meaningful

  let hits = 0;
  for (const w of words) {
    if (buzzwords.includes(w)) hits++;
  }
  const density = hits / words.length;
  if (density > DENSITY_THRESHOLD) {
    return [
      {
        rule: 'pressReleaseCadence',
        detail: `buzzword density ${(density * 100).toFixed(1)}% (${hits}/${words.length}); threshold ${(DENSITY_THRESHOLD * 100).toFixed(1)}%`,
      },
    ];
  }
  return [];
}
