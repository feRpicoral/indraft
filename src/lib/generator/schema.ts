import { z } from 'zod';

/**
 * Zod schema for the JSON the LLM must emit. Used by `parseJson` to validate
 * the response — anything that doesn't conform triggers a retry.
 */
export const DraftOutputSchema = z
  .object({
    body: z.string().min(20).max(3000),
    content_kind: z.enum(['text', 'single_image', 'article']),
    article: z
      .object({
        source: z.string().url(),
        title: z.string().min(1).max(400),
      })
      .optional(),
    needs_image: z.boolean(),
    image_source: z.enum(['none', 'owner', 'stock', 'ai']),
    image_query: z.string().optional(),
    image_concept: z.string().optional(),
    link: z.string().url().optional(),
    link_placement: z.enum(['none', 'body', 'comment']),
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
  });

/**
 * Wrapper schema for a chat-edit turn. The LLM decides whether to apply a
 * concrete change ("edit", carries a full `DraftOutput` patch) or just reply
 * conversationally ("reply", no patch). `message` is always present and is
 * what gets stored as the assistant turn in the draft's conversation history.
 */
export const EditResponseSchema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('reply'),
    message: z.string().min(1).max(2000),
  }),
  z.object({
    intent: z.literal('edit'),
    message: z.string().min(1).max(500),
    patch: DraftOutputSchema,
  }),
]);
