import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDraft, transition } from '@/lib/state/drafts';
import { requireDraftSession, SessionError } from '@/lib/review/requireSession';
import { draft as generateDraft } from '@/lib/generator';
import { buildProvider } from '@/lib/llm';
import { loadConfig } from '@/lib/config/loader';
import { collect } from '@/lib/collector';
import { selectMedia } from '@/lib/media';
import { recentPillars, lastPillar } from '@/lib/state/history';
import type { Draft, EditTurn, Pillar } from '@/lib/types';
import { log } from '@/lib/util/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({
  draft_id: z.string(),
  source_url: z.string().url(),
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
  const sources = await collect(cfg, { skipGithub: true });
  const chosen = sources.find((s) => s.url === parsed.source_url);
  if (!chosen) {
    return NextResponse.json(
      { error: 'source not in current feed snapshot' },
      { status: 404 },
    );
  }

  const llm = buildProvider(cfg);
  const recent = await recentPillars();
  const last = await lastPillar();
  const targetPillar = pickPillar(cfg.content.pillars, last, recent);

  try {
    const { output } = await generateDraft(
      { cfg, llm },
      { sources, chosenItem: chosen, targetPillar, recentPillars: recent },
    );
    const media = await selectMedia(output, cfg);

    const switchTurn: EditTurn = {
      role: 'assistant',
      content: `Switched source to: ${chosen.title}`,
      ts: Date.now(),
    };
    const patch: Partial<Draft> = {
      body: output.body,
      content_kind: output.content_kind,
      hashtags: output.hashtags,
      mentions: output.mentions,
      pillar: output.pillar,
      source_url: output.source_url,
      conversation: [...current.conversation, switchTurn],
      verbatim_ranges: output.verbatim_ranges,
    };
    if (output.link) patch.link = { url: output.link, placement: output.link_placement };
    else patch.link = undefined;
    if (output.content_kind === 'article' && output.article) {
      patch.article = { source: output.article.source, title: output.article.title };
    } else {
      patch.article = undefined;
    }
    if (output.content_kind === 'single_image') {
      if (media) patch.media = media;
      else if (output.image_source !== 'owner') patch.media = undefined;
    } else {
      patch.media = undefined;
    }

    const updated = await transition(current.id, 'EDITED', {
      patch,
      snapshotMeta: { actor: 'system', summary: `Switched source to: ${chosen.title}` },
    });
    return NextResponse.json({ draft: updated });
  } catch (err) {
    log.error('regenerate failed', { err: String(err) });
    return NextResponse.json({ error: 'regenerate failed' }, { status: 500 });
  }
}

function pickPillar(pillars: Pillar[], last: Pillar | null, recent: Pillar[]): Pillar {
  const ranking = pillars.map((p) => {
    const idx = recent.indexOf(p);
    return { p, score: idx === -1 ? Infinity : -idx };
  });
  const candidates = pillars.length > 1 ? ranking.filter((r) => r.p !== last) : ranking;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.p ?? pillars[0]!;
}
