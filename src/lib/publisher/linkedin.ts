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
    if (post.image?.bytes) {
      const bytes = Buffer.from(post.image.bytes, 'base64');
      imageUrn = await uploadImage({
        accessToken: this.accessToken,
        personUrn: this.personUrn,
        bytes,
        mime: post.image.mime,
        apiVersion: this.apiVersion,
      });
    }

    const body = this.composePost(post, imageUrn);

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
  ): Record<string, unknown> {
    // Compose: body + optional hashtag block + optional inline link.
    // Hashtags live in their own trailing block; the body itself never carries them.
    // Comment-placement is handled by a separate addComment call by the route.
    let commentary = post.body;
    if (post.hashtags && post.hashtags.length > 0) {
      const tagLine = post.hashtags
        .map((t) => `#${t.replace(/^#+/, '')}`)
        .join(' ');
      commentary = `${commentary}\n\n${tagLine}`;
    }
    if (post.link) {
      commentary = `${commentary}\n\n${post.link}`;
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

    if (imageUrn) {
      base.content = {
        media: { id: imageUrn, altText: post.image?.alt ?? '' },
      };
    }
    return base;
  }
}
