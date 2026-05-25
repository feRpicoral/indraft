import { z } from 'zod';

/**
 * Zod schema for the JSON the LLM must emit. Used by `parseJson` to validate
 * the response — anything that doesn't conform triggers a retry.
 */
export const DraftOutputSchema = z.object({
  body: z.string().min(20).max(3000),
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
});
