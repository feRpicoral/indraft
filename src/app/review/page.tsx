import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, readSession } from '@/lib/review/session';
import { getDraft } from '@/lib/state/drafts';
import { loadConfig } from '@/lib/config/loader';
import { isStale } from '@/lib/review/staleness';
import ReviewClient from './ReviewClient';

export const dynamic = 'force-dynamic';

/**
 * Magic-link landing for the review UI. Token consumption + cookie set live
 * in /api/review/consume (Server Components in Next 16 can't write cookies).
 * A stray `?token=...` (old link, refresh) is forwarded to that route so the
 * flow remains a single click for the owner.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (token) redirect(`/api/review/consume?token=${encodeURIComponent(token)}`);

  const cfg = loadConfig();
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (!sid) redirect('/access');
  const binding = await readSession(sid);
  if (!binding) redirect('/access');
  if (binding.draftId === '*') redirect('/access');

  const draft = await getDraft(binding.draftId);
  if (!draft) redirect('/access');

  return (
    <ReviewClient
      initialDraft={draft}
      stale={isStale(draft, cfg.review.stale_after_hours)}
      _justSetCookie={false}
    />
  );
}
