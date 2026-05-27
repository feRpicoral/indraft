/**
 * End-to-end dry-run: collect → draft → lint → media → persist → notify.
 *
 * Mocks every external (LLM, RSS feeds, Pexels), forces memory KV, and
 * asserts that one PENDING_REVIEW draft lands in KV plus a notification
 * email is captured by the ConsoleNotifier (since no RESEND_API_KEY is set).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { __resetKvForTest } from '@/lib/state/kv';
import { listPending } from '@/lib/state/drafts';

const goodLlmResponse = JSON.stringify({
  body: 'Specific, opinionated take about an actual headline. After spending an afternoon with the new release I think the migration story is undersold.',
  content_kind: 'text',
  needs_image: false,
  image_source: 'none',
  link_placement: 'none',
  hashtags: ['typescript'],
  mentions: [],
  pillar: 'fullstack',
  source_url: 'https://example.com/x',
});

const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Example</title>
  <item>
    <title>Specific real news</title>
    <link>https://example.com/x</link>
    <pubDate>Mon, 25 May 2026 12:00:00 GMT</pubDate>
    <description>A concrete update.</description>
  </item>
</channel></rss>`;

const server = setupServer(
  http.get('https://example.com/feed', () => new HttpResponse(rss, { headers: { 'content-type': 'application/rss+xml' } })),
  http.post('https://openrouter.ai/api/v1/chat/completions', () =>
    HttpResponse.json({
      choices: [{ message: { content: goodLlmResponse } }],
    }),
  ),
);

let tmp: string;
let cfgPath: string;

beforeAll(() => {
  process.env.INDRAFT_FORCE_MEMORY_KV = '1';
  process.env.OPENROUTER_API_KEY = 'test-or-key';
  process.env.MAGIC_LINK_SIGNING_SECRET = 'x'.repeat(40);
  process.env.WEBAUTHN_RP_ID = 'localhost';
  process.env.CRON_SECRET = 'cron';
  process.env.NOTIFY_TO_ADDRESS = 'me@example.com';
  process.env.NOTIFY_FROM_ADDRESS = 'noreply@example.com';
  delete process.env.RESEND_API_KEY;
  server.listen({ onUnhandledRequest: 'bypass' });

  tmp = mkdtempSync(join(tmpdir(), 'indraft-e2e-'));
  cfgPath = join(tmp, 'config.yml');
  writeFileSync(
    cfgPath,
    `
profile:
  about: ${'a'.repeat(60)}
schedule:
  days: [MON, TUE, WED, THU, FRI, SAT, SUN]
  timezone: UTC
  hour: 0
sources:
  dev: ["https://example.com/feed"]
content:
  pillars: [fullstack]
llm:
  draft_model: m1
  utility_model: m2
`,
  );
  process.env.INDRAFT_CONFIG = cfgPath;
});

afterAll(() => {
  server.close();
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  __resetKvForTest();
  server.resetHandlers();
  server.use(
    http.get('https://example.com/feed', () => new HttpResponse(rss, { headers: { 'content-type': 'application/rss+xml' } })),
    http.post('https://openrouter.ai/api/v1/chat/completions', () =>
      HttpResponse.json({ choices: [{ message: { content: goodLlmResponse } }] }),
    ),
  );
});

afterEach(() => {
  __resetKvForTest();
});

describe('dry-run end to end', () => {
  it('produces a PENDING_REVIEW draft and skips email send when dryRun=true', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    const origInfo = console.info;
    console.log = (...a) => logs.push(a.join(' '));
    console.info = (...a) => logs.push(a.join(' '));

    try {
      const { runScheduledJob } = await import('@/lib/scheduler/runScheduledJob');
      const r = await runScheduledJob({
        dryRun: true,
        now: Date.parse('2026-05-25T00:30:00Z'),
      });
      expect(r.created).toBeDefined();
      expect(r.created?.status).toBe('PENDING_REVIEW');
      const pending = await listPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]?.id).toBe(r.created?.id);

      expect(logs.some((l) => l.includes('InDraft — draft ready'))).toBe(false);
    } finally {
      console.log = origLog;
      console.info = origInfo;
    }
  });

  it('with dryRun=false the ConsoleNotifier emits the draftReady email body', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.map(String).join(' '));

    try {
      const { runScheduledJob } = await import('@/lib/scheduler/runScheduledJob');
      const r = await runScheduledJob({
        dryRun: false,
        now: Date.parse('2026-05-25T00:30:00Z'),
      });
      expect(r.created).toBeDefined();
      const draftReadyLog = logs.find((l) => l.includes('InDraft — draft ready'));
      expect(draftReadyLog).toBeDefined();
      expect(draftReadyLog).toContain('Open: ');
    } finally {
      console.log = origLog;
    }
  });
});
