import { NextResponse } from 'next/server';
import { listPending } from '@/lib/state/drafts';
import { issueMagicNonce } from '@/lib/state/tokens';
import { signMagicLink } from '@/lib/review/magicLink';
import { newNonce } from '@/lib/util/id';
import { loadConfig, loadEnv } from '@/lib/config/loader';
import { buildNotifier } from '@/lib/notify';
import { getKv } from '@/lib/state/kv';
import { k } from '@/lib/state/keys';
import { log } from '@/lib/util/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Public endpoint: emails fresh magic links for all currently-pending drafts
 * to the configured NOTIFY_TO_ADDRESS. The address is environment-pinned, so
 * an attacker can only spam the owner — but they could still burn email
 * quota and churn out valid magic links. A global single-slot lock with TTL
 * limits this to at most one batch per RATE_LIMIT_WINDOW_SEC.
 *
 * The lock is global (not per-IP) on purpose: the email recipient is the
 * same regardless of caller, so a global cap bounds the damage even if the
 * attacker rotates IPs. Set-NX-EX is atomic on Redis; the local in-memory
 * adapter honors NX too.
 */
const RATE_LIMIT_WINDOW_SEC = 60;

export async function POST() {
  try {
    const lock = await getKv().set(k.accessRequestLock(), Date.now(), {
      nx: true,
      ex: RATE_LIMIT_WINDOW_SEC,
    });
    if (lock === null) {
      log.warn('/access/request throttled');
      return NextResponse.json(
        { ok: false, error: 'rate limited; try again in a minute' },
        { status: 429, headers: { 'Retry-After': String(RATE_LIMIT_WINDOW_SEC) } },
      );
    }
    const env = loadEnv();
    const cfg = loadConfig();
    const pending = await listPending();
    const ttlSec = cfg.review.link_ttl_hours * 3600;
    const rows = await Promise.all(
      pending.map(async (d) => {
        const nonce = newNonce();
        await issueMagicNonce({ nonce, draft_id: d.id, ttlSeconds: ttlSec });
        const token = signMagicLink({
          payload: { draft_id: d.id, nonce, exp: Date.now() + ttlSec * 1000 },
          secret: env.MAGIC_LINK_SIGNING_SECRET,
        });
        const url = `${env.APP_URL ?? ''}/api/review/consume?token=${token}`;
        const preview = d.body.slice(0, 100).replace(/\n/g, ' ').trim() + '…';
        return { draft_id: d.id, url, preview };
      }),
    );
    const notifier = buildNotifier();
    await notifier.accessLinks(rows);
    return NextResponse.json({ ok: true, sent: rows.length });
  } catch (err) {
    log.error('/access/request failed', { err: String(err) });
    return NextResponse.json({ ok: false, error: 'request failed' }, { status: 500 });
  }
}
