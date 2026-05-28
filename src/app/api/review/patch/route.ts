import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDraft, transition } from '@/lib/state/drafts';
import { requireDraftSession, SessionError } from '@/lib/review/requireSession';
import { validateImage } from '@/lib/media/validate';
import type { Draft } from '@/lib/types';
import { log } from '@/lib/util/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_INLINE_IMAGE_BYTES = 1 * 1024 * 1024;

const OwnerMediaSchema = z.object({
  kind: z.literal('owner'),
  bytes: z.string().min(1),
  mime: z.enum(['image/png', 'image/jpeg']),
  alt: z.string().max(500).optional(),
});

function validateInlineMedia(media: z.infer<typeof OwnerMediaSchema>): string | null {
  const size = Buffer.byteLength(media.bytes, 'base64');
  if (size > MAX_INLINE_IMAGE_BYTES) {
    return `size ${size}B exceeds ${MAX_INLINE_IMAGE_BYTES}B`;
  }
  const meta = validateImage({ mime: media.mime, size });
  return meta.ok ? null : (meta.reason ?? 'invalid image');
}

/**
 * Direct field-level edit for a draft. Skips the LLM entirely — the owner
 * supplies the new values. The state machine still routes through EDITED so
 * the version bumps; any in-flight WebAuthn assertion is invalidated and the
 * subsequent publish must re-bind to the new draft.
 *
 * The chat-based `/api/review/edit` path remains the default. This route is
 * for "I know exactly what I want" edits (typos, hashtag tweaks, etc.).
 */
const BodySchema = z.object({
  draft_id: z.string(),
  body: z.string().min(1).max(3000).optional(),
  hashtags: z.array(z.string().min(1)).max(10).optional(),
  pillar: z.string().min(1).optional(),
  link_url: z.string().url().nullable().optional(),
  link_placement: z.enum(['none', 'body', 'comment']).optional(),
  media: OwnerMediaSchema.optional(),
  /** Set to true to remove the currently attached image. */
  remove_media: z.boolean().optional(),
  /** Set to true to remove the article thumbnail. Keeps the article fields. */
  remove_thumbnail: z.boolean().optional(),
  /** Switch the post kind. Clears fields belonging to the other kinds. */
  content_kind: z.enum(['text', 'single_image', 'article']).optional(),
  /** Article-card fields. Partial; only supplied keys overwrite. */
  article: z
    .object({
      source: z.string().url().optional(),
      title: z.string().min(1).max(400).optional(),
      thumbnail: OwnerMediaSchema.optional(),
    })
    .optional(),
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
  const mediaError = parsed.media ? validateInlineMedia(parsed.media) : null;
  if (mediaError) {
    return NextResponse.json({ error: mediaError }, { status: 415 });
  }
  const thumbnailError = parsed.article?.thumbnail
    ? validateInlineMedia(parsed.article.thumbnail)
    : null;
  if (thumbnailError) {
    return NextResponse.json({ error: thumbnailError }, { status: 415 });
  }

  // Build the patch from only the fields the caller actually supplied. The
  // owner's verbatim edit is already exempt from the linter — we record the
  // whole body as a verbatim range so a subsequent LLM edit also respects it.
  const patch: Partial<Draft> = {};
  if (parsed.body !== undefined) {
    patch.body = parsed.body;
    patch.verbatim_ranges = [[0, parsed.body.length]];
  }
  if (parsed.hashtags !== undefined) {
    patch.hashtags = parsed.hashtags.map((h) => h.replace(/^#+/, ''));
  }
  if (parsed.pillar !== undefined) patch.pillar = parsed.pillar;
  if (parsed.remove_media) {
    patch.media = undefined;
  }
  if (parsed.media !== undefined) {
    patch.media = parsed.media;
  }
  if (parsed.link_url !== undefined || parsed.link_placement !== undefined) {
    if (parsed.link_url === null || parsed.link_placement === 'none') {
      patch.link = undefined;
    } else if (parsed.link_url) {
      patch.link = {
        url: parsed.link_url,
        placement: parsed.link_placement ?? current.link?.placement ?? 'none',
      };
    }
  }
  if (parsed.article) {
    const existing = current.article ?? { source: '', title: '' };
    patch.article = {
      ...existing,
      ...(parsed.article.source !== undefined ? { source: parsed.article.source } : {}),
      ...(parsed.article.title !== undefined ? { title: parsed.article.title } : {}),
      ...(parsed.article.thumbnail !== undefined ? { thumbnail: parsed.article.thumbnail } : {}),
    };
  }
  if (parsed.remove_thumbnail) {
    const existing = patch.article ?? current.article;
    if (existing) {
      patch.article = { source: existing.source, title: existing.title };
    }
  }
  // Switching content_kind clears fields that belong to the other kinds so a
  // stale image or article record doesn't ride along into the publish call.
  if (parsed.content_kind !== undefined && parsed.content_kind !== current.content_kind) {
    patch.content_kind = parsed.content_kind;
    if (parsed.content_kind !== 'single_image') patch.media = undefined;
    if (parsed.content_kind !== 'article') patch.article = undefined;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ draft: current });
  }

  try {
    const updated = await transition(current.id, 'EDITED', { patch });
    return NextResponse.json({ draft: updated });
  } catch (err) {
    log.error('patch failed', { err: String(err) });
    return NextResponse.json({ error: 'patch failed' }, { status: 500 });
  }
}
