import { fetchWithRetry } from '../util/http';
import { log } from '../util/logger';
import {
  PublisherAuthError,
  PublisherRateLimitError,
  type Publisher,
  type PublishInput,
  type PublishResult,
} from './index';
import { uploadImage } from './linkedinUpload';
import { escapeLittleTextFormat, hashtagTemplate } from '../util/littleText';

const LI_BASE = 'https://api.linkedin.com/rest';

/**
 * Pinned to the YYYYMM version we built against. Update intentionally;
 * leaving this fixed means LinkedIn's monthly breaking changes don't silently
 * affect us. Confirm the current version against developer docs before bumping.
 */
const DEFAULT_API_VERSION = '202605';

export interface LinkedInApiPublisherOpts {
  accessToken: string;
  personUrn: string;
  apiVersion?: string;
}

export class LinkedInApiPublisher implements Publisher {
  private readonly accessToken: string;
  private readonly personUrn: string;
  private readonly apiVersion: string;

  constructor(opts: LinkedInApiPublisherOpts) {
    this.accessToken = opts.accessToken;
    this.personUrn = opts.personUrn;
    this.apiVersion = opts.apiVersion ?? DEFAULT_API_VERSION;
  }

  async publish(post: PublishInput): Promise<PublishResult> {
    let imageUrn: string | undefined;
    let thumbnailUrn: string | undefined;
    if (post.article?.thumbnail?.bytes) {
      thumbnailUrn = await uploadImage({
        accessToken: this.accessToken,
        personUrn: this.personUrn,
        bytes: Buffer.from(post.article.thumbnail.bytes, 'base64'),
        mime: post.article.thumbnail.mime,
        apiVersion: this.apiVersion,
      });
    } else if (!post.article && post.image?.bytes) {
      imageUrn = await uploadImage({
        accessToken: this.accessToken,
        personUrn: this.personUrn,
        bytes: Buffer.from(post.image.bytes, 'base64'),
        mime: post.image.mime,
        apiVersion: this.apiVersion,
      });
    }

    const body = this.composePost(post, imageUrn, thumbnailUrn);

    log.info('linkedin publish: sending', {
      kind: post.article ? 'article' : imageUrn ? 'single_image' : 'text',
      commentary_len: typeof body.commentary === 'string' ? body.commentary.length : -1,
      body_len: post.body.length,
      hashtag_count: post.hashtags?.length ?? 0,
      has_image: !!imageUrn,
      has_thumbnail: !!thumbnailUrn,
      has_link: !!post.link && !post.article,
    });

    const res = await fetchWithRetry(`${LI_BASE}/posts`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      retries: 2,
    });

    if (res.status === 401) throw new PublisherAuthError('LinkedIn token rejected on publish');
    if (res.status === 429) throw new PublisherRateLimitError('LinkedIn rate limit on publish');
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`LinkedIn publish ${res.status}: ${t.slice(0, 300)}`);
    }

    const urn = res.headers.get('x-restli-id') ?? res.headers.get('X-RestLi-Id');
    if (!urn) {
      log.warn('linkedin publish: no urn header', { status: res.status });
      throw new Error('LinkedIn publish returned no URN header');
    }
    log.info('linkedin publish: ok', { urn, status: res.status });
    return { urn };
  }

  async addComment(postUrn: string, text: string): Promise<void> {
    const encoded = encodeURIComponent(postUrn);
    const res = await fetchWithRetry(`${LI_BASE}/socialActions/${encoded}/comments`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        actor: this.personUrn,
        object: postUrn,
        message: { text },
      }),
      retries: 2,
    });
    if (res.status === 401) throw new PublisherAuthError('LinkedIn token rejected on comment');
    if (res.status === 429) throw new PublisherRateLimitError('LinkedIn rate limit on comment');
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`LinkedIn addComment ${res.status}: ${t.slice(0, 300)}`);
    }
  }

  async healthCheck(): Promise<{ ok: boolean; reason?: string }> {
    try {
      const res = await fetchWithRetry('https://api.linkedin.com/v2/userinfo', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
        retries: 0,
        timeoutMs: 5000,
      });
      if (res.status === 401) return { ok: false, reason: 'token rejected (401)' };
      return { ok: res.ok };
    } catch (err) {
      return { ok: false, reason: String(err) };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'LinkedIn-Version': this.apiVersion,
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json',
    };
  }

  private composePost(
    post: PublishInput,
    imageUrn: string | undefined,
    thumbnailUrn: string | undefined,
  ): Record<string, unknown> {
    // Compose: body + optional hashtag block + optional inline link. Everything
    // goes through Little Text Format escaping because LinkedIn silently truncates
    // commentary at the first unescaped reserved character (notably `(` and `)` —
    // those trip the MentionElement parser). Hashtags use the explicit template
    // form to be rendered as hashtags AFTER the body escape.
    // Spec: https://learn.microsoft.com/.../shares/little-text-format
    let commentary = escapeLittleTextFormat(post.body);
    if (post.hashtags && post.hashtags.length > 0) {
      const tagLine = post.hashtags.map(hashtagTemplate).join(' ');
      commentary = `${commentary}\n\n${tagLine}`;
    }
    // Article posts render their source inside the card; suppress inline link.
    if (post.link && !post.article) {
      commentary = `${commentary}\n\n${escapeLittleTextFormat(post.link)}`;
    }

    const base: Record<string, unknown> = {
      author: this.personUrn,
      commentary,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    if (post.article) {
      // Article-content rendering. Title required; thumbnail optional. When the
      // thumbnail is absent LinkedIn still renders a card (title + source domain).
      const article: Record<string, unknown> = {
        source: post.article.source,
        title: post.article.title,
      };
      if (thumbnailUrn) {
        article.thumbnail = thumbnailUrn;
      }
      base.content = { article };
    } else if (imageUrn) {
      base.content = {
        media: { id: imageUrn, altText: post.image?.alt ?? '' },
      };
    }
    return base;
  }
}
