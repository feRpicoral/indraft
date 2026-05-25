import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAuthentication } from '@/lib/auth/webauthn';
import { SESSION_COOKIE } from '@/lib/review/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Verifies an assertion in isolation. The publish route (/api/review/publish)
 * additionally calls verifyAuthentication to gate the irreversible action;
 * this endpoint exists as a stand-alone verifier (e.g. for /enroll smoke
 * tests after registration).
 */
export async function POST(req: Request) {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (!sid) return new NextResponse('no session', { status: 401 });
  const body = (await req.json()) as never;
  const r = await verifyAuthentication({ sessionId: sid, response: body });
  return NextResponse.json({ verified: r.verified });
}
