import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { getDraft, transition } from '@/lib/state/drafts';
import { requireDraftSession, SessionError } from '@/lib/review/requireSession';
import { SESSION_COOKIE } from '@/lib/review/session';
import { challengeFor } from '@/lib/review';
import { verifyAuthentication } from '@/lib/auth/webauthn';
import { getLinkedInToken } from '@/lib/state/tokens';
import { LinkedInApiPublisher } from '@/lib/publisher';
import { recordPublished } from '@/lib/state/history';
import { fetchOgImage } from '@/lib/util/ogImage';
import type { DraftArticle } from '@/lib/types';
import { log } from '@/lib/util/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({
  draft_id: z.string(),
  version: z.number().int().positive(),
  assertion: z.unknown(),
});

/**
 * The single publish path. Enforces the publish-guard invariant:
 *
 *   - session cookie must bind to this draft id
 *   - draft must be PENDING_REVIEW
 *   - posted `version` must match draft.version (no stale assertions)
 *   - WebAuthn assertion must verify against the challenge derived from
 *     (id, version, body) — captured assertions cannot be replayed against a
 *     different draft state.
 *
 * Anything else → 401/409. Only when ALL pass do we transition to PUBLISHED
 * (with a publishProof) and call the LinkedIn publisher.
 */
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
  if (draft.status !== 'PENDING_REVIEW') return new NextResponse('draft not in PENDING_REVIEW', { status: 409 });
  if (draft.version !== parsed.version) return new NextResponse('stale version', { status: 409 });

  const expected = challengeFor(draft);
  const cookieStore = await cookies();
  const sid = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sid) return new NextResponse('no session', { status: 401 });

  // Verify the assertion against the challenge derived from the current draft state.
  // The challenge was stored in KV by /api/auth/passkey/assert/options for this session id.
  const verified = await verifyAuthentication({
    sessionId: sid,
    response: parsed.assertion as never,
  });
  if (!verified.verified) {
    log.warn('publish blocked: assertion failed verification', { draft_id: draft.id });
    return new NextResponse('passkey assertion failed', { status: 401 });
  }

  // The publish-guard considers the assertion both required AND content-bound.
  // verifyAuthentication checked the *challenge*; here we additionally derive a
  // publishProof from the (assertion, expected) pair so transition() can record
  // it for audit.
  const proof = createHash('sha256')
    .update(String((parsed.assertion as { id?: string }).id ?? ''))
    .update('|')
    .update(expected)
    .digest('hex');

  const token = await getLinkedInToken();
  if (!token) return new NextResponse('linkedin token missing', { status: 412 });

  // Transition first so a publisher failure leaves the draft in PUBLISHED but
  // with no URN. We surface failures via the response body, and the operator
  // can manually retry the LinkedIn call against the URN.
  const published = await transition(draft.id, 'PUBLISHED', { publishProof: proof });

  try {
    const publisher = new LinkedInApiPublisher({
      accessToken: token.access_token,
      personUrn: token.person_urn,
    });
    // Article kind: build the article payload and, if no thumbnail was uploaded
    // by the owner, try the OG image of the source URL. Falling back to a
    // thumbnail-less card if OG fetch fails is fine — LinkedIn renders the
    // card as title + domain in that case.
    let articleInput: Awaited<ReturnType<typeof buildArticleInput>> | undefined;
    if (published.content_kind === 'article' && published.article) {
      articleInput = await buildArticleInput(published.article);
    }

    const result = await publisher.publish({
      body: published.body,
      ...(published.hashtags.length > 0 ? { hashtags: published.hashtags } : {}),
      ...(articleInput ? { article: articleInput } : {}),
      // Single-image content only when not an article post.
      ...(published.content_kind !== 'article' &&
      published.media?.bytes &&
      published.media.mime
        ? {
            image: {
              bytes: published.media.bytes,
              mime: published.media.mime,
              ...(published.media.alt !== undefined ? { alt: published.media.alt } : {}),
            },
          }
        : {}),
      // Inline link suppressed when posting as an article (source lives in the card).
      ...(published.content_kind !== 'article' && published.link?.placement === 'body'
        ? { link: published.link.url }
        : {}),
    });
    if (published.content_kind !== 'article' && published.link?.placement === 'comment') {
      await publisher.addComment(result.urn, published.link.url);
    }
    await recordPublished({
      draft_id: published.id,
      body: published.body,
      source_url: published.source_url,
      pillar: published.pillar,
      urn: result.urn,
      published_at: Date.now(),
    });
    return NextResponse.json({ ok: true, urn: result.urn });
  } catch (err) {
    log.error('linkedin publish failed after transition', { err: String(err), draft_id: draft.id });
    return NextResponse.json({ ok: false, error: String(err) }, { status: 502 });
  }
}

/**
 * Build the publisher's article input from `draft.article`. If the owner didn't
 * upload a thumbnail, try to fetch the source URL's OG image as a fallback.
 * Returns the article shape ready to hand to the publisher; thumbnail key is
 * omitted when no image is available (LinkedIn renders title + domain in that
 * case, which is fine).
 */
async function buildArticleInput(
  article: DraftArticle,
): Promise<{
  source: string;
  title: string;
  thumbnail?: { bytes: string; mime: string; alt?: string };
}> {
  const base = { source: article.source, title: article.title };
  if (article.thumbnail?.bytes && article.thumbnail.mime) {
    return {
      ...base,
      thumbnail: {
        bytes: article.thumbnail.bytes,
        mime: article.thumbnail.mime,
        ...(article.thumbnail.alt !== undefined ? { alt: article.thumbnail.alt } : {}),
      },
    };
  }
  const og = await fetchOgImage(article.source);
  if (og) {
    log.info('article publish: og thumbnail fetched', { source: article.source });
    return {
      ...base,
      thumbnail: { bytes: og.bytes, mime: og.mime, ...(og.alt ? { alt: og.alt } : {}) },
    };
  }
  log.info('article publish: no thumbnail available, publishing card without one', {
    source: article.source,
  });
  return base;
}
