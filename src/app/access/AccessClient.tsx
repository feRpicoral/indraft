'use client';

import { useState } from 'react';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function AccessClient() {
  const [status, setStatus] = useState<Status>('idle');
  const [count, setCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    setStatus('sending');
    setErr(null);
    try {
      const res = await fetch('/api/access/request', { method: 'POST' });
      const json = (await res.json()) as { ok?: boolean; sent?: number; error?: string };
      if (!res.ok || !json.ok) {
        setStatus('error');
        setErr(json.error ?? `failed (${res.status})`);
        return;
      }
      setCount(json.sent ?? 0);
      setStatus('sent');
    } catch (e) {
      setStatus('error');
      setErr(String(e));
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={status === 'sending'}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-100"
      >
        {status === 'sending' ? 'Sending…' : 'Email me the links'}
      </button>
      {status === 'sent' && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          Sent {count} link{count === 1 ? '' : 's'}. Check your inbox.
        </p>
      )}
      {status === 'error' && err && (
        <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
      )}
    </div>
  );
}
