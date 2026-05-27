import { getKv } from './kv';
import { k } from './keys';

export interface StoredCredential {
  /** Credential ID (base64url). */
  id: string;
  /** Public key in CBOR format, base64url-encoded. */
  publicKey: string;
  /** Signature counter — must monotonically increase on each assertion. */
  counter: number;
  transports?: string[];
  created_at: number;
}

export async function listCredentials(): Promise<StoredCredential[]> {
  return (await getKv().get<StoredCredential[]>(k.webauthnCredentials())) ?? [];
}

export async function addCredential(c: StoredCredential): Promise<void> {
  const existing = await listCredentials();
  const next = [...existing.filter((e) => e.id !== c.id), c];
  await getKv().set(k.webauthnCredentials(), next);
}

export async function updateCounter(credId: string, counter: number): Promise<void> {
  const existing = await listCredentials();
  const next = existing.map((e) => (e.id === credId ? { ...e, counter } : e));
  await getKv().set(k.webauthnCredentials(), next);
}

/** Short-lived challenge stored during the register/assert ceremony. */
export async function storeChallenge(sessionId: string, challenge: string): Promise<void> {
  await getKv().set(k.webauthnChallenge(sessionId), challenge, { ex: 300 });
}

export async function consumeChallenge(sessionId: string): Promise<string | null> {
  // Atomic read-and-delete: a captured challenge must not survive two concurrent
  // assert/verify attempts. See claimMagicNonce for the same rationale.
  return getKv().getdel<string>(k.webauthnChallenge(sessionId));
}
