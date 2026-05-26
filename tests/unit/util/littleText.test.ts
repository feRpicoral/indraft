import { describe, it, expect } from 'vitest';
import { escapeLittleTextFormat, hashtagTemplate } from '@/lib/util/littleText';

describe('escapeLittleTextFormat', () => {
  it('escapes parens (the bug that caused mid-body truncation)', () => {
    expect(escapeLittleTextFormat('load-bearing (if they vanish, am I down?).')).toBe(
      'load-bearing \\(if they vanish, am I down?\\)\\.'.replace('\\.', '.'),
    );
  });

  it('escapes every reserved character', () => {
    const input = `\\ | { } @ [ ] ( ) < > # * _ ~`;
    const out = escapeLittleTextFormat(input);
    // Each reserved char gets a leading backslash.
    expect(out).toBe('\\\\ \\| \\{ \\} \\@ \\[ \\] \\( \\) \\< \\> \\# \\* \\_ \\~');
  });

  it('leaves non-reserved punctuation alone', () => {
    expect(escapeLittleTextFormat(`Hello! "world" - it's fine, isn't it?`)).toBe(
      `Hello! "world" - it's fine, isn't it?`,
    );
  });

  it('escapes backslash first so we never double-escape', () => {
    expect(escapeLittleTextFormat('a\\b')).toBe('a\\\\b');
  });

  it('handles multi-line input with reserved chars throughout', () => {
    const body = `A paragraph.\n\n- bullet one (with parens)\n- bullet two`;
    expect(escapeLittleTextFormat(body)).toBe(
      `A paragraph.\n\n- bullet one \\(with parens\\)\n- bullet two`,
    );
  });
});

describe('hashtagTemplate', () => {
  it('produces the explicit HashtagTemplate form', () => {
    expect(hashtagTemplate('fullstack')).toBe('{hashtag|\\#|fullstack}');
  });
  it('strips a leading # before formatting', () => {
    expect(hashtagTemplate('#typescript')).toBe('{hashtag|\\#|typescript}');
  });
});
