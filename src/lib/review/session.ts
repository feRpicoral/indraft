import { newId } from '../util/id';
import { getKv } from '../state/kv';
import { k } from '../state/keys';

export const SESSION_COOKIE = 'indraft_session';

export interface SessionBinding {
  /** Draft this session can edit, or "*" for enrollment / global access. */
  draftId: string;
}

export async function createSession(args: {
  draftId: string;
  ttlSeconds: number;
}): Promise<string> {
  const sid = newId('sess');
  await getKv().set(k.session(sid), args.draftId, { ex: args.ttlSeconds });
  return sid;
}

export async function readSession(sid: string): Promise<SessionBinding | null> {
  const draftId = await getKv().get<string>(k.session(sid));
  if (!draftId) return null;
  return { draftId };
}

export async function destroySession(sid: string): Promise<void> {
  await getKv().del(k.session(sid));
}

/** Render the cookie value as a Set-Cookie string (HttpOnly, Secure, SameSite=Lax). */
export function sessionCookie(value: string, maxAgeSeconds: number): string {
  const attrs = [
    `${SESSION_COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  return attrs.join('; ');
}

/** Cookie that expires immediately, used to log out. */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
