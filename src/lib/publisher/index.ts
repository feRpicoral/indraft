export interface PublishInput {
  body: string;
  /**
   * Article content. When set, the post is published as an Article post
   * (`content.article`) and the optional `image`/`link` fields are ignored
   * — LinkedIn renders the source inside the card.
   */
  article?: {
    source: string;
    title: string;
    /** Optional thumbnail bytes. Uploaded to LinkedIn and referenced as URN. */
    thumbnail?: { bytes: string; mime: string; alt?: string };
  };
  image?: { bytes?: string; url?: string; mime: string; alt?: string };
  /** When set, included in the post body (only if `link_placement === "body"`). */
  link?: string;
  /** Hashtags to append to the body (without leading `#`). */
  hashtags?: string[];
}

export interface PublishResult {
  urn: string;
}

export interface Publisher {
  publish(post: PublishInput): Promise<PublishResult>;
  addComment(postUrn: string, text: string): Promise<void>;
  healthCheck(): Promise<{ ok: boolean; reason?: string }>;
}

export class PublisherAuthError extends Error {
  override name = 'PublisherAuthError';
}

export class PublisherRateLimitError extends Error {
  override name = 'PublisherRateLimitError';
}

export { LinkedInApiPublisher } from './linkedin';
