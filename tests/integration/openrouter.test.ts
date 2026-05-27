import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { OpenRouterProvider } from '@/lib/llm/openrouter';

const server = setupServer(
  http.post('https://openrouter.ai/api/v1/chat/completions', async ({ request }) => {
    const body = (await request.json()) as {
      model: string;
      messages: Array<{ role: string; content: unknown }>;
      response_format?: { type: string };
    };
    return HttpResponse.json({
      id: 'gen-test',
      model: body.model,
      choices: [
        {
          message: { content: '{"echo":"ok"}' },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 80 } },
      _echo: { messages: body.messages, response_format: body.response_format },
    });
  }),
  http.get('https://openrouter.ai/api/v1/models', () => HttpResponse.json({ data: [] })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('OpenRouterProvider', () => {
  const provider = new OpenRouterProvider({ apiKey: 'test-key' });

  it('round-trips a simple completion and surfaces cached tokens', async () => {
    const result = await provider.complete({
      system: 'You are a test bot.',
      messages: [{ role: 'user', content: 'hi' }],
      model: 'anthropic/claude-opus-4-7',
    });

    expect(result.text).toBe('{"echo":"ok"}');
    expect(result.usage?.cached_tokens).toBe(80);
  });

  it('applies cache_control on requested message indices for cacheable segments', async () => {
    let captured: unknown = null;
    server.use(
      http.post('https://openrouter.ai/api/v1/chat/completions', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({
          choices: [{ message: { content: '{}' } }],
        });
      }),
    );

    await provider.complete({
      system: 'sys',
      messages: [
        { role: 'user', content: 'PROFILE BLOCK' },
        { role: 'user', content: 'SOURCE SNAPSHOT' },
        { role: 'user', content: 'CHOSEN ITEM' },
      ],
      model: 'anthropic/claude-opus-4-7',
      cacheBreakpoints: [0, 1],
    });

    const body = captured as {
      messages: Array<{ role: string; content: string | Array<{ cache_control?: object }> }>;
    };
    expect(body.messages.length).toBe(4);
    const m1 = body.messages[1]!.content;
    const m2 = body.messages[2]!.content;
    const m3 = body.messages[3]!.content;
    expect(Array.isArray(m1)).toBe(true);
    expect(Array.isArray(m2)).toBe(true);
    expect(typeof m3).toBe('string');
    expect((m1 as Array<{ cache_control?: object }>)[0]?.cache_control).toEqual({
      type: 'ephemeral',
    });
    expect((m2 as Array<{ cache_control?: object }>)[0]?.cache_control).toEqual({
      type: 'ephemeral',
    });
  });

  it('sets response_format when json=true is requested', async () => {
    let captured: unknown = null;
    server.use(
      http.post('https://openrouter.ai/api/v1/chat/completions', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ choices: [{ message: { content: '{}' } }] });
      }),
    );

    await provider.complete({
      system: 'sys',
      messages: [{ role: 'user', content: 'x' }],
      model: 'm',
      json: true,
    });

    expect((captured as { response_format?: object }).response_format).toEqual({
      type: 'json_object',
    });
  });

  it('throws on non-2xx with the response body included', async () => {
    server.use(
      http.post('https://openrouter.ai/api/v1/chat/completions', () =>
        HttpResponse.json({ error: 'bad model' }, { status: 400 }),
      ),
    );

    await expect(
      provider.complete({
        system: 's',
        messages: [{ role: 'user', content: 'x' }],
        model: 'm',
      }),
    ).rejects.toThrow(/OpenRouter 400/);
  });

  it('health() returns true for a reachable models endpoint', async () => {
    const ok = await provider.health();

    expect(ok).toBe(true);
  });
});
