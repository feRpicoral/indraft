import { z } from 'zod';

/**
 * Process-env schema. All secrets and host-bindings live here. Anything required
 * at runtime is `.min(1)`. Optional providers (Pexels, AI image) are `.optional()`.
 *
 * The KV bindings (KV_*) are populated automatically by `vercel env pull` and
 * by Vercel at runtime.
 */
const EnvSchema = z.object({
  // LinkedIn
  LINKEDIN_CLIENT_ID: z.string().min(1).optional(),
  LINKEDIN_CLIENT_SECRET: z.string().min(1).optional(),

  // LLM
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  // Email
  RESEND_API_KEY: z.string().min(1).optional(),
  NOTIFY_TO_ADDRESS: z.string().email(),
  NOTIFY_FROM_ADDRESS: z.string().email(),

  // Images
  PEXELS_API_KEY: z.string().min(1).optional(),

  // Magic links + auth
  MAGIC_LINK_SIGNING_SECRET: z.string().min(32, 'Use a long random string (≥32 chars)'),
  WEBAUTHN_RP_ID: z.string().min(1),

  // Cron + bootstrap
  CRON_SECRET: z.string().min(1),
  ENROLLMENT_BOOTSTRAP_TOKEN: z.string().min(1).optional(),

  // Vercel KV
  KV_REST_API_URL: z.string().url().optional(),
  KV_REST_API_TOKEN: z.string().optional(),
  KV_REST_API_READ_ONLY_TOKEN: z.string().optional(),
  KV_URL: z.string().optional(),

  // App URL (used to build magic links)
  APP_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export { EnvSchema };
