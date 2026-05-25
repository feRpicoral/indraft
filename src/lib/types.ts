/**
 * Shared domain types.
 *
 * Source of truth for cross-module shapes. Keep this file dependency-free so it
 * can be imported from anywhere without pulling in heavy modules.
 */

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
 * One turn in the review conversation. Either the user editing or the model
 * responding. Persisted on the draft so the full edit history survives across
 * sessions.
 */
export interface EditTurn {
  role: 'user' | 'assistant';
  content: string;
  /** Optional image attached by the user this turn. */
  imageUrl?: string;
  /** Optional URL the user pasted; fetched server-side for fresh context. */
  pastedUrl?: string;
  ts: number;
}

export type DraftStatus =
  | 'DRAFTED'
  | 'PENDING_REVIEW'
  | 'PUBLISHED'
  | 'DISCARDED'
  | 'EDITED'
  | 'STALE';

export interface Draft {
  id: string;
  /** Bumps on every edit. Publish requires the assertion to match the current version. */
  version: number;
  status: DraftStatus;
  body: string;
  media?: DraftMedia;
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
  /** Opaque proof token written when transitioning to PUBLISHED. */
  publishProof?: string;
  /** LinkedIn URN returned by the publisher after a successful post. */
  publishedUrn?: string;
}

/** Output shape the generator must produce (parsed from LLM JSON). */
export interface DraftOutput {
  body: string;
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
