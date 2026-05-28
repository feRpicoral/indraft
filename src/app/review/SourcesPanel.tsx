'use client';

import { useEffect, useState } from 'react';
import type { Draft, SourceItem } from '@/lib/types';

interface Props {
  draft: Draft;
  onRegenerated: (draft: Draft) => void;
  onClose: () => void;
}

export default function SourcesPanel({ draft, onRegenerated, onClose }: Props) {
  const [items, setItems] = useState<SourceItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [confirmUrl, setConfirmUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/review/sources?draft_id=${draft.id}`);
      if (cancelled) return;
      if (!res.ok) {
        setErr(`load ${res.status}`);
        setItems([]);
        return;
      }
      const json = (await res.json()) as { items: SourceItem[] };
      setItems(json.items);
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.id]);

  async function regenerate(sourceUrl: string) {
    setBusyUrl(sourceUrl);
    setErr(null);
    setConfirmUrl(null);
    try {
      const res = await fetch('/api/review/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draft.id, source_url: sourceUrl }),
      });
      if (!res.ok) {
        setErr(`regenerate ${res.status}: ${await res.text()}`);
        return;
      }
      const json = (await res.json()) as { draft: Draft };
      onRegenerated(json.draft);
    } finally {
      setBusyUrl(null);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Sources</h3>
        <button type="button" onClick={onClose} className="text-xs text-zinc-500 hover:underline">
          Close
        </button>
      </div>
      {items === null && <p className="text-xs text-zinc-500">Loading current feed…</p>}
      {items !== null && items.length === 0 && (
        <p className="text-xs text-zinc-500">No items available right now.</p>
      )}
      {items !== null && items.length > 0 && (
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
          {items.map((item) => {
            const isCurrent = item.url === draft.source_url;
            return (
              <li
                key={item.url}
                className={
                  'rounded-md border p-2 text-sm ' +
                  (isCurrent
                    ? 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30'
                    : 'border-zinc-200 dark:border-zinc-700')
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
                        {item.category}
                      </span>
                      <span>{item.source}</span>
                      <span>·</span>
                      <span>{relativeTime(item.published_at)}</span>
                      {isCurrent && (
                        <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-50">
                      {item.title}
                    </p>
                    {item.summary && (
                      <p className="mt-1 line-clamp-3 text-xs text-zinc-500">{item.summary}</p>
                    )}
                  </div>
                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => setConfirmUrl(item.url)}
                      disabled={busyUrl !== null}
                      className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      {busyUrl === item.url ? 'Regenerating…' : 'Use'}
                    </button>
                  )}
                </div>
                {confirmUrl === item.url && (
                  <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                    <p>Regenerate the draft from this source? The current version is saved to history.</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => regenerate(item.url)}
                        className="rounded-md bg-amber-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-amber-700"
                      >
                        Regenerate
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmUrl(null)}
                        className="rounded-md border border-amber-400 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  return `${days}d ago`;
}
