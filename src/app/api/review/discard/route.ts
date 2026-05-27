import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDraft, isStalePublishing, transition } from '@/lib/state/drafts';
import { requireDraftSession, SessionError } from '@/lib/review/requireSession';
import { log } from '@/lib/util/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({ draft_id: z.string() });

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
  if (!draft) return new NextResponse('draft not found', { status: 404 });
  if (draft.status === 'PUBLISHED' || draft.status === 'DISCARDED') {
    return new NextResponse('draft is in a terminal state', { status: 409 });
  }
  if (draft.status === 'PUBLISHING') {
    // A publish is currently in flight. Refuse to discard until it lands —
    // discarding mid-publish would let the post hit LinkedIn while we mark
    // the draft as gone. After PUBLISHING_TIMEOUT_MS the originating request
    // is assumed dead and we route through PUBLISH_FAILED so discard works.
    if (!isStalePublishing(draft)) {
      return new NextResponse('draft is mid-publish; wait for it to settle', { status: 409 });
    }
    log.warn('discarding stale PUBLISHING draft via PUBLISH_FAILED', {
      draft_id: draft.id,
      publish_attempted_at: draft.publish_attempted_at,
    });
    await transition(draft.id, 'PUBLISH_FAILED', {
      publishError: 'stale PUBLISHING recovered before discard',
    });
  }
  await transition(parsed.draft_id, 'DISCARDED');
  return NextResponse.json({ ok: true });
}
