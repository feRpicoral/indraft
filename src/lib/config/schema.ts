import { z } from 'zod';

const WeekdaySchema = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);

const ProfileSchema = z.object({
  about: z.string().min(20, 'profile.about should be a real paragraph (≥20 chars)'),
  links: z
    .object({
      github: z.string().url().optional(),
      linkedin: z.string().url().optional(),
      website: z.string().url().optional(),
    })
    .default({}),
  local_repos_path: z.string().optional(),
});

const ScheduleSchema = z.object({
  days: z.array(WeekdaySchema).min(1),
  timezone: z.string().min(1),
  hour: z.number().int().min(0).max(23).default(9),
});

const SourcesSchema = z.object({
  dev: z.array(z.string().url()).default([]),
  ai_research: z.array(z.string().url()).default([]),
  hardware: z.array(z.string().url()).default([]),
  business: z.array(z.string().url()).default([]),
  personal: z
    .object({
      github_user: z.string().optional(),
      website_feed: z.string().url().optional(),
    })
    .optional(),
});

const LinterConfigSchema = z.object({
  max_em_dashes: z.number().int().min(0).default(2),
  max_emojis: z.number().int().min(0).default(1),
  max_hashtags: z.number().int().min(0).default(5),
  buzzwords: z.array(z.string()).default([]),
  generic_openers: z.array(z.string()).default([]),
});

const ContentSchema = z.object({
  pillars: z.array(z.string()).min(1),
  tone_default: z.string().default('casual'),
  linter: LinterConfigSchema.default({
    max_em_dashes: 2,
    max_emojis: 1,
    max_hashtags: 5,
    buzzwords: [],
    generic_openers: [],
  }),
});

const MediaSchema = z.object({
  image_provider: z.enum(['pexels', 'unsplash', 'none']).default('pexels'),
  allow_ai_image_when_on_topic: z.boolean().default(false),
});

const PostSchema = z.object({
  link_placement: z.enum(['none', 'body', 'comment']).default('none'),
  hashtags_target: z.number().int().min(0).max(10).default(4),
});

const ReviewSchema = z.object({
  link_ttl_hours: z.number().int().positive().default(24),
  reminder_after_hours: z.number().int().positive().default(24),
  stale_after_hours: z.number().int().positive().default(48),
});

const LlmSchema = z.object({
  gateway: z.enum(['openrouter']).default('openrouter'),
  draft_model: z.string().min(1),
  utility_model: z.string().min(1),
  prompt_caching: z.boolean().default(true),
  max_retries: z.number().int().min(0).max(10).default(3),
});

export const ConfigSchema = z.object({
  profile: ProfileSchema,
  schedule: ScheduleSchema,
  sources: SourcesSchema,
  content: ContentSchema,
  media: MediaSchema.default({ image_provider: 'pexels', allow_ai_image_when_on_topic: false }),
  post: PostSchema.default({ link_placement: 'none', hashtags_target: 4 }),
  review: ReviewSchema.default({
    link_ttl_hours: 24,
    reminder_after_hours: 24,
    stale_after_hours: 48,
  }),
  llm: LlmSchema,
});

export type Config = z.infer<typeof ConfigSchema>;
export type LinterConfig = z.infer<typeof LinterConfigSchema>;
