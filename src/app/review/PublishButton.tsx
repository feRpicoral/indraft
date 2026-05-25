'use client';

import { useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import type { Draft } from '@/lib/types';

interface Props {
  draft: Draft;
  onPublished: (urn: string) => void;
}

type Status = 'idle' | 'requesting' | 'asserting' | 'publishing' | 'done' | 'error';

export default function PublishButton({ draft, onPublished }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [err, setErr] = useState<string | null>(null);

  async function onPost() {
    setStatus('requesting');
    setErr(null);
    try {
      const optsRes = await fetch('/api/auth/passkey/assert/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draft.id, version: draft.version }),
      });
      if (!optsRes.ok) {
        const msg = await optsRes.text();
        throw new Error(`assert options ${optsRes.status}: ${msg}`);
      }
      const opts = await optsRes.json();
      setStatus('asserting');
      const assertion = await startAuthentication({ optionsJSON: opts });
      setStatus('publishing');
      const pubRes = await fetch('/api/review/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draft.id, version: draft.version, assertion }),
      });
      if (!pubRes.ok) {
        const msg = await pubRes.text();
        throw new Error(`publish ${pubRes.status}: ${msg}`);
      }
      const json = (await pubRes.json()) as { urn?: string };
      if (!json.urn) throw new Error('publish returned no urn');
      setStatus('done');
      onPublished(json.urn);
    } catch (e) {
      setStatus('error');
      setErr(String(e));
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onPost}
        disabled={status !== 'idle' && status !== 'error'}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {status === 'idle' && 'Post'}
        {status === 'requesting' && 'Preparing…'}
        {status === 'asserting' && 'Waiting for passkey…'}
        {status === 'publishing' && 'Publishing…'}
        {status === 'done' && 'Posted ✓'}
        {status === 'error' && 'Retry'}
      </button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
