import { z } from 'zod';

/**
 * Process-env schema. Optional vars accept undefined OR empty string (which we
 * coerce to undefined) so that unset Vercel env entries don't fail validation
 * just because they're present-but-empty.
 *
 * The KV bindings (KV_*) are populated automatically by `vercel env pull` and
 * by Vercel at runtime.
 */
const optionalString = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().optional(),
);

const optionalUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().url().optional(),
);

const EnvSchema = z.object({
  // LinkedIn
  LINKEDIN_CLIENT_ID: optionalString,
  LINKEDIN_CLIENT_SECRET: optionalString,

  // LLM
  OPENROUTER_API_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,

  // Email
  RESEND_API_KEY: optionalString,
  NOTIFY_TO_ADDRESS: z.string().email(),
  NOTIFY_FROM_ADDRESS: z.string().email(),

  // Images
  PEXELS_API_KEY: optionalString,

  // Magic links + auth
  MAGIC_LINK_SIGNING_SECRET: z.string().min(32, 'Use a long random string (≥32 chars)'),
  WEBAUTHN_RP_ID: z.string().min(1),

  // Cron + bootstrap
  CRON_SECRET: z.string().min(1),
  ENROLLMENT_BOOTSTRAP_TOKEN: optionalString,

  // Vercel KV
  KV_REST_API_URL: optionalUrl,
  KV_REST_API_TOKEN: optionalString,
  KV_REST_API_READ_ONLY_TOKEN: optionalString,
  KV_URL: optionalString,

  // App URL (used to build magic links)
  APP_URL: optionalUrl,
});

export type Env = z.infer<typeof EnvSchema>;

export { EnvSchema };
