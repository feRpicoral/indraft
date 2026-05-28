'use client';

import { useEffect, useState } from 'react';
import type { Draft, DraftSnapshot, SnapshotActor } from '@/lib/types';

interface Props {
  draft: Draft;
  onRestored: (draft: Draft) => void;
  onClose: () => void;
}

export default function HistoryPanel({ draft, onRestored, onClose }: Props) {
  const [snapshots, setSnapshots] = useState<DraftSnapshot[] | null>(null);
  const [busyVersion, setBusyVersion] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/review/snapshots?draft_id=${draft.id}`);
      if (cancelled) return;
      if (!res.ok) {
        setErr(`load ${res.status}`);
        setSnapshots([]);
        return;
      }
      const json = (await res.json()) as { snapshots: DraftSnapshot[] };
      setSnapshots(json.snapshots);
    })();
    return () => {
      cancelled = true;
    };
    // Refetch whenever the draft version moves — a new edit means a new snapshot.
  }, [draft.id, draft.version]);

  async function restore(version: number) {
    setBusyVersion(version);
    setErr(null);
    try {
      const res = await fetch('/api/review/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draft.id, version }),
      });
      if (!res.ok) {
        setErr(`restore ${res.status}: ${await res.text()}`);
        return;
      }
      const json = (await res.json()) as { draft: Draft };
      onRestored(json.draft);
    } finally {
      setBusyVersion(null);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">History</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-zinc-500 hover:underline"
        >
          Close
        </button>
      </div>
      {snapshots === null && <p className="text-xs text-zinc-500">Loading…</p>}
      {snapshots !== null && snapshots.length === 0 && (
        <p className="text-xs text-zinc-500">No prior versions yet. Edits will appear here.</p>
      )}
      {snapshots !== null && snapshots.length > 0 && (
        <ul className="space-y-2">
          {snapshots.map((s) => (
            <li
              key={s.version}
              className="flex items-start justify-between gap-3 rounded-md border border-zinc-200 p-2 text-sm dark:border-zinc-700"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="font-mono">v{s.version}</span>
                  <ActorBadge actor={s.actor} />
                  <span>{relativeTime(s.ts)}</span>
                </div>
                <p className="mt-1 truncate text-zinc-700 dark:text-zinc-200" title={s.summary}>
                  {s.summary}
                </p>
              </div>
              <button
                type="button"
                onClick={() => restore(s.version)}
                disabled={busyVersion !== null}
                className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {busyVersion === s.version ? 'Restoring…' : 'Restore'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}

function ActorBadge({ actor }: { actor: SnapshotActor }) {
  const label = actor === 'llm' ? 'LLM' : actor === 'user' ? 'You' : 'System';
  return (
    <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wider dark:bg-zinc-800">
      {label}
    </span>
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
  return new Date(ts).toLocaleDateString();
}
