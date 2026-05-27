/**
 * Provider-agnostic LLM interface. Concrete implementations live in this
 * directory; callers depend only on this file.
 *
 * Prompt caching is expressed as `cacheBreakpoints`: indices in `messages`
 * (after the system message) that should be marked as cache boundaries.
 * The OpenRouter implementation translates this into the underlying
 * provider's caching protocol (cache_control on Anthropic, automatic on
 * OpenAI, etc.).
 */

export type Role = 'user' | 'assistant' | 'system';

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ImagePart {
  type: 'image_url';
  /** Either a public URL or a `data:image/...;base64,…` data URL. */
  image_url: { url: string };
}

export type MessagePart = TextPart | ImagePart;

export interface ChatMessage {
  role: Role;
  content: string | MessagePart[];
}

export interface CompletionRequest {
  system: string;
  messages: ChatMessage[];
  model: string;
  /** Force JSON-formatted output. The provider sets the appropriate response_format. */
  json?: boolean;
  /**
   * Message indices (0-based, into `messages`) that should be marked as
   * cache boundaries. Anything up to and including each marked index is
   * cacheable.
   */
  cacheBreakpoints?: number[];
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionResult {
  text: string;
  /** Raw provider response for debug/telemetry. */
  raw: unknown;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cached_tokens?: number;
  };
}

export interface LLMProvider {
  complete(req: CompletionRequest): Promise<CompletionResult>;
  health(): Promise<boolean>;
}
