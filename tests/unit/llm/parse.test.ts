import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parseJson, LlmJsonParseError } from '@/lib/llm/parse';

const Schema = z.object({ body: z.string(), pillar: z.string() });

describe('parseJson', () => {
  it('parses clean JSON', () => {
    const out = parseJson(`{"body":"hi","pillar":"fullstack"}`, Schema);

    expect(out.body).toBe('hi');
  });

  it('strips markdown fences', () => {
    const raw = '```json\n{"body":"hi","pillar":"x"}\n```';

    const out = parseJson(raw, Schema);

    expect(out.pillar).toBe('x');
  });

  it('strips generic fences', () => {
    const raw = '```\n{"body":"hi","pillar":"x"}\n```';

    const out = parseJson(raw, Schema);

    expect(out.pillar).toBe('x');
  });

  it('falls back to first/last brace extraction when wrapped in prose', () => {
    const raw = `Here's the post:\n{"body":"hi","pillar":"x"}\nLet me know!`;

    const out = parseJson(raw, Schema);

    expect(out.body).toBe('hi');
  });

  it('throws LlmJsonParseError on truly malformed output', () => {
    expect(() => parseJson('not json at all', Schema)).toThrow(LlmJsonParseError);
  });

  it('throws LlmJsonParseError when schema validation fails', () => {
    expect(() => parseJson(`{"body":"hi"}`, Schema)).toThrow(/pillar/);
  });
});
