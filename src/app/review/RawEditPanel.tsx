'use client';

import { useEffect, useRef, useState } from 'react';
import type { ContentKind, Draft, LinkPlacement } from '@/lib/types';
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
  content_kind?: ContentKind;
  article?: { source?: string; title?: string };
  remove_thumbnail?: boolean;
  remove_media?: boolean;
}

type PendingImage =
  | { mode: 'unchanged' }
  | { mode: 'remove' }
  | { mode: 'replace'; file: File; previewUrl: string };

const PENDING_UNCHANGED: PendingImage = { mode: 'unchanged' };

const normalize = (tags: string[]): string[] =>
  tags.map((t) => t.replace(/^#+/, '').toLowerCase());

function tagsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((t, i) => t === b[i]);
}

export default function RawEditPanel({ draft, pillars, onSaved, onCancel }: Props) {
  const initialTags = normalize(draft.hashtags);
  const [contentKind, setContentKind] = useState<ContentKind>(draft.content_kind);
  const [body, setBody] = useState(draft.body);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [pillar, setPillar] = useState(draft.pillar);
  const [linkUrl, setLinkUrl] = useState(draft.link?.url ?? '');
  const [linkPlacement, setLinkPlacement] = useState<LinkPlacement>(
    draft.link?.placement ?? 'none',
  );
  const [articleSource, setArticleSource] = useState(draft.article?.source ?? '');
  const [articleTitle, setArticleTitle] = useState(draft.article?.title ?? '');
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<PendingImage>(PENDING_UNCHANGED);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadSlot = contentKind === 'article' ? 'thumbnail' : 'media';

  useEffect(() => {
    if (pendingImage.mode === 'replace') {
      const url = pendingImage.previewUrl;
      return () => URL.revokeObjectURL(url);
    }
    return undefined;
  }, [pendingImage]);

  const dirty =
    body !== draft.body ||
    !tagsEqual(tags, initialTags) ||
    pillar !== draft.pillar ||
    linkUrl !== (draft.link?.url ?? '') ||
    linkPlacement !== (draft.link?.placement ?? 'none') ||
    contentKind !== draft.content_kind ||
    articleSource !== (draft.article?.source ?? '') ||
    articleTitle !== (draft.article?.title ?? '') ||
    pendingImage.mode !== 'unchanged';

  const singleImageSrc =
    draft.media?.url ??
    (draft.media?.bytes && draft.media.mime
      ? `data:${draft.media.mime};base64,${draft.media.bytes}`
      : null);

  const thumbnailSrc =
    draft.article?.thumbnail?.url ??
    (draft.article?.thumbnail?.bytes && draft.article.thumbnail.mime
      ? `data:${draft.article.thumbnail.mime};base64,${draft.article.thumbnail.bytes}`
      : null);

  const draftMediaSrc = contentKind === 'article' ? thumbnailSrc : singleImageSrc;
  const mediaPreviewSrc =
    pendingImage.mode === 'replace'
      ? pendingImage.previewUrl
      : pendingImage.mode === 'remove'
        ? null
        : draftMediaSrc;

  function queueImageReplace(file: File) {
    setErr(null);
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setErr('Image must be PNG or JPEG.');
      return;
    }
    if (file.size > 1024 * 1024) {
      setErr('Image must be ≤ 1 MB.');
      return;
    }
    setPendingImage({ mode: 'replace', file, previewUrl: URL.createObjectURL(file) });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function queueImageRemove() {
    setErr(null);
    setPendingImage({ mode: 'remove' });
  }

  function changeContentKind(next: ContentKind) {
    setContentKind(next);
    // The pending image is tied to the current slot (media vs thumbnail).
    // Switching kinds invalidates it, and the server also clears the other
    // slot's media on save, so reset rather than carry stale state.
    setPendingImage(PENDING_UNCHANGED);
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      let workingDraft = draft;

      if (pendingImage.mode === 'replace') {
        const form = new FormData();
        form.append('draft_id', draft.id);
        form.append('file', pendingImage.file);
        form.append('slot', uploadSlot);
        const res = await fetch('/api/review/upload-image', { method: 'POST', body: form });
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(`upload ${res.status}: ${msg}`);
        }
        const json = (await res.json()) as { draft?: Draft };
        if (json.draft) workingDraft = json.draft;
      }

      const patch: PatchPayload = { draft_id: draft.id };
      if (body !== draft.body) patch.body = body;
      if (!tagsEqual(tags, initialTags)) patch.hashtags = tags;
      if (pillar !== draft.pillar) patch.pillar = pillar;
      if (contentKind !== draft.content_kind) patch.content_kind = contentKind;
      if (contentKind === 'article') {
        const sourceChanged = articleSource !== (draft.article?.source ?? '');
        const titleChanged = articleTitle !== (draft.article?.title ?? '');
        if (sourceChanged || titleChanged) {
          patch.article = {
            ...(sourceChanged ? { source: articleSource } : {}),
            ...(titleChanged ? { title: articleTitle } : {}),
          };
        }
      }
      if (contentKind !== 'article') {
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
      }
      if (pendingImage.mode === 'remove') {
        if (uploadSlot === 'thumbnail') patch.remove_thumbnail = true;
        else patch.remove_media = true;
      }

      if (Object.keys(patch).length > 1) {
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
        workingDraft = json.draft;
      }

      setPendingImage(PENDING_UNCHANGED);
      onSaved(workingDraft);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  const inputsDisabled = busy;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Raw edit</h3>
        <span className="text-xs text-zinc-500">edits skip the LLM and the linter</span>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            Content type
            <InfoIcon tip="text = commentary only. single image = post + 1 image. article = LinkedIn's rich-card link share (no inline link required; the card shows title + thumbnail + source domain). Switching kinds clears fields that don't apply." />
          </span>
        </label>
        <select
          value={contentKind}
          onChange={(e) => changeContentKind(e.target.value as ContentKind)}
          disabled={inputsDisabled}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
        >
          <option value="text">text — commentary only</option>
          <option value="single_image">single image — post + 1 image</option>
          <option value="article">article — rich-card link share</option>
        </select>
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

      {contentKind === 'article' && (
        <div className="mt-3 space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
              <span className="inline-flex items-center gap-1.5">
                Article source URL
                <InfoIcon tip="The article the post is about. LinkedIn renders this as the rich card's clickable destination." />
              </span>
            </label>
            <input
              type="url"
              value={articleSource}
              onChange={(e) => setArticleSource(e.target.value)}
              placeholder="https://…"
              disabled={inputsDisabled}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
              <span className="inline-flex items-center gap-1.5">
                Article card title
                <InfoIcon tip="Bold text shown on the card. Rendered verbatim; LinkedIn does not auto-fetch the page's own title." />
              </span>
            </label>
            <input
              type="text"
              value={articleTitle}
              onChange={(e) => setArticleTitle(e.target.value)}
              placeholder="What the card says above the domain"
              maxLength={400}
              disabled={inputsDisabled}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            />
            <p className="mt-1 text-[10px] text-zinc-500">{articleTitle.length} / 400</p>
          </div>
        </div>
      )}

      {contentKind !== 'text' && (
      <div className="mt-3">
        <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            {uploadSlot === 'thumbnail' ? 'Article thumbnail' : 'Image'}
            <InfoIcon tip={uploadSlot === 'thumbnail'
              ? 'Optional. If omitted, the publisher will try the article URL’s OG image at publish time. PNG or JPEG, ≤1MB.'
              : 'Optional image attached to the post. Saved on click of Save edit; discarded on Cancel. PNG or JPEG, ≤1MB.'} />
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
                Replace image
              </button>
              <button
                type="button"
                onClick={queueImageRemove}
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
              if (f) queueImageReplace(f);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={
              'mt-1 flex h-20 cursor-pointer items-center justify-center rounded-md border border-dashed text-xs ' +
              (dragOver
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                : 'border-zinc-300 text-zinc-500 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600')
            }
          >
            Drop image here or click to choose (PNG/JPEG, ≤1MB)
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
            if (f) queueImageReplace(f);
          }}
        />
      </div>
      )}

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

      {contentKind !== 'article' && (
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
      )}

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
