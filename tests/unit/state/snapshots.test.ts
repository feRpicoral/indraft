import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { createDraft, transition, MissingSnapshotMetaError } from '@/lib/state/drafts';
import { listSnapshots, appendSnapshot, SNAPSHOT_CAP } from '@/lib/state/snapshots';
import { __resetKvForTest } from '@/lib/state/kv';

beforeAll(() => {
  process.env.INDRAFT_FORCE_MEMORY_KV = '1';
});

beforeEach(() => {
  __resetKvForTest();
});

function freshInput() {
  return {
    body: 'original body',
    content_kind: 'text' as const,
    hashtags: ['a', 'b'],
    mentions: [],
    pillar: 'fullstack',
    source_url: 'https://example.com',
    conversation: [],
  };
}

describe('snapshots', () => {
  it('captures pre-edit state on every EDITED transition', async () => {
    const d = await createDraft(freshInput());
    await transition(d.id, 'PENDING_REVIEW');

    await transition(d.id, 'EDITED', {
      patch: { body: 'second body' },
      snapshotMeta: { actor: 'user', summary: 'first edit' },
    });
    await transition(d.id, 'EDITED', {
      patch: { body: 'third body' },
      snapshotMeta: { actor: 'llm', summary: 'second edit' },
    });

    const snapshots = await listSnapshots(d.id);

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]?.version).toBe(2);
    expect(snapshots[0]?.summary).toBe('second edit');
    expect(snapshots[0]?.fields.body).toBe('second body');
    expect(snapshots[1]?.version).toBe(1);
    expect(snapshots[1]?.summary).toBe('first edit');
    expect(snapshots[1]?.fields.body).toBe('original body');
  });

  it('rejects EDITED transitions without snapshotMeta', async () => {
    const d = await createDraft(freshInput());
    await transition(d.id, 'PENDING_REVIEW');

    await expect(
      transition(d.id, 'EDITED', { patch: { body: 'x' } }),
    ).rejects.toBeInstanceOf(MissingSnapshotMetaError);
  });

  it('caps the snapshot list at SNAPSHOT_CAP entries', async () => {
    const d = await createDraft(freshInput());

    for (let i = 0; i < SNAPSHOT_CAP + 5; i++) {
      await appendSnapshot({ draft: d, actor: 'user', summary: `edit ${i}` });
    }

    const snapshots = await listSnapshots(d.id);
    expect(snapshots).toHaveLength(SNAPSHOT_CAP);
    expect(snapshots[0]?.summary).toBe(`edit ${SNAPSHOT_CAP + 4}`);
  });

  it('captures media, article, and link fields when present', async () => {
    const d = await createDraft({
      ...freshInput(),
      media: { kind: 'owner', bytes: 'AAA', mime: 'image/png' },
      link: { url: 'https://example.com/y', placement: 'body' },
    });

    await appendSnapshot({ draft: d, actor: 'user', summary: 'capture' });
    const snapshots = await listSnapshots(d.id);

    expect(snapshots[0]?.fields.media).toEqual({ kind: 'owner', bytes: 'AAA', mime: 'image/png' });
    expect(snapshots[0]?.fields.link).toEqual({ url: 'https://example.com/y', placement: 'body' });
  });
});
