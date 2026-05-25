import { NextResponse } from 'next/server';
import { getDraft, transition } from '@/lib/state/drafts';
import { requireDraftSession, SessionError } from '@/lib/review/requireSession';
import { validateImage } from '@/lib/media/validate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 1 * 1024 * 1024; // 1MB cap for inline storage

export async function POST(req: Request) {
  const form = await req.formData();
  const draftId = form.get('draft_id');
  const file = form.get('file');
  if (typeof draftId !== 'string' || !(file instanceof File)) {
    return NextResponse.json({ error: 'missing draft_id or file' }, { status: 400 });
  }
  try {
    await requireDraftSession(draftId);
  } catch (err) {
    if (err instanceof SessionError) return new NextResponse(err.message, { status: err.status });
    throw err;
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 1MB)' }, { status: 413 });
  }
  const meta = validateImage({ mime: file.type, size: file.size });
  if (!meta.ok) {
    return NextResponse.json({ error: meta.reason }, { status: 415 });
  }
  const draft = await getDraft(draftId);
  if (!draft) return new NextResponse('draft not found', { status: 404 });

  const bytes = Buffer.from(await file.arrayBuffer()).toString('base64');
  const alt = typeof form.get('alt') === 'string' ? (form.get('alt') as string) : '';

  // Attach the image without bumping version — image upload alone shouldn't
  // invalidate a passkey assertion already in flight.
  const updated = await transition(draftId, 'EDITED', {
    patch: {
      media: { kind: 'owner', bytes, mime: file.type, alt },
    },
  });
  return NextResponse.json({ ok: true, draft: updated });
}
