import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { getDraft, isStalePublishing, transition } from '@/lib/state/drafts';
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
 *   - draft must be PENDING_REVIEW (first attempt) or PUBLISH_FAILED (retry)
 *   - posted `version` must match draft.version (no stale assertions)
 *   - WebAuthn assertion must verify against the challenge derived from
 *     (id, version, body) — captured assertions cannot be replayed against a
 *     different draft state.
 *
 * Anything else → 401/409. On success we move the draft through:
 *   PENDING_REVIEW/PUBLISH_FAILED → PUBLISHING → PUBLISHED (with URN).
 * On publisher rejection we move to PUBLISH_FAILED so the operator can retry
 * with a fresh assertion against the same body+version.
 *
 * Comment failures after a successful post-create are NOT fatal — the post is
 * already live on LinkedIn; retrying would duplicate it. Those surface as a
 * warning in the response body but the draft is still PUBLISHED with the URN.
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

  let draft = await getDraft(parsed.draft_id);
  if (!draft) return new NextResponse('draft not found', { status: 404 });

  // Recover stale PUBLISHING. A PUBLISHING draft means a prior request had
  // verified the assertion and started the LinkedIn call. If we got here, that
  // process is no longer alive (otherwise the draft would have settled to
  // PUBLISHED or PUBLISH_FAILED). After PUBLISHING_TIMEOUT_MS we demote to
  // PUBLISH_FAILED so the owner can retry instead of being permanently stuck.
  if (draft.status === 'PUBLISHING') {
    if (!isStalePublishing(draft)) {
      return new NextResponse('publish already in flight; wait', { status: 409 });
    }
    log.warn('recovering stale PUBLISHING draft', {
      draft_id: draft.id,
      publish_attempted_at: draft.publish_attempted_at,
    });
    draft = await transition(draft.id, 'PUBLISH_FAILED', {
      publishError: 'stale PUBLISHING recovered after timeout',
    });
  }

  if (draft.status !== 'PENDING_REVIEW' && draft.status !== 'PUBLISH_FAILED') {
    return new NextResponse(`draft not in a publishable state (status=${draft.status})`, { status: 409 });
  }
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

  // Move to PUBLISHING. If the LinkedIn call below fails, we'll land in
  // PUBLISH_FAILED — the draft remains retryable with a fresh assertion.
  const publishing = await transition(draft.id, 'PUBLISHING', { publishProof: proof });

  const publisher = new LinkedInApiPublisher({
    accessToken: token.access_token,
    personUrn: token.person_urn,
  });

  // Article kind: build the article payload and, if no thumbnail was uploaded
  // by the owner, try the OG image of the source URL. Falling back to a
  // thumbnail-less card if OG fetch fails is fine — LinkedIn renders the
  // card as title + domain in that case.
  let articleInput: Awaited<ReturnType<typeof buildArticleInput>> | undefined;
  if (publishing.content_kind === 'article' && publishing.article) {
    articleInput = await buildArticleInput(publishing.article);
  }

  let postResult: { urn: string };
  try {
    postResult = await publisher.publish({
      body: publishing.body,
      ...(publishing.hashtags.length > 0 ? { hashtags: publishing.hashtags } : {}),
      ...(articleInput ? { article: articleInput } : {}),
      ...(publishing.content_kind !== 'article' &&
      publishing.media?.bytes &&
      publishing.media.mime
        ? {
            image: {
              bytes: publishing.media.bytes,
              mime: publishing.media.mime,
              ...(publishing.media.alt !== undefined ? { alt: publishing.media.alt } : {}),
            },
          }
        : {}),
      // Inline link suppressed when posting as an article (source lives in the card).
      ...(publishing.content_kind !== 'article' && publishing.link?.placement === 'body'
        ? { link: publishing.link.url }
        : {}),
    });
  } catch (err) {
    const message = String(err);
    log.error('linkedin publish failed', { err: message, draft_id: draft.id });
    await transition(publishing.id, 'PUBLISH_FAILED', { publishError: message });
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  // Post is live on LinkedIn. Anything that fails from here is non-fatal —
  // a retry would create a duplicate post.
  await transition(publishing.id, 'PUBLISHED', { publishedUrn: postResult.urn });

  await recordPublished({
    draft_id: publishing.id,
    body: publishing.body,
    source_url: publishing.source_url,
    pillar: publishing.pillar,
    urn: postResult.urn,
    published_at: Date.now(),
  });

  let commentWarning: string | undefined;
  if (publishing.content_kind !== 'article' && publishing.link?.placement === 'comment') {
    try {
      await publisher.addComment(postResult.urn, publishing.link.url);
    } catch (err) {
      commentWarning = String(err);
      log.warn('addComment failed after publish — post is live without the link comment', {
        err: commentWarning,
        draft_id: draft.id,
        urn: postResult.urn,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    urn: postResult.urn,
    ...(commentWarning ? { commentWarning } : {}),
  });
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
