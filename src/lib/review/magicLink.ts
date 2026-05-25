import { createHmac, timingSafeEqual } from 'node:crypto';

const ALG = 'sha256';

interface MagicPayload {
  draft_id: string;
  nonce: string;
  exp: number; // epoch ms
}

/**
 * Sign a magic-link token. Format: `base64url(payload).base64url(hmac)`.
 * No external JWT lib — we control both ends, keep it minimal.
 */
export function signMagicLink(args: { payload: MagicPayload; secret: string }): string {
  const payloadB64 = b64url(Buffer.from(JSON.stringify(args.payload)));
  const sig = hmac(payloadB64, args.secret);
  return `${payloadB64}.${sig}`;
}

/**
 * Verify a magic-link token. Returns the parsed payload only when signature is
 * valid AND `exp` is in the future. Does NOT consume the nonce — that's
 * lib/state/tokens::claimMagicNonce's job.
 */
export function verifyMagicLink(args: {
  token: string;
  secret: string;
  now?: number;
}): MagicPayload | null {
  const parts = args.token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts as [string, string];
  const expected = hmac(payloadB64, args.secret);
  if (!constantTimeStringEqual(sig, expected)) return null;
  let payload: MagicPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || payload.exp < (args.now ?? Date.now())) return null;
  if (!payload.draft_id || !payload.nonce) return null;
  return payload;
}

function hmac(data: string, secret: string): string {
  return b64url(createHmac(ALG, secret).update(data).digest());
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function constantTimeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
