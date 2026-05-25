import { describe, it, expect } from 'vitest';
import { lint } from '@/lib/linter';
import type { LinterConfig } from '@/lib/config/schema';

const cfg: LinterConfig = {
  max_em_dashes: 2,
  max_emojis: 1,
  max_hashtags: 5,
  buzzwords: [],
  generic_openers: [],
};

const ruleNames = (failures: { rule: string }[]) => failures.map((f) => f.rule);

describe('emDash rule', () => {
  it('passes when em-dashes are under the cap', () => {
    const r = lint('A simple sentence — one dash is fine.', cfg);
    expect(r.ok).toBe(true);
  });
  it('fails when em-dashes exceed the cap', () => {
    const r = lint('A — B — C — D — E', cfg);
    expect(ruleNames(r.failures)).toContain('emDash');
  });
  it('respects a custom max', () => {
    const tight = { ...cfg, max_em_dashes: 0 };
    const r = lint('Hi — there', tight);
    expect(ruleNames(r.failures)).toContain('emDash');
  });
});

describe('emojiCap rule', () => {
  it('passes with one emoji', () => {
    const r = lint('Shipping a thing today 🚀', cfg);
    expect(ruleNames(r.failures)).not.toContain('emojiCap');
  });
  it('fails with several emojis', () => {
    const r = lint('🎉 amazing 🚀 ship it 💯', cfg);
    expect(ruleNames(r.failures)).toContain('emojiCap');
  });
  it('counts multi-codepoint emojis correctly', () => {
    const r = lint('👨‍👩‍👧 👨‍💻 too many', cfg);
    expect(ruleNames(r.failures)).toContain('emojiCap');
  });
});

describe('genericOpeners rule', () => {
  it('fails when the post opens with a cliché', () => {
    const r = lint("Let's dive in to the new model release.", cfg);
    expect(ruleNames(r.failures)).toContain('genericOpeners');
  });
  it("flags it's not just X, it's Y", () => {
    const r = lint("It's not just code; it's craft.", cfg);
    expect(ruleNames(r.failures)).toContain('genericOpeners');
  });
  it('passes with a real, specific opener', () => {
    const r = lint(
      'Switching from Vite to Turbopack today cut my dev-server boot time by 40%.',
      cfg,
    );
    expect(ruleNames(r.failures)).not.toContain('genericOpeners');
  });
  it('only checks the first 150 chars', () => {
    const r = lint(
      'A specific opening sentence with real content. '.repeat(4) + "Let's dive in",
      cfg,
    );
    expect(ruleNames(r.failures)).not.toContain('genericOpeners');
  });
  it('honors custom extra openers', () => {
    const r = lint('Hot take incoming!', { ...cfg, generic_openers: ['Hot take incoming'] });
    expect(ruleNames(r.failures)).toContain('genericOpeners');
  });
});

describe('hashtagWall rule', () => {
  it('passes with 3 trailing hashtags', () => {
    const r = lint('Post body here.\n\n#typescript #nextjs #linkedin', cfg);
    expect(ruleNames(r.failures)).not.toContain('hashtagWall');
  });
  it('fails when too many hashtags', () => {
    const r = lint(
      'Body.\n\n#a #b #c #d #e #f #g',
      cfg,
    );
    expect(ruleNames(r.failures)).toContain('hashtagWall');
  });
  it('flags mid-sentence hashtags', () => {
    const r = lint(
      'I love #typescript so much. More body.\n\n#nextjs',
      cfg,
    );
    expect(ruleNames(r.failures)).toContain('hashtagWall');
  });
});

describe('pressReleaseCadence rule', () => {
  it('passes for natural prose', () => {
    const r = lint(
      'I spent the weekend wiring up a small Next.js side project. ' +
        'The hardest part was the LinkedIn API token expiry math, not the UI. ' +
        'Lessons: caching helps; passkeys are great; do not trust your own retry logic until you test 429s.',
      cfg,
    );
    expect(ruleNames(r.failures)).not.toContain('pressReleaseCadence');
  });
  it('fires on buzzword-heavy press-release prose', () => {
    const r = lint(
      'Our revolutionary platform uses cutting-edge AI to transform the world-class ' +
        'developer experience. We unleash synergy through next-generation innovative ' +
        'state-of-the-art solutions. Our revolutionary team is the world-class market ' +
        'leader, transforming the industry with innovative tools every quarter.',
      cfg,
    );
    expect(ruleNames(r.failures)).toContain('pressReleaseCadence');
  });
  it('ignores short bodies', () => {
    const r = lint('Revolutionary new launch.', cfg);
    expect(ruleNames(r.failures)).not.toContain('pressReleaseCadence');
  });
});

describe('skipRanges', () => {
  it('blanks out verbatim text from rule evaluation', () => {
    // Body containing 6 em-dashes — would fail without skip
    const body = 'A — B — C — D — E — F — G';
    const all = lint(body, cfg);
    expect(ruleNames(all.failures)).toContain('emDash');

    // Skipping the whole body removes the failure.
    const skipped = lint(body, cfg, [[0, body.length]]);
    expect(ruleNames(skipped.failures)).not.toContain('emDash');
  });
});

describe('lint composer', () => {
  it('returns ok: true on a clean post', () => {
    const r = lint(
      'I migrated three services from Pages to App Router this quarter. ' +
        'The biggest surprise was how much code I deleted, not how much I added.\n\n' +
        '#typescript #nextjs',
      cfg,
    );
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });
});
