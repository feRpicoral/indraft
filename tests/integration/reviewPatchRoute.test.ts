import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraft, getDraft, transition } from '@/lib/state/drafts';
import { __resetKvForTest } from '@/lib/state/kv';

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

beforeAll(() => {
  process.env.INDRAFT_FORCE_MEMORY_KV = '1';
});

beforeEach(() => {
  __resetKvForTest();
});

async function seedPendingDraft() {
  const draft = await createDraft({
    body: 'original body',
    content_kind: 'text',
    hashtags: [],
    mentions: [],
    pillar: 'fullstack',
    source_url: 'https://example.com/source',
    conversation: [],
  });
  return transition(draft.id, 'PENDING_REVIEW');
}

async function postPatch(body: unknown) {
  const { POST } = await import('@/app/api/review/patch/route');
  const res = await POST(
    new Request('https://example.test/api/review/patch', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

describe('POST /api/review/patch', () => {
  it('stores owner media with field edits in one draft transition', async () => {
    const draft = await seedPendingDraft();
    const media = {
      kind: 'owner',
      bytes: Buffer.from('fake image bytes').toString('base64'),
      mime: 'image/png',
      alt: '',
    };

    const res = await postPatch({
      draft_id: draft.id,
      body: 'updated body',
      content_kind: 'single_image',
      media,
    });

    const saved = await getDraft(draft.id);
    expect(res.status).toBe(200);
    expect(saved?.version).toBe(draft.version + 1);
    expect(saved?.body).toBe('updated body');
    expect(saved?.content_kind).toBe('single_image');
    expect(saved?.media).toEqual(media);
  });

  it('rejects invalid patch data without storing media', async () => {
    const draft = await seedPendingDraft();

    const res = await postPatch({
      draft_id: draft.id,
      content_kind: 'article',
      article: { source: 'not a url' },
      media: {
        kind: 'owner',
        bytes: Buffer.from('fake image bytes').toString('base64'),
        mime: 'image/png',
      },
    });

    const saved = await getDraft(draft.id);
    expect(res.status).toBe(400);
    expect(saved?.version).toBe(draft.version);
    expect(saved?.media).toBeUndefined();
    expect(saved?.content_kind).toBe('text');
  });
});
