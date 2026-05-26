import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { resolveChatEditMedia } from '@/lib/review/conversation';
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

describe('resolveChatEditMedia', () => {
  it('returns the stock photo when content_kind=single_image and source=stock', async () => {
    server.use(
      http.get('https://api.pexels.com/v1/search', () =>
        HttpResponse.json({
          photos: [
            {
              id: 1,
              src: { large: 'https://images.pexels.com/photo.jpg', large2x: '', medium: '', original: '' },
              alt: 'Cute kitten',
              photographer: 'P',
            },
          ],
        }),
      ),
    );
    const media = await resolveChatEditMedia(out(), cfg());
    expect(media).toBeDefined();
    expect(media?.kind).toBe('stock');
    expect(media?.url).toBe('https://images.pexels.com/photo.jpg');
    expect(media?.alt).toBe('Cute kitten');
  });

  it('returns undefined when content_kind is not single_image', async () => {
    expect(await resolveChatEditMedia(out({ content_kind: 'text' }), cfg())).toBeUndefined();
    expect(await resolveChatEditMedia(out({ content_kind: 'article' }), cfg())).toBeUndefined();
  });

  it('returns undefined when image_source is owner (caller preserves existing media)', async () => {
    expect(
      await resolveChatEditMedia(out({ image_source: 'owner' }), cfg()),
    ).toBeUndefined();
  });

  it('returns undefined when image_source is none', async () => {
    expect(
      await resolveChatEditMedia(out({ image_source: 'none' }), cfg()),
    ).toBeUndefined();
  });

  it('returns undefined when the provider yields nothing (Pexels miss)', async () => {
    server.use(
      http.get('https://api.pexels.com/v1/search', () => HttpResponse.json({ photos: [] })),
    );
    expect(await resolveChatEditMedia(out(), cfg())).toBeUndefined();
  });

  it('respects the AI gate (returns undefined when ai is off)', async () => {
    expect(
      await resolveChatEditMedia(
        out({ image_source: 'ai', image_concept: 'a cat' }),
        cfg({ allow_ai_image_when_on_topic: false }),
      ),
    ).toBeUndefined();
  });
});
