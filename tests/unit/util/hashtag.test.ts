import { describe, it, expect } from 'vitest';
import { stripTrailingHashtagBlock, mergeHashtags } from '@/lib/util/hashtag';

describe('stripTrailingHashtagBlock', () => {
  it('strips a trailing block separated by a blank line', () => {
    const r = stripTrailingHashtagBlock('Post body.\n\n#typescript #nextjs');

    expect(r.body).toBe('Post body.');
    expect(r.extracted).toEqual(['typescript', 'nextjs']);
  });

  it('strips a trailing block on consecutive lines', () => {
    const r = stripTrailingHashtagBlock('Body here.\n\n#fullstack\n#webdev');

    expect(r.body).toBe('Body here.');
    expect(r.extracted).toEqual(['fullstack', 'webdev']);
  });

  it('leaves mid-sentence hashtags alone', () => {
    const r = stripTrailingHashtagBlock('We use #postgres because it works.');

    expect(r.body).toBe('We use #postgres because it works.');
    expect(r.extracted).toEqual([]);
  });

  it('handles a body with no trailing hashtags', () => {
    const r = stripTrailingHashtagBlock('Just some prose.');

    expect(r.body).toBe('Just some prose.');
    expect(r.extracted).toEqual([]);
  });

  it('trims trailing whitespace even when no tags', () => {
    const r = stripTrailingHashtagBlock('Body.   \n  ');

    expect(r.body).toBe('Body.');
  });

  it('handles single trailing hashtag', () => {
    const r = stripTrailingHashtagBlock('Body.\n#one');

    expect(r.body).toBe('Body.');
    expect(r.extracted).toEqual(['one']);
  });
});

describe('mergeHashtags', () => {
  it('dedupes case-insensitively', () => {
    const merged = mergeHashtags(['TypeScript', 'nextjs'], ['typescript', 'webdev']);

    expect(merged).toEqual(['typescript', 'nextjs', 'webdev']);
  });

  it('strips leading # in both inputs', () => {
    const merged = mergeHashtags(['#ts'], ['#nextjs']);

    expect(merged).toEqual(['ts', 'nextjs']);
  });

  it('preserves order from the first list', () => {
    const merged = mergeHashtags(['b', 'a'], ['c', 'a']);

    expect(merged).toEqual(['b', 'a', 'c']);
  });
});
