import { fetchWithRetry } from '../util/http';

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

export const SCOPES = 'openid profile email w_member_social';

export interface LinkedInOAuthCfg {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function buildAuthUrl(cfg: LinkedInOAuthCfg, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: SCOPES,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface TokenExchangeResult {
  access_token: string;
  expires_in: number;
  /** OIDC subject identifier — the LinkedIn person ID. */
  sub: string;
  person_urn: string;
}

/**
 * Exchange an authorization `code` for an access token, then resolve the
 * owner's person URN via OIDC userinfo. The two-step flow is necessary because
 * the token response doesn't include the user identifier directly.
 */
export async function exchangeCode(
  cfg: LinkedInOAuthCfg,
  code: string,
): Promise<TokenExchangeResult> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const tokenRes = await fetchWithRetry(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    retries: 1,
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error(`LinkedIn token exchange ${tokenRes.status}: ${t.slice(0, 300)}`);
  }
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!tokenJson.access_token || !tokenJson.expires_in) {
    throw new Error('LinkedIn token response missing fields');
  }

  const sub = await fetchSub(tokenJson.access_token);
  return {
    access_token: tokenJson.access_token,
    expires_in: tokenJson.expires_in,
    sub,
    person_urn: `urn:li:person:${sub}`,
  };
}

async function fetchSub(accessToken: string): Promise<string> {
  const res = await fetchWithRetry(USERINFO_URL, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
    retries: 1,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`LinkedIn userinfo ${res.status}: ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as { sub?: string };
  if (!json.sub) throw new Error('LinkedIn userinfo response missing sub');
  return json.sub;
}
