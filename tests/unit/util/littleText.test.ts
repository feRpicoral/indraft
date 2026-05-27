import { describe, it, expect } from 'vitest';
import { escapeLittleTextFormat, hashtagTemplate } from '@/lib/util/littleText';

describe('escapeLittleTextFormat', () => {
  it('escapes parens (the bug that caused mid-body truncation)', () => {
    const out = escapeLittleTextFormat('load-bearing (if they vanish, am I down?).');

    expect(out).toBe('load-bearing \\(if they vanish, am I down?\\)\\.'.replace('\\.', '.'));
  });

  it('escapes every reserved character', () => {
    const input = `\\ | { } @ [ ] ( ) < > # * _ ~`;

    const out = escapeLittleTextFormat(input);
    expect(out).toBe('\\\\ \\| \\{ \\} \\@ \\[ \\] \\( \\) \\< \\> \\# \\* \\_ \\~');
  });

  it('leaves non-reserved punctuation alone', () => {
    const out = escapeLittleTextFormat(`Hello! "world" - it's fine, isn't it?`);

    expect(out).toBe(`Hello! "world" - it's fine, isn't it?`);
  });

  it('escapes backslash first so we never double-escape', () => {
    const out = escapeLittleTextFormat('a\\b');

    expect(out).toBe('a\\\\b');
  });

  it('handles multi-line input with reserved chars throughout', () => {
    const body = `A paragraph.\n\n- bullet one (with parens)\n- bullet two`;

    const out = escapeLittleTextFormat(body);

    expect(out).toBe(`A paragraph.\n\n- bullet one \\(with parens\\)\n- bullet two`);
  });
});

describe('hashtagTemplate', () => {
  it('produces the explicit HashtagTemplate form', () => {
    const out = hashtagTemplate('fullstack');

    expect(out).toBe('{hashtag|\\#|fullstack}');
  });

  it('strips a leading # before formatting', () => {
    const out = hashtagTemplate('#typescript');

    expect(out).toBe('{hashtag|\\#|typescript}');
  });
});
