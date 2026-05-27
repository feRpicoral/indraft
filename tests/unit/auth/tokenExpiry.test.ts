import { describe, it, expect } from 'vitest';
import { daysToExpiry, isExpired, shouldWarnReauth, REAUTH_WARNING_DAYS } from '@/lib/auth/tokenExpiry';
import { ONE_DAY_MS } from '@/lib/util/time';

const SECONDS_PER_DAY = 86400;
// Pinned "now" so makeToken and the expiry helpers read the same clock.
// Without this the test is flaky at day boundaries — the microsecond gap
// between Date.now() in makeToken and Date.now() inside daysToExpiry is
// enough for Math.floor(-ε / day) to flip 0 → -1.
const NOW = 1_700_000_000_000;

function makeToken(issuedDaysAgo: number, lifetimeDays = 60) {
  return {
    access_token: 'x',
    issued_at: NOW - issuedDaysAgo * ONE_DAY_MS,
    expires_in: lifetimeDays * SECONDS_PER_DAY,
    sub: 'abc',
    person_urn: 'urn:li:person:abc',
  };
}

describe('daysToExpiry', () => {
  it('returns 60 immediately after issue', () => {
    const token = makeToken(0);

    expect(daysToExpiry(token, NOW)).toBe(60);
  });

  it('returns 53 after a week', () => {
    const token = makeToken(7);

    expect(daysToExpiry(token, NOW)).toBe(53);
  });

  it('returns 0 at the boundary', () => {
    const token = makeToken(60);

    expect(daysToExpiry(token, NOW)).toBe(0);
  });

  it('returns a negative number after expiry', () => {
    const token = makeToken(61);

    expect(daysToExpiry(token, NOW)).toBeLessThan(0);
  });
});

describe('isExpired', () => {
  it('false when in the future', () => {
    const token = makeToken(0);

    expect(isExpired(token, NOW)).toBe(false);
  });

  it('true at and past the boundary', () => {
    const atBoundary = makeToken(60);
    const past = makeToken(61);

    expect(isExpired(atBoundary, NOW)).toBe(true);
    expect(isExpired(past, NOW)).toBe(true);
  });
});

describe('shouldWarnReauth', () => {
  it('false when many days remain', () => {
    const token = makeToken(0);

    expect(shouldWarnReauth(token, NOW)).toBe(false);
  });

  it(`true within the ${REAUTH_WARNING_DAYS}-day warning window`, () => {
    const token = makeToken(54);

    expect(shouldWarnReauth(token, NOW)).toBe(true);
  });

  it('false when already expired (a separate template handles that)', () => {
    const token = makeToken(60);

    expect(shouldWarnReauth(token, NOW)).toBe(false);
  });
});
