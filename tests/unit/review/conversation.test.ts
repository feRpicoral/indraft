import { describe, it, expect } from 'vitest';
import { buildEditPatch } from '@/lib/review/conversation';
import type { Draft, DraftOutput } from '@/lib/types';

const baseDraft: Draft = {
  id: 'd1',
  version: 1,
  status: 'PENDING_REVIEW',
  body: 'Original',
  content_kind: 'text',
  hashtags: ['original'],
  mentions: [],
  pillar: 'fullstack',
  source_url: 'https://example.com/x',
  conversation: [],
  created_at: 0,
  updated_at: 0,
};

const baseOutput: DraftOutput = {
  body: 'New body',
  content_kind: 'text',
  needs_image: false,
  image_source: 'none',
  link_placement: 'none',
  hashtags: ['new'],
  mentions: [],
  pillar: 'fullstack',
  source_url: 'https://example.com/x',
};

describe('buildEditPatch', () => {
  it('records user + assistant turns', () => {
    const patch = buildEditPatch({
      current: baseDraft,
      userMessage: 'tighten this',
      output: baseOutput,
    });

    expect(patch.conversation).toHaveLength(2);
    expect(patch.conversation?.[0]?.role).toBe('user');
    expect(patch.conversation?.[0]?.content).toBe('tighten this');
    expect(patch.conversation?.[1]?.role).toBe('assistant');
    expect(patch.conversation?.[1]?.content).toBe('New body');
  });

  it('refines wording (body changes, fields kept)', () => {
    const patch = buildEditPatch({
      current: baseDraft,
      userMessage: 'tighten this',
      output: { ...baseOutput, body: 'Tighter version' },
    });

    expect(patch.body).toBe('Tighter version');
    expect(patch.pillar).toBe('fullstack');
    expect(patch.source_url).toBe('https://example.com/x');
  });

  it('topic-pivot: pillar and source_url change together', () => {
    const patch = buildEditPatch({
      current: baseDraft,
      userMessage: 'cover this instead: https://other.com/y',
      pastedUrl: 'https://other.com/y',
      output: {
        ...baseOutput,
        body: 'New angle from new source',
        pillar: 'news_opinion',
        source_url: 'https://other.com/y',
      },
    });

    expect(patch.pillar).toBe('news_opinion');
    expect(patch.source_url).toBe('https://other.com/y');
    expect(patch.conversation?.[0]?.pastedUrl).toBe('https://other.com/y');
  });

  it('verbatim: stores verbatim_ranges when output provides them', () => {
    const patch = buildEditPatch({
      current: baseDraft,
      userMessage: 'use this: "my own words go here"',
      output: { ...baseOutput, verbatim_ranges: [[5, 25]] },
    });

    expect(patch.verbatim_ranges).toEqual([[5, 25]]);
  });

  it('drop link: undefined when output.link is omitted', () => {
    const draftWithLink: Draft = {
      ...baseDraft,
      link: { url: 'https://example.com/x', placement: 'body' },
    };

    const patch = buildEditPatch({
      current: draftWithLink,
      userMessage: 'drop the link',
      output: { ...baseOutput, link: undefined },
    });

    expect(patch.link).toBeUndefined();
  });

  it('media swap: media stays in its own lane when content_kind is unchanged', () => {
    // Media is attached via the upload-image endpoint, not via the LLM output.
    // When the kind doesn't change, the reducer must not touch `media`.
    const patch = buildEditPatch({
      current: baseDraft,
      userMessage: 'use this image',
      imageUrl: 'https://example.com/image.png',
      output: baseOutput,
    });

    expect(patch.conversation?.[0]?.imageUrl).toBe('https://example.com/image.png');
    expect(patch).not.toHaveProperty('media');
  });

  it('carries content_kind on every edit', () => {
    const patch = buildEditPatch({
      current: baseDraft,
      userMessage: 'no change to kind',
      output: baseOutput,
    });

    expect(patch.content_kind).toBe('text');
  });

  it('switching text → article carries article fields from the model output', () => {
    const patch = buildEditPatch({
      current: baseDraft,
      userMessage: 'turn this into an article share with the source',
      output: {
        ...baseOutput,
        content_kind: 'article',
        article: { source: 'https://example.com/article', title: 'A headline' },
      },
    });

    expect(patch.content_kind).toBe('article');
    expect(patch.article).toEqual({
      source: 'https://example.com/article',
      title: 'A headline',
    });
  });

  it('switching to article preserves an existing thumbnail (LLM never supplies bytes)', () => {
    const withThumb: Draft = {
      ...baseDraft,
      content_kind: 'article',
      article: {
        source: 'https://example.com/old',
        title: 'Old',
        thumbnail: { kind: 'owner', bytes: 'AAA', mime: 'image/png', alt: 'cover' },
      },
    };

    const patch = buildEditPatch({
      current: withThumb,
      userMessage: 'rewrite the headline',
      output: {
        ...baseOutput,
        content_kind: 'article',
        article: { source: 'https://example.com/new', title: 'New headline' },
      },
    });

    expect(patch.article?.source).toBe('https://example.com/new');
    expect(patch.article?.title).toBe('New headline');
    expect(patch.article?.thumbnail).toEqual({
      kind: 'owner',
      bytes: 'AAA',
      mime: 'image/png',
      alt: 'cover',
    });
  });

  it('switching article → text clears the article record', () => {
    const articleDraft: Draft = {
      ...baseDraft,
      content_kind: 'article',
      article: { source: 'https://x/y', title: 'T' },
    };

    const patch = buildEditPatch({
      current: articleDraft,
      userMessage: 'drop the article framing — just commentary',
      output: { ...baseOutput, content_kind: 'text' },
    });

    expect(patch.content_kind).toBe('text');
    expect(patch.article).toBeUndefined();
    // Property must be present so the spread in transition() actually drops it.
    expect(Object.prototype.hasOwnProperty.call(patch, 'article')).toBe(true);
  });

  it('switching single_image → text clears the attached media', () => {
    const imageDraft: Draft = {
      ...baseDraft,
      content_kind: 'single_image',
      media: { kind: 'owner', bytes: 'AAA', mime: 'image/png' },
    };

    const patch = buildEditPatch({
      current: imageDraft,
      userMessage: 'drop the image',
      output: { ...baseOutput, content_kind: 'text' },
    });

    expect(patch.content_kind).toBe('text');
    expect(patch.media).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(patch, 'media')).toBe(true);
  });

  it('staying single_image leaves media untouched (still owned by upload-image)', () => {
    const imageDraft: Draft = {
      ...baseDraft,
      content_kind: 'single_image',
      media: { kind: 'owner', bytes: 'AAA', mime: 'image/png' },
    };

    const patch = buildEditPatch({
      current: imageDraft,
      userMessage: 'tighten copy but keep the image',
      output: { ...baseOutput, content_kind: 'single_image' },
    });

    expect(patch.content_kind).toBe('single_image');
    expect(patch).not.toHaveProperty('media');
  });

  it('appends to existing conversation rather than replacing it', () => {
    const prior: Draft = {
      ...baseDraft,
      conversation: [
        { role: 'user', content: 'first edit', ts: 0 },
        { role: 'assistant', content: 'first response', ts: 0 },
      ],
    };

    const patch = buildEditPatch({
      current: prior,
      userMessage: 'second edit',
      output: baseOutput,
    });

    expect(patch.conversation).toHaveLength(4);
    expect(patch.conversation?.[0]?.content).toBe('first edit');
    expect(patch.conversation?.[2]?.content).toBe('second edit');
  });
});
