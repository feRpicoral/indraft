import { fetchWithRetry } from '../util/http';
import { log } from '../util/logger';
import type { CompletionRequest, CompletionResult, LLMProvider, ChatMessage } from './provider';

const BASE_URL = 'https://ai-gateway.vercel.sh/v1';

export interface VercelAIGatewayOpts {
  apiKey: string;
}

export class VercelAIGatewayProvider implements LLMProvider {
  constructor(private readonly opts: VercelAIGatewayOpts) {}

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const body = this.buildBody(req);
    const res = await fetchWithRetry(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      ...(req.signal ? { signal: req.signal } : {}),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Vercel AI Gateway ${res.status}: ${errBody.slice(0, 500)}`);
    }
    const raw = (await res.json()) as GatewayChatResponse;
    const text = raw.choices?.[0]?.message?.content ?? '';
    if (typeof text !== 'string') {
      throw new Error('Vercel AI Gateway returned non-string content');
    }
    return {
      text,
      raw,
      usage: {
        prompt_tokens: raw.usage?.prompt_tokens,
        completion_tokens: raw.usage?.completion_tokens,
        cached_tokens: raw.usage?.prompt_tokens_details?.cached_tokens,
      },
    };
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetchWithRetry(`${BASE_URL}/models`, {
        method: 'GET',
        headers: this.headers(),
        retries: 0,
        timeoutMs: 5000,
      });
      return res.ok;
    } catch (err) {
      log.warn('vercel ai gateway health failed', { err: String(err) });
      return false;
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.opts.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private buildBody(req: CompletionRequest): GatewayChatRequest {
    const messages: GatewayMessage[] = [
      this.toMessage({ role: 'system', content: req.system }, false),
      ...req.messages.map((m, i) => this.toMessage(m, req.cacheBreakpoints?.includes(i) ?? false)),
    ];
    const body: GatewayChatRequest = {
      model: req.model,
      messages,
    };
    if (req.temperature != null) body.temperature = req.temperature;
    if (req.maxTokens != null) body.max_tokens = req.maxTokens;
    return body;
  }

  /**
   * Convert our generic ChatMessage to the gateway's OpenAI-compatible shape.
   * The gateway honors a message-level `cache_control: { type: 'ephemeral' }`
   * for Anthropic models, marking everything up to that message as cacheable.
   * Image parts pass through as `{ type: 'image_url', image_url: { url } }`.
   */
  private toMessage(m: ChatMessage, cacheBreak: boolean): GatewayMessage {
    const content =
      typeof m.content === 'string'
        ? m.content
        : m.content.map(
            (p): GatewayPart =>
              p.type === 'image_url'
                ? { type: 'image_url', image_url: { url: p.image_url.url } }
                : { type: 'text', text: p.text },
          );
    return {
      role: m.role,
      content,
      ...(cacheBreak ? { cache_control: { type: 'ephemeral' } } : {}),
    };
  }
}

// --- Vercel AI Gateway (OpenAI-compatible) wire types ---

type GatewayPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

interface GatewayMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | GatewayPart[];
  cache_control?: { type: 'ephemeral' };
}

interface GatewayChatRequest {
  model: string;
  messages: GatewayMessage[];
  temperature?: number;
  max_tokens?: number;
}

interface GatewayChatResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}
