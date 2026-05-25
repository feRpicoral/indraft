import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyMagicLink } from '@/lib/review/magicLink';
import { claimMagicNonce } from '@/lib/state/tokens';
import { createSession, SESSION_COOKIE, readSession } from '@/lib/review/session';
import { getDraft } from '@/lib/state/drafts';
import { loadConfig, loadEnv } from '@/lib/config/loader';
import { isStale } from '@/lib/review/staleness';
import ReviewClient from './ReviewClient';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const env = loadEnv();
  const cfg = loadConfig();
  const store = await cookies();

  let draftId: string | null = null;
  let needSetCookie = false;

  if (token) {
    const payload = verifyMagicLink({ token, secret: env.MAGIC_LINK_SIGNING_SECRET });
    if (!payload) redirect('/access');
    const claimed = await claimMagicNonce(payload.nonce);
    if (!claimed || claimed !== payload.draft_id) redirect('/access');
    draftId = claimed;
    const sid = await createSession({
      draftId,
      ttlSeconds: cfg.review.link_ttl_hours * 3600,
    });
    store.set({
      name: SESSION_COOKIE,
      value: sid,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: cfg.review.link_ttl_hours * 3600,
    });
    needSetCookie = true;
  } else {
    const sid = store.get(SESSION_COOKIE)?.value;
    if (!sid) redirect('/access');
    const binding = await readSession(sid);
    if (!binding) redirect('/access');
    draftId = binding.draftId;
  }

  if (!draftId || draftId === '*') redirect('/access');
  const draft = await getDraft(draftId);
  if (!draft) redirect('/access');

  return (
    <ReviewClient
      initialDraft={draft}
      stale={isStale(draft, cfg.review.stale_after_hours)}
      _justSetCookie={needSetCookie}
    />
  );
}
