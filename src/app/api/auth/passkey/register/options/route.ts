import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { buildRegistrationOptions } from '@/lib/auth/webauthn';
import { getCurrentSession } from '@/lib/review/requireSession';
import { SESSION_COOKIE, createSession, sessionCookie } from '@/lib/review/session';
import { loadEnv } from '@/lib/config/loader';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Enrollment options. Permits two callers:
 *   - Authenticated session (rare — for adding a second passkey)
 *   - First-run bootstrap via ENROLLMENT_BOOTSTRAP_TOKEN
 *
 * When the bootstrap path is taken, we also issue a short-lived session so
 * the verify step doesn't need the token again.
 */
export async function POST(req: Request) {
  const env = loadEnv();
  const url = new URL(req.url);
  const bootstrap = url.searchParams.get('bootstrap');
  const sess = await getCurrentSession();
  const okBootstrap =
    bootstrap && env.ENROLLMENT_BOOTSTRAP_TOKEN && bootstrap === env.ENROLLMENT_BOOTSTRAP_TOKEN;
  if (!sess && !okBootstrap) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  // Reuse the existing session ID when present; otherwise create one and set
  // the cookie so verify/* can find it.
  const store = await cookies();
  let sid = store.get(SESSION_COOKIE)?.value;
  if (!sid) {
    sid = await createSession({ draftId: '*', ttlSeconds: 600 });
    const res = NextResponse.json(await buildRegistrationOptions(sid));
    res.headers.append('Set-Cookie', sessionCookie(sid, 600));
    return res;
  }
  return NextResponse.json(await buildRegistrationOptions(sid));
}
