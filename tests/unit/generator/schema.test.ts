import { describe, it, expect } from 'vitest';
import { DraftOutputSchema, buildEditResponseSchema } from '@/lib/generator/schema';
import type { Draft } from '@/lib/types';

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

const editDraft: Draft = {
  id: 'd1',
  version: 3,
  status: 'PENDING_REVIEW',
  body: 'The current body that is comfortably long enough to be a real draft body.',
  content_kind: 'text',
  hashtags: ['typescript', 'ai'],
  mentions: ['@someone'],
  pillar: 'fullstack',
  source_url: 'https://example.com/current',
  conversation: [],
  created_at: 0,
  updated_at: 0,
};

describe('buildEditResponseSchema partial patch', () => {
  it('accepts an edit patch that omits everything except the changed body', () => {
    const schema = buildEditResponseSchema(editDraft);

    const parsed = schema.parse({
      intent: 'edit',
      message: 'Halved the length.',
      patch: { body: 'A much shorter but still valid rewrite of the original body.' },
    });

    expect(parsed).toMatchObject({
      intent: 'edit',
      patch: {
        body: 'A much shorter but still valid rewrite of the original body.',
        image_source: 'none',
        pillar: 'fullstack',
        source_url: 'https://example.com/current',
        hashtags: ['typescript', 'ai'],
      },
    });
  });

  it('preserves existing media by defaulting image_source to owner', () => {
    const withImage: Draft = {
      ...editDraft,
      content_kind: 'single_image',
      media: { kind: 'stock', url: 'https://img.example.com/x.jpg' },
    };
    const schema = buildEditResponseSchema(withImage);

    const parsed = schema.parse({
      intent: 'edit',
      message: 'Tightened copy.',
      patch: { body: 'Tighter copy that keeps the same attached image in place here.' },
    });

    expect(parsed).toMatchObject({
      intent: 'edit',
      patch: { content_kind: 'single_image', image_source: 'owner' },
    });
  });

  it('lets a full patch override every field', () => {
    const schema = buildEditResponseSchema(editDraft);

    const parsed = schema.parse({
      intent: 'edit',
      message: 'Pivoted topic.',
      patch: {
        body: 'A brand new angle sourced from a different article than before now.',
        content_kind: 'text',
        needs_image: false,
        image_source: 'none',
        link_placement: 'none',
        hashtags: ['news'],
        mentions: [],
        pillar: 'news_opinion',
        source_url: 'https://example.com/new',
      },
    });

    expect(parsed).toMatchObject({
      intent: 'edit',
      patch: { pillar: 'news_opinion', hashtags: ['news'], source_url: 'https://example.com/new' },
    });
  });

  it('still accepts a plain reply turn', () => {
    const schema = buildEditResponseSchema(editDraft);

    const parsed = schema.parse({ intent: 'reply', message: 'What angle do you want?' });

    expect(parsed.intent).toBe('reply');
  });
});
