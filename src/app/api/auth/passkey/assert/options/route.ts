import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { buildAuthenticationOptions } from '@/lib/auth/webauthn';
import { SESSION_COOKIE } from '@/lib/review/session';
import { getDraft } from '@/lib/state/drafts';
import { challengeFor } from '@/lib/review';
import { requireDraftSession, SessionError } from '@/lib/review/requireSession';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({
  draft_id: z.string(),
  version: z.number().int().positive(),
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
  try {
    await requireDraftSession(parsed.draft_id);
  } catch (err) {
    if (err instanceof SessionError) return new NextResponse(err.message, { status: err.status });
    throw err;
  }
  const draft = await getDraft(parsed.draft_id);
  if (!draft || draft.version !== parsed.version) {
    return new NextResponse('stale draft', { status: 409 });
  }
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (!sid) return new NextResponse('no session', { status: 401 });

  const opts = await buildAuthenticationOptions({
    sessionId: sid,
    challengeBinding: challengeFor(draft),
  });
  return NextResponse.json(opts);
}
