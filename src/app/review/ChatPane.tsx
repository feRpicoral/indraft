'use client';

import { useState } from 'react';
import type { Draft } from '@/lib/types';

interface Props {
  draft: Draft;
  onSubmit: (message: string, imageFile?: File, pastedUrl?: string) => Promise<void>;
  busy: boolean;
}

const URL_RE = /(https?:\/\/[^\s]+)/g;

export default function ChatPane({ draft, onSubmit, busy }: Props) {
  const [message, setMessage] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) return;
    const pastedUrl = extractFirstUrl(message);
    await onSubmit(message, imageFile ?? undefined, pastedUrl);
    setMessage('');
    setImageFile(null);
  };

  return (
    <div className="flex h-full flex-col rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex-1 space-y-3 overflow-y-auto pb-3">
        {draft.conversation.length === 0 && (
          <p className="text-sm text-zinc-500">
            Talk to the draft. &ldquo;tighten this&rdquo;, &ldquo;lead with the counterpoint&rdquo;,
            drag in an image, paste a URL to pivot.
          </p>
        )}
        {draft.conversation.map((t, i) => (
          <div
            key={i}
            className={
              t.role === 'user'
                ? 'rounded-md bg-zinc-100 p-2 text-sm dark:bg-zinc-800'
                : 'rounded-md border border-zinc-200 p-2 text-sm dark:border-zinc-700'
            }
          >
            <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{t.role}</div>
            <div className="whitespace-pre-wrap">{t.content}</div>
            {t.imageUrl && (
              <p className="mt-1 text-xs text-zinc-500">image: {t.imageUrl}</p>
            )}
            {t.pastedUrl && (
              <p className="mt-1 text-xs text-zinc-500">pasted: {t.pastedUrl}</p>
            )}
          </div>
        ))}
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
          placeholder="What should change?"
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
          <button
            type="button"
            onClick={handleSend}
            disabled={busy || !message.trim()}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-100"
          >
            {busy ? 'Thinking…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

function extractFirstUrl(s: string): string | undefined {
  const m = s.match(URL_RE);
  return m?.[0];
}
