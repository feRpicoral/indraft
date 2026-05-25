import { ONE_DAY_MS } from '../util/time';
import type { LinkedInToken } from '../state/tokens';

/** Days until expiry. Floors toward zero; returns negative when expired. */
export function daysToExpiry(token: LinkedInToken, now = Date.now()): number {
  const expiresAtMs = token.issued_at + token.expires_in * 1000;
  return Math.floor((expiresAtMs - now) / ONE_DAY_MS);
}

/** Whether the token is currently usable. */
export function isExpired(token: LinkedInToken, now = Date.now()): boolean {
  return token.issued_at + token.expires_in * 1000 <= now;
}

export const REAUTH_WARNING_DAYS = 7;

/** True when we should email the reauth prompt this run. */
export function shouldWarnReauth(token: LinkedInToken, now = Date.now()): boolean {
  const days = daysToExpiry(token, now);
  return days <= REAUTH_WARNING_DAYS && !isExpired(token, now);
}
