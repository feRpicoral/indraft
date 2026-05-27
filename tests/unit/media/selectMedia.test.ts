import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { selectMedia } from '@/lib/media';
import type { Config } from '@/lib/config/schema';
import type { DraftOutput } from '@/lib/types';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.unstubAllEnvs();
});
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv('PEXELS_API_KEY', 'test-pexels-key');
});

function cfg(overrides: Partial<Config['media']> = {}): Config {
  return {
    media: {
      image_provider: 'pexels',
      allow_ai_image_when_on_topic: false,
      ...overrides,
    },
  } as unknown as Config;
}

function out(overrides: Partial<DraftOutput> = {}): DraftOutput {
  return {
    body: 'b',
    content_kind: 'single_image',
    needs_image: true,
    image_source: 'stock',
    image_query: 'cats',
    link_placement: 'none',
    hashtags: [],
    mentions: [],
    pillar: 'fullstack',
    source_url: 'https://example.com',
    ...overrides,
  };
}

function fakeImageBytes(): ArrayBuffer {
  return new TextEncoder().encode('FAKE_IMAGE_BYTES').buffer as ArrayBuffer;
}

describe('selectMedia (stock)', () => {
  it('downloads pexels image bytes and stores them on the media record', async () => {
    server.use(
      http.get('https://api.pexels.com/v1/search', () =>
        HttpResponse.json({
          photos: [
            {
              id: 1,
              src: {
                large: 'https://images.pexels.com/photo-1/large.jpg',
                large2x: '',
                medium: '',
                original: '',
              },
              alt: 'Tabby cat',
              photographer: 'Photog',
            },
          ],
        }),
      ),
      http.get('https://images.pexels.com/photo-1/large.jpg', () =>
        new HttpResponse(fakeImageBytes(), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
      ),
    );

    const media = await selectMedia(out(), cfg());
    expect(media).toBeDefined();
    expect(media?.kind).toBe('stock');
    expect(media?.url).toBe('https://images.pexels.com/photo-1/large.jpg');
    expect(media?.mime).toBe('image/jpeg');
    expect(media?.bytes?.length).toBeGreaterThan(0);
    // Bytes are base64; the raw text "FAKE_IMAGE_BYTES" encoded would be:
    expect(media?.bytes).toBe(Buffer.from('FAKE_IMAGE_BYTES').toString('base64'));
  });

  it('returns undefined when the pexels image download fails (no silent downgrade)', async () => {
    // Without bytes the publisher would silently drop the image and post text-only.
    // Better to surface as no-image so the operator sees it in the preview.
    server.use(
      http.get('https://api.pexels.com/v1/search', () =>
        HttpResponse.json({
          photos: [
            {
              id: 1,
              src: { large: 'https://images.pexels.com/dead.jpg', large2x: '', medium: '', original: '' },
              alt: 'x',
            },
          ],
        }),
      ),
      http.get('https://images.pexels.com/dead.jpg', () => new HttpResponse(null, { status: 404 })),
    );

    const media = await selectMedia(out(), cfg());
    expect(media).toBeUndefined();
  });

  it('returns undefined when the image mime is unsupported (webp, etc.)', async () => {
    server.use(
      http.get('https://api.pexels.com/v1/search', () =>
        HttpResponse.json({
          photos: [
            {
              id: 1,
              src: { large: 'https://images.pexels.com/photo.webp', large2x: '', medium: '', original: '' },
              alt: 'x',
            },
          ],
        }),
      ),
      http.get('https://images.pexels.com/photo.webp', () =>
        new HttpResponse(fakeImageBytes(), {
          status: 200,
          headers: { 'content-type': 'image/webp' },
        }),
      ),
    );

    expect(await selectMedia(out(), cfg())).toBeUndefined();
  });

  it('returns undefined when no PEXELS_API_KEY is set', async () => {
    vi.stubEnv('PEXELS_API_KEY', '');
    expect(await selectMedia(out(), cfg())).toBeUndefined();
  });

  it('returns undefined when image_source is "none"', async () => {
    expect(
      await selectMedia(out({ image_source: 'none', needs_image: false }), cfg()),
    ).toBeUndefined();
  });

  it('returns undefined when image_source is "owner" (UI handles owner uploads)', async () => {
    expect(await selectMedia(out({ image_source: 'owner' }), cfg())).toBeUndefined();
  });

  it('returns undefined when image_source is "ai" but AI is gated off', async () => {
    expect(
      await selectMedia(out({ image_source: 'ai', image_concept: 'a cat' }), cfg()),
    ).toBeUndefined();
  });
});
