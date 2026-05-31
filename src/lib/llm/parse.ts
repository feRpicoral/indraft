import type { z } from 'zod';

export class LlmJsonParseError extends Error {
  override name = 'LlmJsonParseError';
  readonly raw: string;
  override readonly cause?: unknown;
  constructor(message: string, raw: string, cause?: unknown) {
    super(message);
    this.raw = raw;
    this.cause = cause;
  }
}

/**
 * Parse an LLM response into a typed object using a Zod schema.
 *
 * The model sometimes wraps JSON in markdown fences or chatters before the
 * object — strip the most common variants before parsing. If validation still
 * fails, throw `LlmJsonParseError` so the generator can retry.
 */
export function parseJson<TSchema extends z.ZodTypeAny>(
  raw: string,
  schema: TSchema,
): z.output<TSchema> {
  const stripped = stripFences(raw).trim();
  let obj: unknown;
  try {
    obj = JSON.parse(stripped);
  } catch (err) {
    // Fall back: try to locate the first { and the matching last }.
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new LlmJsonParseError(`response is not JSON`, raw, err);
    }
    try {
      obj = JSON.parse(stripped.slice(start, end + 1));
    } catch (err2) {
      throw new LlmJsonParseError(`fallback JSON parse failed`, raw, err2);
    }
  }
  const result = schema.safeParse(obj);
  if (!result.success) {
    throw new LlmJsonParseError(
      `schema validation failed: ${result.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ')}`,
      raw,
    );
  }
  return result.data as z.output<TSchema>;
}

function stripFences(raw: string): string {
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/m;
  const match = raw.trim().match(fence);
  return match?.[1] ?? raw;
}
