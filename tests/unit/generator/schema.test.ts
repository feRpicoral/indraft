import { describe, it, expect } from 'vitest';
import { DraftOutputSchema } from '@/lib/generator/schema';

const base = {
  body: 'A specific, opinionated take that comfortably clears the minimum body length for a draft.',
  content_kind: 'text',
  needs_image: false,
  image_source: 'none',
  hashtags: ['typescript'],
  mentions: [],
  pillar: 'fullstack',
  source_url: 'https://example.com/x',
};

describe('DraftOutputSchema link handling', () => {
  it('coerces null link and "omit" placement to a no-link draft', () => {
    const out = DraftOutputSchema.parse({ ...base, link: null, link_placement: 'omit' });

    expect(out.link).toBeUndefined();
    expect(out.link_placement).toBe('none');
  });

  it('coerces a missing link_placement to "none"', () => {
    const out = DraftOutputSchema.parse(base);

    expect(out.link_placement).toBe('none');
    expect(out.link).toBeUndefined();
  });

  it('treats the "(none)" link sentinel as no link', () => {
    const out = DraftOutputSchema.parse({ ...base, link: '(none)', link_placement: 'none' });

    expect(out.link).toBeUndefined();
  });

  it('preserves a real link with an explicit placement', () => {
    const out = DraftOutputSchema.parse({
      ...base,
      link: 'https://example.com/post',
      link_placement: 'body',
    });

    expect(out.link).toBe('https://example.com/post');
    expect(out.link_placement).toBe('body');
  });

  it('still rejects a genuinely invalid placement value', () => {
    expect(() => DraftOutputSchema.parse({ ...base, link_placement: 'sidebar' })).toThrow();
  });
});
