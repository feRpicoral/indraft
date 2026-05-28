import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraft, getDraft, transition } from '@/lib/state/drafts';
import { listSnapshots } from '@/lib/state/snapshots';
import { __resetKvForTest } from '@/lib/state/kv';
import { collect } from '@/lib/collector';
import { draft as generateDraft } from '@/lib/generator';
import { selectMedia } from '@/lib/media';
import type { Config } from '@/lib/config/schema';
import type { Draft, DraftOutput, SourceItem } from '@/lib/types';

vi.mock('@/lib/review/requireSession', () => {
  class SessionError extends Error {
    constructor(
      message: string,
      public status = 401,
    ) {
      super(message);
    }
  }
  return {
    requireDraftSession: vi.fn(async () => undefined),
    SessionError,
  };
});

vi.mock('@/lib/collector', () => ({
  collect: vi.fn(),
}));

vi.mock('@/lib/generator', () => ({
  draft: vi.fn(),
}));

vi.mock('@/lib/media', () => ({
  selectMedia: vi.fn(),
}));

vi.mock('@/lib/llm', () => ({
  buildProvider: vi.fn(() => ({})),
}));

vi.mock('@/lib/config/loader', () => ({
  loadConfig: vi.fn(() => testConfig),
}));

vi.mock('@/lib/state/history', () => ({
  recentPillars: vi.fn(async () => ['backend']),
  lastPillar: vi.fn(async () => 'backend'),
}));

const testConfig = {
  content: {
    pillars: ['backend', 'frontend'],
  },
} as unknown as Config;

const source: SourceItem = {
  title: 'New source',
  url: 'https://example.com/new',
  summary: 'A concrete source summary.',
  source: 'Example',
  published_at: 1_800_000_000_000,
  category: 'dev',
};

const otherSource: SourceItem = {
  ...source,
  title: 'Other source',
  url: 'https://example.com/other',
};

beforeAll(() => {
  process.env.INDRAFT_FORCE_MEMORY_KV = '1';
});

beforeEach(() => {
  __resetKvForTest();
  vi.mocked(collect).mockResolvedValue([source, otherSource]);
  vi.mocked(selectMedia).mockResolvedValue(undefined);
  vi.mocked(generateDraft).mockResolvedValue({
    output: draftOutput(),
    linter_warnings: [],
  });
});

async function seedPendingDraft(overrides: Partial<Draft> = {}) {
  const draft = await createDraft({
    body: 'old body',
    content_kind: 'text',
    hashtags: [],
    mentions: [],
    pillar: 'backend',
    source_url: 'https://example.com/old',
    conversation: [],
    ...overrides,
  });
  return transition(draft.id, 'PENDING_REVIEW');
}

function draftOutput(overrides: Partial<DraftOutput> = {}): DraftOutput {
  return {
    body: 'new body from the selected source',
    content_kind: 'text',
    needs_image: false,
    image_source: 'none',
    link_placement: 'none',
    hashtags: ['typescript'],
    mentions: [],
    pillar: 'frontend',
    source_url: source.url,
    ...overrides,
  };
}

async function getSources(draftId: string) {
  const { GET } = await import('@/app/api/review/sources/route');
  const res = await GET(
    new Request(`https://example.test/api/review/sources?draft_id=${draftId}`),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function postRegenerate(body: unknown) {
  const { POST } = await import('@/app/api/review/regenerate/route');
  const res = await POST(
    new Request('https://example.test/api/review/regenerate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

describe('/api/review/sources', () => {
  it('returns the current source feed for an authorized draft session', async () => {
    const draft = await seedPendingDraft();

    const res = await getSources(draft.id);

    expect(res.status).toBe(200);
    expect(res.json.items).toEqual([source, otherSource]);
  });
});

describe('/api/review/regenerate', () => {
  it('switches to a selected source and snapshots the prior draft', async () => {
    const draft = await seedPendingDraft();

    const res = await postRegenerate({ draft_id: draft.id, source_url: source.url });

    const saved = await getDraft(draft.id);
    const snapshots = await listSnapshots(draft.id);
    expect(res.status).toBe(200);
    expect(saved?.body).toBe('new body from the selected source');
    expect(saved?.source_url).toBe(source.url);
    expect(saved?.conversation.at(-1)?.content).toBe('Switched source to: New source');
    expect(saved?.version).toBe(draft.version + 1);
    expect(snapshots[0]?.fields.body).toBe('old body');
  });

  it('replaces stale lint warnings with the regenerated draft warnings', async () => {
    const draft = await seedPendingDraft({ linter_warnings: ['old warning'] });
    vi.mocked(generateDraft).mockResolvedValueOnce({
      output: draftOutput(),
      linter_warnings: ['new warning'],
    });

    const res = await postRegenerate({ draft_id: draft.id, source_url: source.url });

    const saved = await getDraft(draft.id);
    expect(res.status).toBe(200);
    expect(saved?.linter_warnings).toEqual(['new warning']);
  });

  it('clears stale lint warnings when the regenerated draft is clean', async () => {
    const draft = await seedPendingDraft({ linter_warnings: ['old warning'] });

    const res = await postRegenerate({ draft_id: draft.id, source_url: source.url });

    const saved = await getDraft(draft.id);
    expect(res.status).toBe(200);
    expect(saved?.linter_warnings).toBeUndefined();
  });

  it('rejects a source URL that is not in the fresh feed snapshot', async () => {
    const draft = await seedPendingDraft();

    const res = await postRegenerate({
      draft_id: draft.id,
      source_url: 'https://example.com/missing',
    });

    const saved = await getDraft(draft.id);
    expect(res.status).toBe(404);
    expect(saved?.version).toBe(draft.version);
  });
});
