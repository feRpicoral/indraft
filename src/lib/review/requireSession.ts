import { cookies } from 'next/headers';
import { SESSION_COOKIE, readSession, type SessionBinding } from './session';

/**
 * Read the session cookie from the current request and resolve its binding.
 * Returns null when there is no session, or when the cookie points to an
 * expired/missing KV record.
 */
export async function getCurrentSession(): Promise<SessionBinding | null> {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  return readSession(sid);
}

/**
 * Resolve the session and check it binds to `draftId` (or "*" for global).
 * Throws a 403-shaped Response on mismatch — call sites should let it bubble.
 */
export async function requireDraftSession(draftId: string): Promise<SessionBinding> {
  const s = await getCurrentSession();
  if (!s) throw new SessionError('no session', 401);
  if (s.draftId !== draftId && s.draftId !== '*') {
    throw new SessionError('session does not match draft', 403);
  }
  return s;
}

export class SessionError extends Error {
  override name = 'SessionError';
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
