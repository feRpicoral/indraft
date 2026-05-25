import { createHash } from 'node:crypto';
import type { Draft } from '../types';

export { signMagicLink, verifyMagicLink } from './magicLink';
export {
  SESSION_COOKIE,
  createSession,
  readSession,
  destroySession,
  sessionCookie,
  clearSessionCookie,
} from './session';
export { buildEditPatch } from './conversation';
export { isStale, hoursSinceUpdate } from './staleness';

/**
 * The challenge we sign during WebAuthn assertion. Binds the assertion to
 * BOTH the current draft id+version AND its body, so replaying a captured
 * assertion against a different version (or against an edited body that
 * happens to share the version number) is rejected.
 */
export function challengeFor(draft: Pick<Draft, 'id' | 'version' | 'body'>): string {
  return createHash('sha256')
    .update(draft.id)
    .update('|')
    .update(String(draft.version))
    .update('|')
    .update(draft.body)
    .digest('hex');
}
