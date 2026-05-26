'use client';

import type { Draft } from '@/lib/types';

const LINKEDIN_FOLD_CHARS = 210;

/**
 * Split the body at the LinkedIn "see more" cutoff, snapping to the nearest
 * whitespace at or before the limit so a word is never sliced in half.
 */
function splitAtFold(body: string): { above: string; below: string } {
  if (body.length <= LINKEDIN_FOLD_CHARS) return { above: body, below: '' };
  const window = body.slice(0, LINKEDIN_FOLD_CHARS);
  const lastSpace = Math.max(window.lastIndexOf(' '), window.lastIndexOf('\n'));
  const cut = lastSpace > LINKEDIN_FOLD_CHARS * 0.6 ? lastSpace : LINKEDIN_FOLD_CHARS;
  return { above: body.slice(0, cut), below: body.slice(cut).replace(/^\s+/, '') };
}

export default function PreviewPane({ draft }: { draft: Draft }) {
  const { above, below } = splitAtFold(draft.body);
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
          {draft.pillar}
        </span>
        {draft.linter_warnings && draft.linter_warnings.length > 0 && (
          <span
            className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700"
            title={draft.linter_warnings.join('\n')}
          >
            {draft.linter_warnings.length} lint warning(s)
          </span>
        )}
      </div>
      <article className="whitespace-pre-wrap font-sans text-sm leading-6 text-zinc-900 dark:text-zinc-50">
        {above}
        {below && (
          <>
            <span
              className="my-3 flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-400"
              title="LinkedIn truncates here in the feed. Above the fold is what hooks readers."
            >
              <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" aria-hidden />
              see more
              <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" aria-hidden />
            </span>
            {below}
          </>
        )}
      </article>
      {draft.media?.url && (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={draft.media.url}
            alt={draft.media.alt ?? ''}
            className="max-h-72 rounded-md object-cover"
          />
        </div>
      )}
      {draft.media?.bytes && draft.media?.mime && (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:${draft.media.mime};base64,${draft.media.bytes}`}
            alt={draft.media.alt ?? ''}
            className="max-h-72 rounded-md object-cover"
          />
        </div>
      )}
      {draft.hashtags.length > 0 && (
        <p className="mt-3 text-sm text-blue-600 dark:text-blue-400">
          {draft.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}
        </p>
      )}
      {draft.link && (
        <p className="mt-3 text-xs text-zinc-500">
          link: <code>{draft.link.url}</code>{' '}
          <span className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">
            {draft.link.placement}
          </span>
        </p>
      )}
      <p className="mt-3 text-xs text-zinc-400">
        source:{' '}
        <a
          href={draft.source_url}
          target="_blank"
          rel="noreferrer"
          className="underline-offset-2 hover:underline"
        >
          {draft.source_url}
        </a>
      </p>
    </div>
  );
}
