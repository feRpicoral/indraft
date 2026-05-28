'use client';

import { useState } from 'react';
import type { Draft, EditTurn } from '@/lib/types';
import { resolveChatSendDraft } from './chatSend';

interface Props {
  draft: Draft;
  onSubmit: (message: string, imageFile?: File, pastedUrl?: string) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
  pendingTurn: EditTurn | null;
}

export default function ChatPane({ draft, onSubmit, onCancel, busy, pendingTurn }: Props) {
  const [message, setMessage] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleSend = () => {
    const sendDraft = resolveChatSendDraft(message, pendingTurn);
    if (!sendDraft || busy) return;
    const file = imageFile ?? undefined;
    setMessage('');
    setImageFile(null);
    void onSubmit(sendDraft.text, file, sendDraft.pastedUrl);
  };
  const canSend = resolveChatSendDraft(message, pendingTurn) !== null;

  return (
    <div className="flex h-full flex-col rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex-1 space-y-3 overflow-y-auto pb-3">
        {draft.conversation.length === 0 && pendingTurn === null && (
          <p className="text-sm text-zinc-500">
            Talk to the draft. &ldquo;tighten this&rdquo;, &ldquo;lead with the counterpoint&rdquo;,
            drag in an image, paste a URL to pivot.
          </p>
        )}
        {draft.conversation.map((t, i) => (
          <TurnBubble key={i} turn={t} />
        ))}
        {pendingTurn && <TurnBubble turn={pendingTurn} />}
        {busy && <ThinkingBubble />}
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f && f.type.startsWith('image/')) setImageFile(f);
        }}
        className={
          'mt-2 rounded-md border p-2 text-sm ' +
          (dragOver
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
            : 'border-zinc-200 dark:border-zinc-700')
        }
      >
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={busy ? 'Waiting for the assistant…' : 'What should change?'}
          className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-zinc-400"
          disabled={busy}
        />
        <div className="mt-2 flex items-center justify-between">
          <label className="cursor-pointer text-xs text-zinc-500 hover:underline">
            {imageFile ? imageFile.name : 'Attach image'}
            <input
              type="file"
              accept="image/png,image/jpeg"
              hidden
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
          </label>
          {busy ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-100"
            >
              {pendingTurn && !message.trim() ? 'Resend' : 'Send'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TurnBubble({ turn }: { turn: EditTurn }) {
  return (
    <div
      className={
        turn.role === 'user'
          ? 'rounded-md bg-zinc-100 p-2 text-sm dark:bg-zinc-800'
          : 'rounded-md border border-zinc-200 p-2 text-sm dark:border-zinc-700'
      }
    >
      <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{turn.role}</div>
      <div className="whitespace-pre-wrap">{turn.content}</div>
      {turn.imageUrl && <p className="mt-1 text-xs text-zinc-500">image: {turn.imageUrl}</p>}
      {turn.pastedUrl && <p className="mt-1 text-xs text-zinc-500">pasted: {turn.pastedUrl}</p>}
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="rounded-md border border-zinc-200 p-2 text-sm dark:border-zinc-700">
      <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">assistant</div>
      <div className="flex items-center gap-1.5 text-zinc-400">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 dark:bg-zinc-500"
      style={{ animationDelay: delay }}
      aria-hidden
    />
  );
}
