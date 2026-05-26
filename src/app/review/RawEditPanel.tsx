'use client';

import { useRef, useState } from 'react';
import type { Draft, LinkPlacement } from '@/lib/types';
import HashtagPills from './HashtagPills';
import { InfoIcon } from './ui';

interface Props {
  draft: Draft;
  pillars: string[];
  onSaved: (draft: Draft) => void;
  onCancel: () => void;
}

interface PatchPayload {
  draft_id: string;
  body?: string;
  hashtags?: string[];
  pillar?: string;
  link_url?: string | null;
  link_placement?: LinkPlacement;
}

const normalize = (tags: string[]): string[] =>
  tags.map((t) => t.replace(/^#+/, '').toLowerCase());

function tagsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((t, i) => t === b[i]);
}

export default function RawEditPanel({ draft, pillars, onSaved, onCancel }: Props) {
  const initialTags = normalize(draft.hashtags);
  const [body, setBody] = useState(draft.body);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [pillar, setPillar] = useState(draft.pillar);
  const [linkUrl, setLinkUrl] = useState(draft.link?.url ?? '');
  const [linkPlacement, setLinkPlacement] = useState<LinkPlacement>(
    draft.link?.placement ?? 'none',
  );
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dirty =
    body !== draft.body ||
    !tagsEqual(tags, initialTags) ||
    pillar !== draft.pillar ||
    linkUrl !== (draft.link?.url ?? '') ||
    linkPlacement !== (draft.link?.placement ?? 'none');

  const mediaPreviewSrc =
    draft.media?.url ??
    (draft.media?.bytes && draft.media.mime
      ? `data:${draft.media.mime};base64,${draft.media.bytes}`
      : null);

  async function uploadImage(file: File) {
    if (imageBusy) return;
    setErr(null);
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setErr('Image must be PNG or JPEG.');
      return;
    }
    if (file.size > 1024 * 1024) {
      setErr('Image must be ≤ 1 MB.');
      return;
    }
    setImageBusy(true);
    try {
      const form = new FormData();
      form.append('draft_id', draft.id);
      form.append('file', file);
      const res = await fetch('/api/review/upload-image', { method: 'POST', body: form });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`upload ${res.status}: ${msg}`);
      }
      const json = (await res.json()) as { draft?: Draft };
      if (json.draft) onSaved(json.draft);
    } catch (e) {
      setErr(String(e));
    } finally {
      setImageBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function removeImage() {
    if (imageBusy) return;
    setErr(null);
    setImageBusy(true);
    try {
      const res = await fetch('/api/review/patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draft.id, remove_media: true }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`remove ${res.status}: ${msg}`);
      }
      const json = (await res.json()) as { draft: Draft };
      onSaved(json.draft);
    } catch (e) {
      setErr(String(e));
    } finally {
      setImageBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const patch: PatchPayload = { draft_id: draft.id };
      if (body !== draft.body) patch.body = body;
      if (!tagsEqual(tags, initialTags)) patch.hashtags = tags;
      if (pillar !== draft.pillar) patch.pillar = pillar;
      const placementChanged = linkPlacement !== (draft.link?.placement ?? 'none');
      const urlChanged = linkUrl !== (draft.link?.url ?? '');
      if (placementChanged || urlChanged) {
        if (linkPlacement === 'none' || !linkUrl) {
          patch.link_url = null;
          patch.link_placement = 'none';
        } else {
          patch.link_url = linkUrl;
          patch.link_placement = linkPlacement;
        }
      }

      const res = await fetch('/api/review/patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`patch ${res.status}: ${msg}`);
      }
      const json = (await res.json()) as { draft: Draft };
      onSaved(json.draft);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  const inputsDisabled = busy || imageBusy;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Raw edit</h3>
        <span className="text-xs text-zinc-500">edits skip the LLM and the linter</span>
      </div>

      <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
        Body
      </label>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={14}
        className="mt-1 w-full resize-y rounded-md border border-zinc-300 bg-white p-2 font-sans text-sm leading-6 text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
        disabled={inputsDisabled}
      />
      <p className="mt-1 text-[10px] text-zinc-500">{body.length} / 3000</p>

      <div className="mt-3">
        <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            Image
            <InfoIcon tip="Optional image attached to the post. Uploaded immediately; removing is also immediate. PNG or JPEG, ≤1MB." />
          </span>
        </label>
        {mediaPreviewSrc ? (
          <div className="mt-1 flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaPreviewSrc}
              alt={draft.media?.alt ?? ''}
              className="max-h-32 rounded-md border border-zinc-200 object-cover dark:border-zinc-700"
            />
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={inputsDisabled}
                className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {imageBusy ? 'Working…' : 'Replace image'}
              </button>
              <button
                type="button"
                onClick={removeImage}
                disabled={inputsDisabled}
                className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
              >
                Remove image
              </button>
            </div>
          </div>
        ) : (
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
              if (f) void uploadImage(f);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={
              'mt-1 flex h-20 cursor-pointer items-center justify-center rounded-md border border-dashed text-xs ' +
              (dragOver
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                : 'border-zinc-300 text-zinc-500 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600')
            }
          >
            {imageBusy ? 'Uploading…' : 'Drop image here or click to choose (PNG/JPEG, ≤1MB)'}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          hidden
          disabled={inputsDisabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadImage(f);
          }}
        />
      </div>

      <div className="mt-3">
        <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            Pillar
            <InfoIcon tip="Which of your content pillars this post belongs to. Used for rotation across runs so you don't post about the same theme back-to-back." />
          </span>
        </label>
        <select
          value={pillar}
          onChange={(e) => setPillar(e.target.value)}
          disabled={inputsDisabled}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
        >
          {pillars.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          {!pillars.includes(pillar) && <option value={pillar}>{pillar}</option>}
        </select>
      </div>

      <div className="mt-3">
        <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
          Hashtags
        </label>
        <div className="mt-1">
          <HashtagPills value={tags} onChange={setTags} disabled={inputsDisabled} />
        </div>
        <p className="mt-1 text-[10px] text-zinc-500">
          Enter / space / comma to add · Backspace on empty input removes the last tag · target 3–5
        </p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px]">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              Link URL
              <InfoIcon tip="Optional source URL for the news/article this post is about. Only included in the published post if placement is 'body' or 'comment'." />
            </span>
          </label>
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://…"
            disabled={inputsDisabled}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              Placement
              <InfoIcon tip="Where the link appears: none = omit entirely (recommended; LinkedIn suppresses links), body = appended to the post text, comment = posted as the first comment." />
            </span>
          </label>
          <select
            value={linkPlacement}
            onChange={(e) => setLinkPlacement(e.target.value as LinkPlacement)}
            disabled={inputsDisabled}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          >
            <option value="none">none</option>
            <option value="body">body</option>
            <option value="comment">comment</option>
          </select>
        </div>
      </div>

      {err && <p className="mt-3 text-xs text-red-600">{err}</p>}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={inputsDisabled}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={inputsDisabled || !dirty || body.length === 0}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-100"
        >
          {busy ? 'Saving…' : 'Save edit'}
        </button>
      </div>
    </div>
  );
}
