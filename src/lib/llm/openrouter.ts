import { fetchWithRetry } from '../util/http';
import { log } from '../util/logger';
import type {
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  ChatMessage,
} from './provider';

const BASE_URL = 'https://openrouter.ai/api/v1';

export interface OpenRouterOpts {
  apiKey: string;
  /** Optional referrer URL — appears in OpenRouter dashboards. */
  referer?: string;
  appTitle?: string;
}

export class OpenRouterProvider implements LLMProvider {
  constructor(private readonly opts: OpenRouterOpts) {}

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const body = this.buildBody(req);
    const res = await fetchWithRetry(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${errBody.slice(0, 500)}`);
    }
    const raw = (await res.json()) as OpenRouterChatResponse;
    const text = raw.choices?.[0]?.message?.content ?? '';
    if (typeof text !== 'string') {
      throw new Error('OpenRouter returned non-string content');
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
      log.warn('openrouter health failed', { err: String(err) });
      return false;
    }
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.opts.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (this.opts.referer) h['HTTP-Referer'] = this.opts.referer;
    if (this.opts.appTitle) h['X-Title'] = this.opts.appTitle;
    return h;
  }

  private buildBody(req: CompletionRequest): OpenRouterChatRequest {
    const messages: OpenRouterChatRequest['messages'] = [
      this.toMessage({ role: 'system', content: req.system }, false),
      ...req.messages.map((m, i) =>
        this.toMessage(m, req.cacheBreakpoints?.includes(i) ?? false),
      ),
    ];
    const body: OpenRouterChatRequest = {
      model: req.model,
      messages,
    };
    if (req.json) body.response_format = { type: 'json_object' };
    if (req.temperature != null) body.temperature = req.temperature;
    if (req.maxTokens != null) body.max_tokens = req.maxTokens;
    return body;
  }

  /**
   * Convert our generic ChatMessage to OpenRouter's shape. When `cacheBreak`
   * is true, the message content is converted to an array form with a final
   * `cache_control: ephemeral` marker — Anthropic models routed through
   * OpenRouter honor this for prompt caching.
   *
   * Multimodal: image parts pass through as `{type:'image_url', image_url:{url}}`.
   * cache_control is only attached to the last *text* part so vision blocks
   * don't get marked cacheable (they typically change every turn).
   */
  private toMessage(m: ChatMessage, cacheBreak: boolean): OpenRouterMessage {
    if (typeof m.content === 'string') {
      if (!cacheBreak) return { role: m.role, content: m.content };
      return {
        role: m.role,
        content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }],
      };
    }
    const parts: OpenRouterPart[] = m.content.map((p) => {
      if (p.type === 'image_url') {
        return { type: 'image_url', image_url: { url: p.image_url.url } };
      }
      return { type: 'text', text: p.text };
    });
    if (cacheBreak) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        if (part && part.type === 'text') {
          parts[i] = { ...part, cache_control: { type: 'ephemeral' } };
          break;
        }
      }
    }
    return { role: m.role, content: parts };
  }
}

// --- OpenRouter (OpenAI-compatible) wire types ---

type OpenRouterPart =
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
  | { type: 'image_url'; image_url: { url: string } };

interface OpenRouterMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | OpenRouterPart[];
}

interface OpenRouterChatRequest {
  model: string;
  messages: OpenRouterMessage[];
  response_format?: { type: 'json_object' };
  temperature?: number;
  max_tokens?: number;
}

interface OpenRouterChatResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}
