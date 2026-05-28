'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Draft, EditTurn } from '@/lib/types';
import PreviewPane from './PreviewPane';
import ChatPane from './ChatPane';
import PublishButton from './PublishButton';
import RawEditPanel from './RawEditPanel';
import { Toggle, ConfirmModal } from './ui';

interface Props {
  initialDraft: Draft;
  pillars: string[];
  stale: boolean;
  // The page may have just set a Set-Cookie; we don't need to act on it,
  // it's only here to keep the server component's behavior testable.
  _justSetCookie: boolean;
}

export default function ReviewClient({ initialDraft, pillars, stale }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [rawEdit, setRawEdit] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pendingTurn, setPendingTurn] = useState<EditTurn | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function submitEdit(message: string, imageFile?: File, pastedUrl?: string) {
    if (busy) return;
    const optimisticTurn: EditTurn = {
      role: 'user',
      content: message,
      ...(pastedUrl !== undefined ? { pastedUrl } : {}),
      ts: Date.now(),
    };
    setPendingTurn(optimisticTurn);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      if (imageFile) {
        const form = new FormData();
        form.append('draft_id', draft.id);
        form.append('file', imageFile);
        const r = await fetch('/api/review/upload-image', {
          method: 'POST',
          body: form,
          signal: controller.signal,
        });
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
          ...(pastedUrl !== undefined ? { pastedUrl } : {}),
        }),
        signal: controller.signal,
      });
      if (editRes.ok) {
        const j = (await editRes.json()) as { draft: Draft };
        setDraft(j.draft);
        setPendingTurn(null);
      }
    } catch (err) {
      // Aborted: keep the optimistic turn visible so the user can re-send.
      // Any other error: also keep the turn — the parent UI doesn't have a
      // dedicated error surface here, and leaving the message lets the user
      // retry without retyping.
      if (!isAbortError(err)) {
        console.error('chat edit failed', err);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function cancelEdit() {
    abortRef.current?.abort();
  }

  async function doDiscard() {
    setConfirmDiscard(false);
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
          <div className="flex items-center gap-4">
            <Toggle
              checked={rawEdit}
              onChange={setRawEdit}
              label="Raw edit"
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => setConfirmDiscard(true)}
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
            This draft&apos;s source news is more than 48h old. Consider asking the chat to
            regenerate against current news.
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2 md:items-start">
          {rawEdit ? (
            <RawEditPanel
              draft={draft}
              pillars={pillars}
              onSaved={(d) => {
                setDraft(d);
                setRawEdit(false);
              }}
              onCancel={() => setRawEdit(false)}
            />
          ) : (
            <PreviewPane draft={draft} />
          )}
          <ChatPane
            draft={draft}
            onSubmit={submitEdit}
            onCancel={cancelEdit}
            busy={busy}
            pendingTurn={pendingTurn}
          />
        </div>
      </div>

      <ConfirmModal
        open={confirmDiscard}
        title="Discard this draft?"
        message="This moves the draft to DISCARDED and removes it from the pending queue. The action can't be undone."
        confirmLabel="Discard"
        confirmTone="danger"
        onConfirm={doDiscard}
        onCancel={() => setConfirmDiscard(false)}
      />
    </main>
  );
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException && err.name === 'AbortError'
  ) || (typeof err === 'object' && err !== null && 'name' in err && (err as { name: string }).name === 'AbortError');
}
