import { NextResponse } from 'next/server';
import { requireDraftSession, SessionError } from '@/lib/review/requireSession';
import { collect } from '@/lib/collector';
import { loadConfig } from '@/lib/config/loader';
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
  try {
    const cfg = loadConfig();
    const items = await collect(cfg, { skipGithub: true });
    return NextResponse.json({ items });
  } catch (err) {
    log.error('sources fetch failed', { err: String(err) });
    return NextResponse.json({ error: 'sources fetch failed' }, { status: 500 });
  }
}
