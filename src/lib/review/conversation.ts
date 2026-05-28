import type { Config } from '../config/schema';
import type { Draft, DraftArticle, DraftMedia, DraftOutput, EditResponse, EditTurn } from '../types';
import { selectMedia } from '../media';

/**
 * Pure reducer for one chat turn. Always appends user + assistant turns to
 * `conversation`; only mutates the draft's content fields when the LLM
 * returned `intent: "edit"`.
 *
 * This function does NOT touch KV. It returns a deterministic patch that
 * can be unit-tested without any external state.
 */
export interface ApplyEditArgs {
  current: Draft;
  userMessage: string;
  response: EditResponse;
  imageUrl?: string;
  pastedUrl?: string;
}

export function applyEditResponse(args: ApplyEditArgs): Partial<Draft> {
  const { current, response } = args;
  const now = Date.now();
  const userTurn: EditTurn = {
    role: 'user',
    content: args.userMessage,
    ...(args.imageUrl !== undefined ? { imageUrl: args.imageUrl } : {}),
    ...(args.pastedUrl !== undefined ? { pastedUrl: args.pastedUrl } : {}),
    ts: now,
  };
  const assistantTurn: EditTurn = {
    role: 'assistant',
    content: response.message,
    ts: now,
  };
  const conversation = [...current.conversation, userTurn, assistantTurn];

  if (response.intent === 'reply') {
    return { conversation };
  }

  const { patch: output } = response;
  const patch: Partial<Draft> = {
    body: output.body,
    content_kind: output.content_kind,
    hashtags: output.hashtags,
    mentions: output.mentions,
    pillar: output.pillar,
    source_url: output.source_url,
    conversation,
  };
  if (output.verbatim_ranges !== undefined) {
    patch.verbatim_ranges = output.verbatim_ranges;
  }
  if (output.link) {
    patch.link = { url: output.link, placement: output.link_placement };
  } else {
    patch.link = undefined;
  }
  if (output.content_kind === 'article') {
    if (output.article) {
      const next: DraftArticle = {
        source: output.article.source,
        title: output.article.title,
        ...(current.article?.thumbnail ? { thumbnail: current.article.thumbnail } : {}),
      };
      patch.article = next;
    } else if (current.article) {
      patch.article = current.article;
    }
  } else if (current.content_kind === 'article') {
    patch.article = undefined;
  }
  if (current.content_kind === 'single_image' && output.content_kind !== 'single_image') {
    patch.media = undefined;
  }
  return patch;
}

/**
 * Resolve the media slot for a chat edit when the model asked for a stock or
 * AI image. Owner uploads still flow through /api/review/upload-image — when
 * the model returns `image_source: 'owner'` it means "user already has or
 * will provide one", so we deliberately do nothing and the existing
 * `draft.media` is preserved by buildEditPatch.
 *
 * Returns the media record to attach, or undefined when nothing applies (kind
 * isn't single_image, source isn't stock/ai, or the provider couldn't supply
 * an image — Pexels miss, AI gated off, mime/size cap hit, etc.). The route
 * handler should only override `patch.media` when this returns non-undefined.
 */
export async function resolveChatEditMedia(
  output: DraftOutput,
  cfg: Config,
): Promise<DraftMedia | undefined> {
  if (output.content_kind !== 'single_image') return undefined;
  if (output.image_source !== 'stock' && output.image_source !== 'ai') return undefined;
  return selectMedia(output, cfg);
}
