import { getKv } from './kv';
import { k } from './keys';

export interface LinkedInToken {
  access_token: string;
  /** Epoch ms when the token was issued. */
  issued_at: number;
  /** Seconds until expiry, as returned by the OAuth response. */
  expires_in: number;
  /** OIDC `sub` claim from /v2/userinfo. */
  sub: string;
  /** Resolved person URN: `urn:li:person:{sub}`. */
  person_urn: string;
}

export async function getLinkedInToken(): Promise<LinkedInToken | null> {
  return getKv().get<LinkedInToken>(k.linkedinToken());
}

export async function setLinkedInToken(t: LinkedInToken): Promise<void> {
  await getKv().set(k.linkedinToken(), t);
}

export async function clearLinkedInToken(): Promise<void> {
  await getKv().del(k.linkedinToken());
}

/**
 * Magic-link nonce: single-use, TTL-bound. `claim` returns the bound draft_id
 * and atomically deletes the nonce so a leaked link can't be reused.
 */
export async function issueMagicNonce(args: {
  nonce: string;
  draft_id: string;
  ttlSeconds: number;
}): Promise<void> {
  await getKv().set(k.magicNonce(args.nonce), args.draft_id, { ex: args.ttlSeconds });
}

export async function claimMagicNonce(nonce: string): Promise<string | null> {
  const kv = getKv();
  const id = await kv.get<string>(k.magicNonce(nonce));
  if (!id) return null;
  await kv.del(k.magicNonce(nonce));
  return id;
}

export async function getLinkedInReauthNotifiedAt(): Promise<number | null> {
  return getKv().get<number>(k.linkedinReauthNotifiedAt());
}

export async function setLinkedInReauthNotifiedAt(ts: number): Promise<void> {
  await getKv().set(k.linkedinReauthNotifiedAt(), ts);
}
