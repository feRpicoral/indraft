'use client';

import { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';

type Status = 'idle' | 'starting' | 'verifying' | 'done' | 'error';

export default function EnrollClient({ bootstrapToken }: { bootstrapToken: string | null }) {
  const [status, setStatus] = useState<Status>('idle');
  const [err, setErr] = useState<string | null>(null);

  async function enroll() {
    setStatus('starting');
    setErr(null);
    try {
      const qs = bootstrapToken ? `?bootstrap=${encodeURIComponent(bootstrapToken)}` : '';
      const optsRes = await fetch(`/api/auth/passkey/register/options${qs}`, {
        method: 'POST',
      });
      if (!optsRes.ok) {
        const msg = await optsRes.text();
        throw new Error(`options ${optsRes.status}: ${msg}`);
      }
      const opts = await optsRes.json();
      setStatus('verifying');
      const attestation = await startRegistration({ optionsJSON: opts });
      const verifyRes = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attestation),
      });
      const verifyJson = (await verifyRes.json()) as { verified?: boolean };
      if (!verifyRes.ok || !verifyJson.verified) {
        throw new Error('verification failed');
      }
      setStatus('done');
    } catch (e) {
      setStatus('error');
      setErr(String(e));
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      <button
        type="button"
        onClick={enroll}
        disabled={status === 'starting' || status === 'verifying' || status === 'done'}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-100"
      >
        {status === 'starting' && 'Preparing…'}
        {status === 'verifying' && 'Waiting for device…'}
        {(status === 'idle' || status === 'error') && 'Enroll passkey'}
        {status === 'done' && 'Enrolled ✓'}
      </button>
      {status === 'done' && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          Passkey registered. You can close this tab.
        </p>
      )}
      {status === 'error' && err && (
        <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
      )}
    </div>
  );
}
