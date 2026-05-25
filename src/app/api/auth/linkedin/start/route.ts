import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { buildAuthUrl } from '@/lib/auth/linkedinOAuth';
import { loadEnv } from '@/lib/config/loader';
import { getCurrentSession } from '@/lib/review/requireSession';
import { newNonce } from '@/lib/util/id';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STATE_COOKIE = 'indraft_oauth_state';

export async function GET(req: Request) {
  const env = loadEnv();
  if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET) {
    return new NextResponse('LinkedIn OAuth not configured', { status: 412 });
  }

  // Two paths in:
  //   1. First-time bootstrap via ENROLLMENT_BOOTSTRAP_TOKEN query
  //   2. Returning user with a valid session
  const url = new URL(req.url);
  const bootstrap = url.searchParams.get('bootstrap');
  const sess = await getCurrentSession();
  const okBootstrap = bootstrap && env.ENROLLMENT_BOOTSTRAP_TOKEN && bootstrap === env.ENROLLMENT_BOOTSTRAP_TOKEN;
  if (!okBootstrap && !sess) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  const state = newNonce();
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  const redirectUri = `${env.APP_URL ?? new URL(req.url).origin}/api/auth/linkedin/callback`;
  const authUrl = buildAuthUrl(
    {
      clientId: env.LINKEDIN_CLIENT_ID,
      clientSecret: env.LINKEDIN_CLIENT_SECRET,
      redirectUri,
    },
    state,
  );
  return NextResponse.redirect(authUrl);
}
