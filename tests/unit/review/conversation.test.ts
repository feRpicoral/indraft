import { describe, it, expect } from 'vitest';
import { applyEditResponse } from '@/lib/review/conversation';
import type { Draft, DraftOutput, EditResponse } from '@/lib/types';

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

const editResponse = (overrides: Partial<DraftOutput> = {}, message = 'Tightened the opener.'): EditResponse => ({
  intent: 'edit',
  message,
  patch: { ...baseOutput, ...overrides },
});

describe('applyEditResponse', () => {
  it('records user + assistant turns; assistant content is the response message', () => {
    const patch = applyEditResponse({
      current: baseDraft,
      userMessage: 'tighten this',
      response: editResponse({}, 'Tightened the opening line.'),
    });

    expect(patch.conversation).toHaveLength(2);
    expect(patch.conversation?.[0]?.role).toBe('user');
    expect(patch.conversation?.[0]?.content).toBe('tighten this');
    expect(patch.conversation?.[1]?.role).toBe('assistant');
    expect(patch.conversation?.[1]?.content).toBe('Tightened the opening line.');
  });

  it('reply intent only updates conversation, leaves all fields untouched', () => {
    const patch = applyEditResponse({
      current: baseDraft,
      userMessage: 'what do you think of the angle?',
      response: { intent: 'reply', message: "Strong, but I'd lead with the counterpoint." },
    });

    expect(patch.conversation).toHaveLength(2);
    expect(patch.conversation?.[1]?.content).toBe("Strong, but I'd lead with the counterpoint.");
    expect(patch).not.toHaveProperty('body');
    expect(patch).not.toHaveProperty('content_kind');
    expect(patch).not.toHaveProperty('hashtags');
    expect(patch).not.toHaveProperty('pillar');
    expect(patch).not.toHaveProperty('source_url');
    expect(patch).not.toHaveProperty('media');
  });

  it('refines wording (body changes, fields kept)', () => {
    const patch = applyEditResponse({
      current: baseDraft,
      userMessage: 'tighten this',
      response: editResponse({ body: 'Tighter version' }),
    });

    expect(patch.body).toBe('Tighter version');
    expect(patch.pillar).toBe('fullstack');
    expect(patch.source_url).toBe('https://example.com/x');
  });

  it('topic-pivot: pillar and source_url change together', () => {
    const patch = applyEditResponse({
      current: baseDraft,
      userMessage: 'cover this instead: https://other.com/y',
      pastedUrl: 'https://other.com/y',
      response: editResponse({
        body: 'New angle from new source',
        pillar: 'news_opinion',
        source_url: 'https://other.com/y',
      }),
    });

    expect(patch.pillar).toBe('news_opinion');
    expect(patch.source_url).toBe('https://other.com/y');
    expect(patch.conversation?.[0]?.pastedUrl).toBe('https://other.com/y');
  });

  it('verbatim: stores verbatim_ranges when output provides them', () => {
    const patch = applyEditResponse({
      current: baseDraft,
      userMessage: 'use this: "my own words go here"',
      response: editResponse({ verbatim_ranges: [[5, 25]] }),
    });

    expect(patch.verbatim_ranges).toEqual([[5, 25]]);
  });

  it('drop link: undefined when output.link is omitted', () => {
    const draftWithLink: Draft = {
      ...baseDraft,
      link: { url: 'https://example.com/x', placement: 'body' },
    };

    const patch = applyEditResponse({
      current: draftWithLink,
      userMessage: 'drop the link',
      response: editResponse({ link: undefined }),
    });

    expect(patch.link).toBeUndefined();
  });

  it('media swap: media stays in its own lane when content_kind is unchanged', () => {
    const patch = applyEditResponse({
      current: baseDraft,
      userMessage: 'use this image',
      imageUrl: 'https://example.com/image.png',
      response: editResponse(),
    });

    expect(patch.conversation?.[0]?.imageUrl).toBe('https://example.com/image.png');
    expect(patch).not.toHaveProperty('media');
  });

  it('carries content_kind on every edit', () => {
    const patch = applyEditResponse({
      current: baseDraft,
      userMessage: 'no change to kind',
      response: editResponse(),
    });

    expect(patch.content_kind).toBe('text');
  });

  it('switching text → article carries article fields from the model output', () => {
    const patch = applyEditResponse({
      current: baseDraft,
      userMessage: 'turn this into an article share with the source',
      response: editResponse({
        content_kind: 'article',
        article: { source: 'https://example.com/article', title: 'A headline' },
      }),
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

    const patch = applyEditResponse({
      current: withThumb,
      userMessage: 'rewrite the headline',
      response: editResponse({
        content_kind: 'article',
        article: { source: 'https://example.com/new', title: 'New headline' },
      }),
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

    const patch = applyEditResponse({
      current: articleDraft,
      userMessage: 'drop the article framing — just commentary',
      response: editResponse({ content_kind: 'text' }),
    });

    expect(patch.content_kind).toBe('text');
    expect(patch.article).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(patch, 'article')).toBe(true);
  });

  it('switching single_image → text clears the attached media', () => {
    const imageDraft: Draft = {
      ...baseDraft,
      content_kind: 'single_image',
      media: { kind: 'owner', bytes: 'AAA', mime: 'image/png' },
    };

    const patch = applyEditResponse({
      current: imageDraft,
      userMessage: 'drop the image',
      response: editResponse({ content_kind: 'text' }),
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

    const patch = applyEditResponse({
      current: imageDraft,
      userMessage: 'tighten copy but keep the image',
      response: editResponse({ content_kind: 'single_image' }),
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

    const patch = applyEditResponse({
      current: prior,
      userMessage: 'second edit',
      response: editResponse(),
    });

    expect(patch.conversation).toHaveLength(4);
    expect(patch.conversation?.[0]?.content).toBe('first edit');
    expect(patch.conversation?.[2]?.content).toBe('second edit');
  });
});
