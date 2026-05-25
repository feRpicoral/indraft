import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { buildAuthUrl, exchangeCode, SCOPES } from '@/lib/auth/linkedinOAuth';

const CFG = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://app.example.com/api/auth/linkedin/callback',
};

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('buildAuthUrl', () => {
  it('includes all required parameters and the openid+w_member_social scopes', () => {
    const url = new URL(buildAuthUrl(CFG, 'state-123'));
    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('scope')).toBe(SCOPES);
    expect(url.searchParams.get('response_type')).toBe('code');
  });
});

describe('exchangeCode', () => {
  it('exchanges code for token and resolves the person urn via userinfo', async () => {
    server.use(
      http.post(
        'https://www.linkedin.com/oauth/v2/accessToken',
        async ({ request }) => {
          const text = await request.text();
          expect(text).toContain('grant_type=authorization_code');
          expect(text).toContain('code=test-code');
          return HttpResponse.json({
            access_token: 'access-token-x',
            expires_in: 60 * 86400,
          });
        },
      ),
      http.get('https://api.linkedin.com/v2/userinfo', ({ request }) => {
        const auth = request.headers.get('authorization');
        expect(auth).toBe('Bearer access-token-x');
        return HttpResponse.json({ sub: 'person-12345' });
      }),
    );
    const r = await exchangeCode(CFG, 'test-code');
    expect(r.access_token).toBe('access-token-x');
    expect(r.expires_in).toBe(60 * 86400);
    expect(r.sub).toBe('person-12345');
    expect(r.person_urn).toBe('urn:li:person:person-12345');
  });

  it('throws when the token endpoint returns non-2xx', async () => {
    server.use(
      http.post('https://www.linkedin.com/oauth/v2/accessToken', () =>
        HttpResponse.json({ error: 'invalid_grant' }, { status: 400 }),
      ),
    );
    await expect(exchangeCode(CFG, 'bad-code')).rejects.toThrow(/LinkedIn token exchange 400/);
  });

  it('throws when userinfo omits sub', async () => {
    server.use(
      http.post('https://www.linkedin.com/oauth/v2/accessToken', () =>
        HttpResponse.json({ access_token: 't', expires_in: 60 }),
      ),
      http.get('https://api.linkedin.com/v2/userinfo', () => HttpResponse.json({})),
    );
    await expect(exchangeCode(CFG, 'code')).rejects.toThrow(/missing sub/);
  });
});
