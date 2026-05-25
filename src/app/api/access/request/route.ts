import { NextResponse } from 'next/server';
import { listPending } from '@/lib/state/drafts';
import { issueMagicNonce } from '@/lib/state/tokens';
import { signMagicLink } from '@/lib/review/magicLink';
import { newNonce } from '@/lib/util/id';
import { loadConfig, loadEnv } from '@/lib/config/loader';
import { buildNotifier } from '@/lib/notify';
import { log } from '@/lib/util/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Public, safe endpoint: emails fresh magic links for all currently-pending
 * drafts to the configured NOTIFY_TO_ADDRESS. There is no way to redirect
 * the email elsewhere — the address is environment-pinned. So even if this
 * endpoint is hammered, it only spams the owner, never anyone else.
 */
export async function POST() {
  try {
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
        const url = `${env.APP_URL ?? ''}/review?token=${token}`;
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
