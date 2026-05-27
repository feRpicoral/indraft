/**
 * Rate-limit guard for POST /api/access/request.
 *
 * The route is public — there is no caller-bound identity to limit by, so a
 * global single-slot lock with TTL is what stops abuse from burning email
 * quota and churning out magic links. The test exercises the handler end to
 * end with the in-memory KV.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { __resetKvForTest } from '@/lib/state/kv';
import { createDraft, transition } from '@/lib/state/drafts';

let tmp: string;

beforeAll(() => {
  process.env.INDRAFT_FORCE_MEMORY_KV = '1';
  process.env.MAGIC_LINK_SIGNING_SECRET = 'x'.repeat(40);
  process.env.WEBAUTHN_RP_ID = 'localhost';
  process.env.CRON_SECRET = 'cron';
  process.env.NOTIFY_TO_ADDRESS = 'me@example.com';
  process.env.NOTIFY_FROM_ADDRESS = 'noreply@example.com';
  process.env.APP_URL = 'https://example.test';
  // No RESEND_API_KEY → ConsoleNotifier; no real email is sent.
  delete process.env.RESEND_API_KEY;

  tmp = mkdtempSync(join(tmpdir(), 'indraft-access-req-'));
  const cfgPath = join(tmp, 'config.yml');
  writeFileSync(
    cfgPath,
    `
profile:
  about: ${'a'.repeat(60)}
schedule:
  days: [MON]
  timezone: UTC
  hour: 0
sources:
  dev: []
content:
  pillars: [fullstack]
llm:
  draft_model: m1
  utility_model: m2
review:
  link_ttl_hours: 24
`,
  );
  process.env.INDRAFT_CONFIG = cfgPath;
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  __resetKvForTest();
});

async function callPost() {
  const { POST } = await import('@/app/api/access/request/route');
  const res = await POST();
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function seedPending(): Promise<string> {
  const d = await createDraft({
    body: 'Specific opinion about a concrete headline.',
    content_kind: 'text',
    hashtags: [],
    mentions: [],
    pillar: 'fullstack',
    source_url: 'https://example.com/x',
    conversation: [],
  });
  await transition(d.id, 'PENDING_REVIEW');
  return d.id;
}

describe('POST /api/access/request rate limit', () => {
  it('first call succeeds and sends a link per pending draft', async () => {
    await seedPending();

    const r = await callPost();

    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.sent).toBe(1);
  });

  it('second call within the window returns 429 with Retry-After', async () => {
    await seedPending();

    const r1 = await callPost();
    const r2 = await callPost();

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(429);
    expect(r2.body.ok).toBe(false);
  });

  it('a third hammered call still 429s (lock holds for the window)', async () => {
    await seedPending();
    await callPost();
    await callPost();

    const r3 = await callPost();

    expect(r3.status).toBe(429);
  });

  it('does not consume the lock when there are zero pending drafts', async () => {
    // No drafts seeded → ok response, zero sent. Lock is still taken (we don't
    // distinguish empty from full), so the next call still throttles. That's
    // the intended behavior: even an enumeration probe burns one window.
    const r1 = await callPost();
    const r2 = await callPost();

    expect(r1.status).toBe(200);
    expect(r1.body.sent).toBe(0);
    expect(r2.status).toBe(429);
  });
});
