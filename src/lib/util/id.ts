import { nanoid } from 'nanoid';

/** Short, URL-safe ID for drafts and other persistent records. */
export function newId(prefix?: string): string {
  const id = nanoid(16);
  return prefix ? `${prefix}_${id}` : id;
}

/** Cryptographically random nonce for magic links. */
export function newNonce(): string {
  return nanoid(32);
}
