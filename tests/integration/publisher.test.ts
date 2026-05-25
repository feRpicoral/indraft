import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import {
  LinkedInApiPublisher,
  PublisherAuthError,
  PublisherRateLimitError,
} from '@/lib/publisher';

const ACCESS_TOKEN = 'test-token';
const PERSON_URN = 'urn:li:person:abc123';
const POST_URN = 'urn:li:share:7000000000000000000';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('LinkedInApiPublisher.publish', () => {
  const publisher = new LinkedInApiPublisher({
    accessToken: ACCESS_TOKEN,
    personUrn: PERSON_URN,
  });

  it('publishes text-only and returns the urn from the response header', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post('https://api.linkedin.com/rest/posts', async ({ request }) => {
        capturedBody = await request.json();
        return new HttpResponse(null, {
          status: 201,
          headers: { 'x-restli-id': POST_URN },
        });
      }),
    );
    const r = await publisher.publish({ body: 'Hello world' });
    expect(r.urn).toBe(POST_URN);
    const body = capturedBody as Record<string, unknown>;
    expect(body.author).toBe(PERSON_URN);
    expect(body.commentary).toBe('Hello world');
    expect(body.lifecycleState).toBe('PUBLISHED');
  });

  it('appends the link to the body when one is provided', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post('https://api.linkedin.com/rest/posts', async ({ request }) => {
        capturedBody = await request.json();
        return new HttpResponse(null, {
          status: 201,
          headers: { 'x-restli-id': POST_URN },
        });
      }),
    );
    await publisher.publish({ body: 'Hello', link: 'https://example.com/x' });
    const body = capturedBody as { commentary: string };
    expect(body.commentary).toBe('Hello\n\nhttps://example.com/x');
  });

  it('publishes image via initializeUpload → PUT → reference URN', async () => {
    const calls: string[] = [];
    server.use(
      http.post(
        'https://api.linkedin.com/rest/images',
        async ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get('action') === 'initializeUpload') {
            calls.push('init');
            return HttpResponse.json({
              value: {
                uploadUrl: 'https://upload.linkedin.com/abc',
                image: 'urn:li:image:img-1',
              },
            });
          }
          return new HttpResponse(null, { status: 400 });
        },
      ),
      http.put('https://upload.linkedin.com/abc', () => {
        calls.push('put');
        return new HttpResponse(null, { status: 201 });
      }),
      http.post('https://api.linkedin.com/rest/posts', async ({ request }) => {
        calls.push('post');
        const body = (await request.json()) as { content?: { media?: { id?: string } } };
        expect(body.content?.media?.id).toBe('urn:li:image:img-1');
        return new HttpResponse(null, {
          status: 201,
          headers: { 'x-restli-id': POST_URN },
        });
      }),
    );

    const r = await publisher.publish({
      body: 'with image',
      image: { bytes: Buffer.from('fake-png').toString('base64'), mime: 'image/png', alt: 'demo' },
    });
    expect(r.urn).toBe(POST_URN);
    expect(calls).toEqual(['init', 'put', 'post']);
  });

  it('throws PublisherAuthError on 401', async () => {
    server.use(
      http.post('https://api.linkedin.com/rest/posts', () =>
        HttpResponse.json({ message: 'unauthorized' }, { status: 401 }),
      ),
    );
    await expect(publisher.publish({ body: 'x' })).rejects.toBeInstanceOf(PublisherAuthError);
  });

  it('throws PublisherRateLimitError on 429 after retries are exhausted', async () => {
    server.use(
      http.post('https://api.linkedin.com/rest/posts', () =>
        HttpResponse.json({ message: 'rate limit' }, { status: 429 }),
      ),
    );
    await expect(publisher.publish({ body: 'x' })).rejects.toBeInstanceOf(
      PublisherRateLimitError,
    );
  }, 30_000);

  it('addComment posts to the social actions endpoint', async () => {
    let captured: { url: string; body: unknown } | null = null;
    server.use(
      http.post(
        'https://api.linkedin.com/rest/socialActions/:postUrn/comments',
        async ({ request }) => {
          captured = { url: request.url, body: await request.json() };
          return new HttpResponse(null, { status: 201 });
        },
      ),
    );
    await publisher.addComment(POST_URN, 'first comment with link https://example.com');
    expect(captured).not.toBeNull();
    expect((captured as unknown as { body: { actor: string } }).body.actor).toBe(PERSON_URN);
  });

  it('healthCheck returns ok for a reachable userinfo endpoint', async () => {
    server.use(
      http.get('https://api.linkedin.com/v2/userinfo', () =>
        HttpResponse.json({ sub: 'abc123' }),
      ),
    );
    const r = await publisher.healthCheck();
    expect(r.ok).toBe(true);
  });

  it('healthCheck returns not-ok with reason on 401', async () => {
    server.use(
      http.get('https://api.linkedin.com/v2/userinfo', () =>
        HttpResponse.json({}, { status: 401 }),
      ),
    );
    const r = await publisher.healthCheck();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('401');
  });
});
