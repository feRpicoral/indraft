import { OpenRouterProvider } from './openrouter';
import type { LLMProvider } from './provider';
import type { Config } from '../config/schema';

export * from './provider';
export * from './parse';

/**
 * Build the configured LLM provider. Today only OpenRouter is supported;
 * future providers slot in here without changing call sites.
 */
export function buildProvider(cfg: Config): LLMProvider {
  if (cfg.llm.gateway === 'openrouter') {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
    return new OpenRouterProvider({
      apiKey,
      referer: process.env.APP_URL,
      appTitle: 'InDraft',
    });
  }
  throw new Error(`Unsupported llm.gateway: ${cfg.llm.gateway}`);
}
