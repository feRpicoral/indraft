export type Pillar = string; // free-form, validated against config.content.pillars at runtime

export type SourceCategory = 'dev' | 'ai_research' | 'hardware' | 'business' | 'personal';

export interface SourceItem {
  title: string;
  url: string;
  summary: string;
  source: string;
  published_at: number; // epoch ms
  category: SourceCategory;
  score?: number;
}

export type LinkPlacement = 'none' | 'body' | 'comment';

export type ImageSource = 'none' | 'owner' | 'stock' | 'ai';

/**
 * Discriminator on the kind of post we're publishing. Drives publisher
 * dispatch and what fields the UI exposes.
 *
 * - `text`: commentary only, no media. Default.
 * - `single_image`: commentary + one image (via `Draft.media`).
 * - `article`: rich-card link share. Uses `Draft.article`; the link suppression
 *   workarounds (`link_placement`) don't apply since LinkedIn renders the source
 *   inside the card.
 *
 * `multi_image` is reserved for a later PR; intentionally not listed yet so the
 * type system flags unhandled cases.
 */
export type ContentKind = 'text' | 'single_image' | 'article';

export interface DraftMedia {
  kind: 'owner' | 'stock' | 'ai';
  url?: string;
  alt?: string;
  /** Base64-encoded bytes when the image is stored inline (≤1MB). */
  bytes?: string;
  mime?: string;
}

export interface DraftLink {
  url: string;
  placement: LinkPlacement;
}

/**
 * LinkedIn's ArticleContent shape, minus the fields that don't render in the
 * published card (description, thumbnailAltText). `source` and `title` are
 * required at publish; thumbnail is optional and reuses DraftMedia so the
 * single-image upload primitive carries it.
 */
export interface DraftArticle {
  source: string;
  title: string;
  thumbnail?: DraftMedia;
}

/**
 * One turn in the review conversation. Either the user editing or the model
 * responding. Persisted on the draft so the full edit history survives across
 * sessions.
 */
export interface EditTurn {
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  /** Optional URL the user pasted; fetched server-side for fresh context. */
  pastedUrl?: string;
  ts: number;
}

export type DraftStatus =
  | 'DRAFTED'
  | 'PENDING_REVIEW'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'PUBLISH_FAILED'
  | 'DISCARDED'
  | 'EDITED'
  | 'STALE';

export interface Draft {
  id: string;
  /** Bumps on every edit. Publish requires the assertion to match the current version. */
  version: number;
  status: DraftStatus;
  body: string;
  content_kind: ContentKind;
  /** Single image — only consulted when content_kind === 'single_image'. */
  media?: DraftMedia;
  /** Article card — only consulted when content_kind === 'article'. */
  article?: DraftArticle;
  link?: DraftLink;
  hashtags: string[];
  mentions: string[];
  pillar: Pillar;
  source_url: string;
  conversation: EditTurn[];
  /** Linter findings on the latest body. Surfaced in the UI; do not block publish. */
  linter_warnings?: string[];
  /** Substring ranges in `body` that came verbatim from the owner. */
  verbatim_ranges?: Array<[number, number]>;
  created_at: number;
  updated_at: number;
  /** Opaque proof token written when transitioning to PUBLISHING. */
  publishProof?: string;
  /** LinkedIn URN returned by the publisher after a successful post. */
  publishedUrn?: string;
  /** Error message captured when transitioning to PUBLISH_FAILED. */
  publishError?: string;
  /** Epoch ms of the most recent publish attempt (PUBLISHING entry). */
  publish_attempted_at?: number;
}

export interface DraftOutput {
  body: string;
  content_kind: ContentKind;
  /** When content_kind === 'article'. Title is required; thumbnail is fetched server-side. */
  article?: {
    source: string;
    title: string;
  };
  needs_image: boolean;
  image_source: ImageSource;
  image_query?: string;
  image_concept?: string;
  link?: string;
  link_placement: LinkPlacement;
  hashtags: string[];
  mentions: string[];
  pillar: Pillar;
  source_url: string;
  verbatim_ranges?: Array<[number, number]>;
}

/** A persisted history entry. Used for dedup + pillar rotation. */
export interface HistoryEntry {
  draft_id: string;
  body_hash: string;
  source_url: string;
  pillar: Pillar;
  urn: string;
  published_at: number;
}
