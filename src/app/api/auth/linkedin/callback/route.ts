import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeCode } from '@/lib/auth/linkedinOAuth';
import { setLinkedInToken } from '@/lib/state/tokens';
import { loadEnv } from '@/lib/config/loader';
import { log } from '@/lib/util/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STATE_COOKIE = 'indraft_oauth_state';

export async function GET(req: Request) {
  const env = loadEnv();
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return new NextResponse('invalid state', { status: 400 });
  }
  cookieStore.delete(STATE_COOKIE);

  if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET) {
    return new NextResponse('linkedin not configured', { status: 412 });
  }

  try {
    const redirectUri = `${env.APP_URL}/api/auth/linkedin/callback`;
    const result = await exchangeCode(
      {
        clientId: env.LINKEDIN_CLIENT_ID,
        clientSecret: env.LINKEDIN_CLIENT_SECRET,
        redirectUri,
      },
      code,
    );
    await setLinkedInToken({
      access_token: result.access_token,
      issued_at: Date.now(),
      expires_in: result.expires_in,
      sub: result.sub,
      person_urn: result.person_urn,
    });
    log.info('linkedin token stored', { sub: result.sub });
    return NextResponse.redirect(`${env.APP_URL}/access`);
  } catch (err) {
    log.error('linkedin callback failed', { err: String(err) });
    return new NextResponse(`oauth failed: ${String(err)}`, { status: 500 });
  }
}
