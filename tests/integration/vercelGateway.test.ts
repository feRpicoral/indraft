import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { VercelAIGatewayProvider } from '@/lib/llm/vercelGateway';

const CHAT_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const MODELS_URL = 'https://ai-gateway.vercel.sh/v1/models';

const server = setupServer(
  http.post(CHAT_URL, async ({ request }) => {
    const body = (await request.json()) as {
      model: string;
      messages: Array<{ role: string; content: unknown }>;
      response_format?: { type: string };
    };
    return HttpResponse.json({
      id: 'gen-test',
      model: body.model,
      choices: [{ message: { content: '{"echo":"ok"}' } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 80 } },
      _echo: { messages: body.messages, response_format: body.response_format },
    });
  }),
  http.get(MODELS_URL, () => HttpResponse.json({ data: [] })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('VercelAIGatewayProvider', () => {
  const provider = new VercelAIGatewayProvider({ apiKey: 'test-key' });

  it('round-trips a simple completion and surfaces cached tokens', async () => {
    const result = await provider.complete({
      system: 'You are a test bot.',
      messages: [{ role: 'user', content: 'hi' }],
      model: 'anthropic/claude-sonnet-4.6',
    });

    expect(result.text).toBe('{"echo":"ok"}');
    expect(result.usage?.cached_tokens).toBe(80);
  });

  it('marks requested message indices with message-level cache_control', async () => {
    let captured: unknown = null;
    server.use(
      http.post(CHAT_URL, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ choices: [{ message: { content: '{}' } }] });
      }),
    );

    await provider.complete({
      system: 'sys',
      messages: [
        { role: 'user', content: 'PROFILE BLOCK' },
        { role: 'user', content: 'SOURCE SNAPSHOT' },
        { role: 'user', content: 'CHOSEN ITEM' },
      ],
      model: 'anthropic/claude-sonnet-4.6',
      cacheBreakpoints: [0, 1],
    });

    const body = captured as {
      messages: Array<{ role: string; content: unknown; cache_control?: object }>;
    };
    expect(body.messages.length).toBe(4);
    expect(body.messages[0]!.cache_control).toBeUndefined();
    expect(body.messages[1]!.content).toBe('PROFILE BLOCK');
    expect(body.messages[1]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(body.messages[2]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(body.messages[3]!.cache_control).toBeUndefined();
  });

  it('never sends response_format (the gateway rejects json_object for Anthropic)', async () => {
    let captured: unknown = null;
    server.use(
      http.post(CHAT_URL, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ choices: [{ message: { content: '{}' } }] });
      }),
    );

    await provider.complete({
      system: 'sys',
      messages: [{ role: 'user', content: 'x' }],
      model: 'm',
    });

    expect((captured as { response_format?: object }).response_format).toBeUndefined();
  });

  it('throws on non-2xx with the response body included', async () => {
    server.use(
      http.post(CHAT_URL, () => HttpResponse.json({ error: 'bad model' }, { status: 400 })),
    );

    await expect(
      provider.complete({
        system: 's',
        messages: [{ role: 'user', content: 'x' }],
        model: 'm',
      }),
    ).rejects.toThrow(/Vercel AI Gateway 400/);
  });

  it('health() returns true for a reachable models endpoint', async () => {
    const ok = await provider.health();

    expect(ok).toBe(true);
  });
});
