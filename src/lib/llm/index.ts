import { VercelAIGatewayProvider } from './vercelGateway';
import type { LLMProvider } from './provider';
import { loadEnv } from '../config/loader';

export * from './provider';
export * from './parse';

/**
 * Build the LLM provider. All calls route through the Vercel AI Gateway:
 * VERCEL_OIDC_TOKEN is injected on the Vercel runtime, and AI_GATEWAY_API_KEY
 * is used locally (pulled into .env.local).
 */
export function buildProvider(): LLMProvider {
  const env = loadEnv();
  const apiKey = env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN;
  if (!apiKey) throw new Error('AI_GATEWAY_API_KEY is not set');
  return new VercelAIGatewayProvider({ apiKey });
}
