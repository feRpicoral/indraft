import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDraft, transition } from '@/lib/state/drafts';
import { requireDraftSession, SessionError } from '@/lib/review/requireSession';
import { buildEditPatch } from '@/lib/review/conversation';
import { edit as generateEdit } from '@/lib/generator';
import { buildProvider } from '@/lib/llm';
import { loadConfig } from '@/lib/config/loader';
import { collect } from '@/lib/collector';
import { log } from '@/lib/util/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({
  draft_id: z.string(),
  message: z.string().min(1),
  pastedUrl: z.string().url().optional(),
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
  const current = await getDraft(parsed.draft_id);
  if (!current) return new NextResponse('draft not found', { status: 404 });
  if (current.status !== 'PENDING_REVIEW') {
    return new NextResponse('draft is not editable in its current state', { status: 409 });
  }

  const cfg = loadConfig();
  const llm = buildProvider(cfg);
  const sources = await collect(cfg, { skipGithub: true });

  try {
    const { output } = await generateEdit(
      { cfg, llm },
      {
        current,
        message: parsed.message,
        sources,
        ...(parsed.pastedUrl !== undefined ? { pastedUrl: parsed.pastedUrl } : {}),
      },
    );
    const patch = buildEditPatch({
      current,
      userMessage: parsed.message,
      output,
      ...(parsed.pastedUrl !== undefined ? { pastedUrl: parsed.pastedUrl } : {}),
    });
    const updated = await transition(current.id, 'EDITED', { patch });
    return NextResponse.json({ draft: updated });
  } catch (err) {
    log.error('edit failed', { err: String(err) });
    return NextResponse.json({ error: 'edit failed' }, { status: 500 });
  }
}
