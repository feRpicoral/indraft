import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyRegistration } from '@/lib/auth/webauthn';
import { SESSION_COOKIE } from '@/lib/review/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (!sid) return new NextResponse('no session', { status: 401 });
  const body = (await req.json()) as never;
  const r = await verifyRegistration({ sessionId: sid, response: body });
  if (!r.verified) return NextResponse.json({ verified: false }, { status: 400 });
  return NextResponse.json({ verified: true });
}
