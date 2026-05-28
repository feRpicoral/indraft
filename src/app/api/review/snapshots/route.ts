import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDraft, transition } from '@/lib/state/drafts';
import { requireDraftSession, SessionError } from '@/lib/review/requireSession';
import { getSnapshotByVersion, listSnapshots } from '@/lib/state/snapshots';
import type { Draft } from '@/lib/types';
import { log } from '@/lib/util/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const draftId = url.searchParams.get('draft_id');
  if (!draftId) return NextResponse.json({ error: 'missing draft_id' }, { status: 400 });
  try {
    await requireDraftSession(draftId);
  } catch (err) {
    if (err instanceof SessionError) return new NextResponse(err.message, { status: err.status });
    throw err;
  }
  const snapshots = await listSnapshots(draftId);
  return NextResponse.json({ snapshots });
}

const RestoreSchema = z.object({
  draft_id: z.string(),
  version: z.number().int().positive(),
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = RestoreSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
  try {
    await requireDraftSession(parsed.draft_id);
  } catch (err) {
    if (err instanceof SessionError) return new NextResponse(err.message, { status: err.status });
    throw err;
  }
  const current = await getDraft(parsed.draft_id);
  if (!current) return new NextResponse('draft not found', { status: 404 });
  if (current.status !== 'PENDING_REVIEW') {
    return new NextResponse('draft is not editable in its current state', { status: 409 });
  }

  const snapshot = await getSnapshotByVersion(parsed.draft_id, parsed.version);
  if (!snapshot) return new NextResponse('snapshot not found', { status: 404 });

  // Apply the snapshot fields as a patch. Slot fields (media, article, link)
  // need explicit undefined when the snapshot didn't have them, so the spread
  // in transition() actually clears them rather than keeping the current value.
  const patch: Partial<Draft> = {
    body: snapshot.fields.body,
    content_kind: snapshot.fields.content_kind,
    hashtags: [...snapshot.fields.hashtags],
    mentions: [...snapshot.fields.mentions],
    pillar: snapshot.fields.pillar,
    source_url: snapshot.fields.source_url,
    link: snapshot.fields.link,
    article: snapshot.fields.article,
    media: snapshot.fields.media,
    verbatim_ranges: snapshot.fields.verbatim_ranges,
  };

  try {
    const updated = await transition(parsed.draft_id, 'EDITED', {
      patch,
      snapshotMeta: { actor: 'system', summary: `Restored version ${snapshot.version}` },
    });
    return NextResponse.json({ draft: updated });
  } catch (err) {
    log.error('restore failed', { err: String(err) });
    return NextResponse.json({ error: 'restore failed' }, { status: 500 });
  }
}
