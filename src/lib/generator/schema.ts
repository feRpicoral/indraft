import { z } from 'zod';
import type { Draft, DraftOutput, EditResponse } from '../types';

type RawDraftOutput = Omit<DraftOutput, 'article'> & {
  article?: { source?: string; title: string };
};

/**
 * Zod schema for the JSON the LLM must emit. Used by `parseJson` to validate
 * the response — anything that doesn't conform triggers a retry.
 */
export const DraftOutputSchema: z.ZodType<DraftOutput, z.ZodTypeDef, unknown> = z
  .object({
    body: z.string().min(20).max(3000),
    content_kind: z.enum(['text', 'single_image', 'article']),
    article: z
      .object({
        source: z.string().min(1).optional(),
        title: z.string().min(1).max(400),
      })
      .optional(),
    needs_image: z.boolean(),
    image_source: z.enum(['none', 'owner', 'stock', 'ai']),
    image_query: z.string().optional(),
    image_concept: z.string().optional(),
    // Models emit null / "" / "none" / "(none)" to mean "no link"; normalize to undefined.
    link: z.preprocess(
      (v) => (v == null || v === '' || v === 'none' || v === '(none)' ? undefined : v),
      z.string().url().optional(),
    ),
    // Models sometimes omit this field or invent "omit"; both mean "no placement".
    link_placement: z.preprocess(
      (v) => (v == null || v === 'omit' ? 'none' : v),
      z.enum(['none', 'body', 'comment']),
    ),
    hashtags: z.array(z.string()).max(10),
    mentions: z.array(z.string()),
    pillar: z.string(),
    source_url: z.string().url(),
    verbatim_ranges: z.array(z.tuple([z.number(), z.number()])).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.content_kind === 'article' && !val.article) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['article'],
        message: 'article object is required when content_kind === "article"',
      });
    }
  })
  .transform((val): DraftOutput => {
    const raw = val as RawDraftOutput;
    if (!raw.article) {
      const { article: _article, ...output } = raw;
      return output;
    }
    return {
      ...raw,
      article: {
        ...raw.article,
        source: isValidUrl(raw.article.source) ? raw.article.source : raw.source_url,
      },
    };
  });

function isValidUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reconstruct a full DraftOutput from the current draft. The chat-edit prompt
 * tells the model to touch only the fields it changed, so an edit patch that
 * merges onto this base can legitimately omit everything else. Without it, Zod
 * rejects the partial patch (e.g. `image_source: Required`) and the edit 500s.
 */
function draftToOutput(current: Draft): DraftOutput {
  const base: DraftOutput = {
    body: current.body,
    content_kind: current.content_kind,
    needs_image: Boolean(current.media),
    // 'owner' signals resolveChatEditMedia to keep the existing media rather
    // than refetch a stock/AI image on an edit that never mentioned images.
    image_source: current.media ? 'owner' : 'none',
    link_placement: current.link?.placement ?? 'none',
    hashtags: current.hashtags,
    mentions: current.mentions,
    pillar: current.pillar,
    source_url: current.source_url,
  };
  if (current.link) base.link = current.link.url;
  if (current.article) {
    base.article = { source: current.article.source, title: current.article.title };
  }
  if (current.verbatim_ranges) base.verbatim_ranges = current.verbatim_ranges;
  return base;
}

/**
 * Schema for a chat-edit turn against a specific draft. The LLM decides whether
 * to apply a concrete change ("edit") or just reply conversationally ("reply").
 * `message` is always present and is stored as the assistant turn in the
 * draft's conversation history.
 *
 * An "edit" patch is validated as a partial DraftOutput shallow-merged onto the
 * current draft, so the model only has to return the fields it actually
 * changed. A full patch still overrides every field, matching prior behavior.
 */
export function buildEditResponseSchema(
  current: Draft,
): z.ZodType<EditResponse, z.ZodTypeDef, unknown> {
  const base = draftToOutput(current);
  const patch = z.preprocess(
    (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? { ...base, ...v } : v),
    DraftOutputSchema,
  );
  return z.discriminatedUnion('intent', [
    z.object({
      intent: z.literal('reply'),
      message: z.string().min(1).max(2000),
    }),
    z.object({
      intent: z.literal('edit'),
      message: z.string().min(1).max(500),
      patch,
    }),
  ]) as z.ZodType<EditResponse, z.ZodTypeDef, unknown>;
}
