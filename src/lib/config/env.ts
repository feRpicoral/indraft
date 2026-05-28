import { z } from 'zod';
import { isProductionRuntime } from '../util/runtime';

/**
 * Process-env schema. Trims empty strings to undefined so unset Vercel
 * entries don't fail validation just for being present-but-empty.
 *
 * Some vars are required everywhere (signing secrets, addresses, APP_URL).
 * Others are only required on the production Vercel runtime — they stay
 * optional in dev/test, with `superRefine` adding the prod-required check
 * so the server fails closed at startup if they're missing in prod.
 */
const optionalString = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().optional(),
);

const optionalUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().url().optional(),
);

const requiredUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().url(),
);

const EnvSchema = z
  .object({
    // LinkedIn — required in prod, optional in dev (publish path is gated)
    LINKEDIN_CLIENT_ID: optionalString,
    LINKEDIN_CLIENT_SECRET: optionalString,

    // LLM — at least one required in prod
    OPENROUTER_API_KEY: optionalString,
    ANTHROPIC_API_KEY: optionalString,

    // Email — required in prod (ConsoleNotifier covers dev)
    RESEND_API_KEY: optionalString,
    NOTIFY_TO_ADDRESS: z.string().email(),
    NOTIFY_FROM_ADDRESS: z.string().email(),

    // Images — required in prod (stock images skipped silently in dev)
    PEXELS_API_KEY: optionalString,

    // Magic links + auth — always required
    MAGIC_LINK_SIGNING_SECRET: z.string().min(32, 'Use a long random string (≥32 chars)'),
    WEBAUTHN_RP_ID: z.string().min(1),

    // Cron + bootstrap
    CRON_SECRET: z.string().min(1),
    ENROLLMENT_BOOTSTRAP_TOKEN: optionalString,

    // Vercel KV — required in prod (memory backend covers dev)
    KV_REST_API_URL: optionalUrl,
    KV_REST_API_TOKEN: optionalString,
    KV_REST_API_READ_ONLY_TOKEN: optionalString,
    KV_URL: optionalString,

    // App URL — always required; set to localhost in .env.local for dev
    APP_URL: requiredUrl,
  })
  .superRefine((env, ctx) => {
    if (!isProductionRuntime()) return;
    const required = [
      'LINKEDIN_CLIENT_ID',
      'LINKEDIN_CLIENT_SECRET',
      'RESEND_API_KEY',
      'PEXELS_API_KEY',
      'KV_REST_API_URL',
      'KV_REST_API_TOKEN',
    ] as const;
    for (const key of required) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required in production`,
        });
      }
    }
    if (!env.OPENROUTER_API_KEY && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OPENROUTER_API_KEY'],
        message: 'Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY in production',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export { EnvSchema };
