import { NextResponse } from 'next/server';
import { verifyMagicLink } from '@/lib/review/magicLink';
import { claimMagicNonce } from '@/lib/state/tokens';
import { createSession, sessionCookie } from '@/lib/review/session';
import { loadConfig, loadEnv } from '@/lib/config/loader';
import { log } from '@/lib/util/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Magic-link landing endpoint. Verifies the signed token, claims the single-use
 * nonce, mints a session, sets the cookie, and 302s to /review.
 *
 * Lives in a Route Handler (not the page) because Next 16 forbids cookie
 * writes from Server Components.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) return NextResponse.redirect(new URL('/access', url.origin));

  const env = loadEnv();
  const cfg = loadConfig();
  const payload = verifyMagicLink({ token, secret: env.MAGIC_LINK_SIGNING_SECRET });
  if (!payload) {
    log.warn('magic link: bad signature or expired');
    return NextResponse.redirect(new URL('/access', url.origin));
  }
  const claimed = await claimMagicNonce(payload.nonce);
  if (!claimed || claimed !== payload.draft_id) {
    log.warn('magic link: nonce already consumed or mismatched');
    return NextResponse.redirect(new URL('/access', url.origin));
  }

  const ttl = cfg.review.link_ttl_hours * 3600;
  const sid = await createSession({ draftId: claimed, ttlSeconds: ttl });

  const res = NextResponse.redirect(new URL('/review', url.origin));
  res.headers.append('Set-Cookie', sessionCookie(sid, ttl));
  return res;
}
