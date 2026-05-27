import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { fetchOgImage } from '@/lib/util/ogImage';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function fakeImageBytes(): ArrayBuffer {
  // Minimal fake PNG bytes (we never decode; just need a content-type match).
  return new TextEncoder().encode('FAKE_IMAGE_BYTES').buffer as ArrayBuffer;
}

describe('fetchOgImage', () => {
  it('returns the og:image bytes + mime + alt', async () => {
    server.use(
      http.get('https://example.com/article', () =>
        HttpResponse.html(`
          <html><head>
            <meta property="og:image" content="https://example.com/og.png" />
            <meta property="og:image:alt" content="Cover photo" />
            <title>Page Title</title>
          </head></html>
        `),
      ),
      http.get('https://example.com/og.png', () =>
        new HttpResponse(fakeImageBytes(), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
      ),
    );

    const result = await fetchOgImage('https://example.com/article');

    expect(result).not.toBeNull();
    expect(result?.mime).toBe('image/png');
    expect(result?.alt).toBe('Cover photo');
    expect(result?.bytes.length).toBeGreaterThan(0);
  });

  it('falls back to twitter:image when og:image is absent', async () => {
    server.use(
      http.get('https://example.com/article', () =>
        HttpResponse.html(
          `<html><head><meta name="twitter:image" content="https://example.com/t.jpg"></head></html>`,
        ),
      ),
      http.get('https://example.com/t.jpg', () =>
        new HttpResponse(fakeImageBytes(), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
      ),
    );

    const result = await fetchOgImage('https://example.com/article');

    expect(result?.mime).toBe('image/jpeg');
  });

  it('resolves a relative og:image URL against the page URL', async () => {
    server.use(
      http.get('https://example.com/article', () =>
        HttpResponse.html(`<meta property="og:image" content="/relative.png">`),
      ),
      http.get('https://example.com/relative.png', () =>
        new HttpResponse(fakeImageBytes(), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
      ),
    );

    const result = await fetchOgImage('https://example.com/article');

    expect(result).not.toBeNull();
  });

  it('uses page <title> as alt when og:image:alt is missing', async () => {
    server.use(
      http.get('https://example.com/article', () =>
        HttpResponse.html(
          `<html><head><title>The Headline</title><meta property="og:image" content="https://example.com/og.png"></head></html>`,
        ),
      ),
      http.get('https://example.com/og.png', () =>
        new HttpResponse(fakeImageBytes(), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
      ),
    );

    const result = await fetchOgImage('https://example.com/article');

    expect(result?.alt).toBe('The Headline');
  });

  it('returns null when no og:image or twitter:image present', async () => {
    server.use(
      http.get('https://example.com/article', () =>
        HttpResponse.html(`<html><head><title>x</title></head></html>`),
      ),
    );

    const result = await fetchOgImage('https://example.com/article');

    expect(result).toBeNull();
  });

  it('returns null when image download fails', async () => {
    server.use(
      http.get('https://example.com/article', () =>
        HttpResponse.html(`<meta property="og:image" content="https://example.com/og.png">`),
      ),
      http.get('https://example.com/og.png', () => new HttpResponse(null, { status: 404 })),
    );

    const result = await fetchOgImage('https://example.com/article');

    expect(result).toBeNull();
  });

  it('returns null for unsupported mime types', async () => {
    server.use(
      http.get('https://example.com/article', () =>
        HttpResponse.html(`<meta property="og:image" content="https://example.com/og.webp">`),
      ),
      http.get('https://example.com/og.webp', () =>
        new HttpResponse(fakeImageBytes(), {
          status: 200,
          headers: { 'content-type': 'image/webp' },
        }),
      ),
    );

    const result = await fetchOgImage('https://example.com/article');

    expect(result).toBeNull();
  });

  it('returns null when the HTML page itself 404s', async () => {
    server.use(
      http.get('https://example.com/article', () => new HttpResponse(null, { status: 404 })),
    );

    const result = await fetchOgImage('https://example.com/article');

    expect(result).toBeNull();
  });
});
