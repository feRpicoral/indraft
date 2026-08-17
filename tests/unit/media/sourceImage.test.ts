import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { selectDraftMedia, selectSourceImage } from '@/lib/media';
import type { Config } from '@/lib/config/schema';
import type { DraftOutput, SourceItem } from '@/lib/types';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.unstubAllEnvs();
});
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv('PEXELS_API_KEY', '');
});

function cfg(): Config {
  return {
    media: { image_provider: 'pexels', allow_ai_image_when_on_topic: false },
  } as unknown as Config;
}

function item(overrides: Partial<SourceItem> = {}): SourceItem {
  return {
    title: 'A concrete headline',
    url: 'https://news.example.com/article',
    summary: 's',
    source: 'https://news.example.com/feed',
    published_at: 1_800_000_000_000,
    category: 'business',
    ...overrides,
  };
}

function out(overrides: Partial<DraftOutput> = {}): DraftOutput {
  return {
    body: 'b',
    content_kind: 'text',
    needs_image: false,
    image_source: 'none',
    link_placement: 'none',
    hashtags: [],
    mentions: [],
    pillar: 'news_opinion',
    source_url: 'https://news.example.com/article',
    ...overrides,
  };
}

function imageBytes(): ArrayBuffer {
  return new TextEncoder().encode('FAKE_IMAGE_BYTES').buffer as ArrayBuffer;
}

function jpeg() {
  return new HttpResponse(imageBytes(), {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  });
}

function pageWithOgImage(imageUrl: string) {
  return HttpResponse.html(
    `<html><head><meta property="og:image" content="${imageUrl}"/>
     <meta property="og:image:alt" content="Og alt text"/></head><body></body></html>`,
  );
}

describe('selectSourceImage', () => {
  it('downloads the feed-declared image and stores the bytes', async () => {
    server.use(http.get('https://cdn.example.com/feed.jpg', jpeg));

    const media = await selectSourceImage(item({ image_url: 'https://cdn.example.com/feed.jpg' }));

    expect(media?.kind).toBe('source');
    expect(media?.url).toBe('https://cdn.example.com/feed.jpg');
    expect(media?.mime).toBe('image/jpeg');
    expect(media?.bytes).toBe(Buffer.from('FAKE_IMAGE_BYTES').toString('base64'));
    expect(media?.alt).toBe('A concrete headline');
  });

  it('scrapes og:image when the feed declares no image', async () => {
    server.use(
      http.get('https://news.example.com/article', () =>
        pageWithOgImage('https://cdn.example.com/og.jpg'),
      ),
      http.get('https://cdn.example.com/og.jpg', jpeg),
    );

    const media = await selectSourceImage(item());

    expect(media?.kind).toBe('source');
    expect(media?.alt).toBe('Og alt text');
    expect(media?.bytes).toBe(Buffer.from('FAKE_IMAGE_BYTES').toString('base64'));
  });

  it('falls back to og:image when the feed image is unusable', async () => {
    server.use(
      http.get('https://cdn.example.com/dead.jpg', () => new HttpResponse(null, { status: 404 })),
      http.get('https://news.example.com/article', () =>
        pageWithOgImage('https://cdn.example.com/og.jpg'),
      ),
      http.get('https://cdn.example.com/og.jpg', jpeg),
    );

    const media = await selectSourceImage(item({ image_url: 'https://cdn.example.com/dead.jpg' }));

    expect(media?.kind).toBe('source');
    expect(media?.bytes).toBe(Buffer.from('FAKE_IMAGE_BYTES').toString('base64'));
  });

  it('returns undefined when neither the feed nor the page yields an image', async () => {
    server.use(
      http.get('https://news.example.com/article', () =>
        HttpResponse.html('<html><head></head><body>no image</body></html>'),
      ),
    );

    const media = await selectSourceImage(item());

    expect(media).toBeUndefined();
  });
});

describe('selectDraftMedia', () => {
  it('promotes a text post to single_image when the article has an image', async () => {
    server.use(http.get('https://cdn.example.com/feed.jpg', jpeg));

    const result = await selectDraftMedia(
      out(),
      cfg(),
      item({ image_url: 'https://cdn.example.com/feed.jpg' }),
    );

    expect(result.content_kind).toBe('single_image');
    expect(result.media?.kind).toBe('source');
  });

  it('attaches the article image even though the generator set needs_image false', async () => {
    server.use(http.get('https://cdn.example.com/feed.jpg', jpeg));

    const result = await selectDraftMedia(
      out({ needs_image: false, image_source: 'none' }),
      cfg(),
      item({ image_url: 'https://cdn.example.com/feed.jpg' }),
    );

    expect(result.media).toBeDefined();
  });

  it('leaves the kind untouched when no image resolves', async () => {
    server.use(
      http.get('https://news.example.com/article', () =>
        HttpResponse.html('<html><head></head><body></body></html>'),
      ),
    );

    const result = await selectDraftMedia(out(), cfg(), item());

    expect(result.content_kind).toBe('text');
    expect(result.media).toBeUndefined();
  });

  it('skips article-kind posts so the link card keeps its own preview', async () => {
    const result = await selectDraftMedia(
      out({ content_kind: 'article', article: { source: 'https://news.example.com', title: 't' } }),
      cfg(),
      item({ image_url: 'https://cdn.example.com/feed.jpg' }),
    );

    expect(result.content_kind).toBe('article');
    expect(result.media).toBeUndefined();
  });

  it('keeps single_image as single_image rather than re-promoting', async () => {
    server.use(http.get('https://cdn.example.com/feed.jpg', jpeg));

    const result = await selectDraftMedia(
      out({ content_kind: 'single_image' }),
      cfg(),
      item({ image_url: 'https://cdn.example.com/feed.jpg' }),
    );

    expect(result.content_kind).toBe('single_image');
    expect(result.media?.kind).toBe('source');
  });

  it('falls back to stock when the article has no image of its own', async () => {
    vi.stubEnv('PEXELS_API_KEY', 'test-pexels-key');
    server.use(
      http.get('https://news.example.com/article', () =>
        HttpResponse.html('<html><head></head><body></body></html>'),
      ),
      http.get('https://api.pexels.com/v1/search', () =>
        HttpResponse.json({
          photos: [
            {
              id: 1,
              src: { large: 'https://images.pexels.com/p.jpg', large2x: '', medium: '', original: '' },
              alt: 'Stock photo',
            },
          ],
        }),
      ),
      http.get('https://images.pexels.com/p.jpg', jpeg),
    );

    const result = await selectDraftMedia(
      out({ needs_image: true, image_source: 'stock', image_query: 'chips' }),
      cfg(),
      item(),
    );

    expect(result.media?.kind).toBe('stock');
    expect(result.content_kind).toBe('single_image');
  });
});
