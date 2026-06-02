import { VercelAIGatewayProvider } from './vercelGateway';
import type { LLMProvider } from './provider';
import type { Config } from '../config/schema';
import { loadEnv } from '../config/loader';

export * from './provider';
export * from './parse';

/**
 * Build the configured LLM provider. Future gateways slot in here without
 * changing call sites.
 */
export function buildProvider(cfg: Config): LLMProvider {
  if (cfg.llm.gateway === 'vercel') {
    const env = loadEnv();
    // VERCEL_OIDC_TOKEN is injected on the Vercel runtime; locally we rely on
    // AI_GATEWAY_API_KEY pulled into .env.local.
    const apiKey = env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN;
    if (!apiKey) throw new Error('AI_GATEWAY_API_KEY is not set');
    return new VercelAIGatewayProvider({ apiKey });
  }
  throw new Error(`Unsupported llm.gateway: ${cfg.llm.gateway}`);
}
