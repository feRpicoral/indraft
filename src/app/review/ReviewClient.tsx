'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Draft } from '@/lib/types';
import PreviewPane from './PreviewPane';
import ChatPane from './ChatPane';
import PublishButton from './PublishButton';

interface Props {
  initialDraft: Draft;
  stale: boolean;
  // The page may have just set a Set-Cookie; we don't need to act on it,
  // it's only here to keep the server component's behavior testable.
  _justSetCookie: boolean;
}

export default function ReviewClient({ initialDraft, stale }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function submitEdit(message: string, imageFile?: File, pastedUrl?: string) {
    setBusy(true);
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        const form = new FormData();
        form.append('draft_id', draft.id);
        form.append('file', imageFile);
        const r = await fetch('/api/review/upload-image', { method: 'POST', body: form });
        if (r.ok) {
          const j = (await r.json()) as { draft?: Draft };
          if (j.draft) setDraft(j.draft);
        }
      }
      const editRes = await fetch('/api/review/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft_id: draft.id,
          message,
          ...(imageUrl !== undefined ? { imageUrl } : {}),
          ...(pastedUrl !== undefined ? { pastedUrl } : {}),
        }),
      });
      if (editRes.ok) {
        const j = (await editRes.json()) as { draft: Draft };
        setDraft(j.draft);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onDiscard() {
    if (!confirm('Discard this draft?')) return;
    await fetch('/api/review/discard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft_id: draft.id }),
    });
    router.push('/access');
  }

  if (done) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Posted</h1>
          <p className="mt-2 text-sm text-zinc-500">URN: {done}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-zinc-50 px-4 py-6 dark:bg-black md:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Review draft</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDiscard}
              className="text-sm text-red-600 hover:underline"
              disabled={busy}
            >
              Discard
            </button>
            <PublishButton draft={draft} onPublished={(urn) => setDone(urn)} />
          </div>
        </header>
        {stale && (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
            This draft&apos;s source news is more than {/* hours */}48h old. Consider asking the chat
            to regenerate against current news.
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <PreviewPane draft={draft} />
          <ChatPane draft={draft} onSubmit={submitEdit} busy={busy} />
        </div>
      </div>
    </main>
  );
}
