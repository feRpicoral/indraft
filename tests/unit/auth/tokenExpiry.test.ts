import { describe, it, expect } from 'vitest';
import { daysToExpiry, isExpired, shouldWarnReauth, REAUTH_WARNING_DAYS } from '@/lib/auth/tokenExpiry';
import { ONE_DAY_MS } from '@/lib/util/time';

const SECONDS_PER_DAY = 86400;

function makeToken(issuedDaysAgo: number, lifetimeDays = 60) {
  return {
    access_token: 'x',
    issued_at: Date.now() - issuedDaysAgo * ONE_DAY_MS,
    expires_in: lifetimeDays * SECONDS_PER_DAY,
    sub: 'abc',
    person_urn: 'urn:li:person:abc',
  };
}

describe('daysToExpiry', () => {
  it('returns 60 immediately after issue', () => {
    expect(daysToExpiry(makeToken(0))).toBe(60);
  });
  it('returns 53 after a week', () => {
    expect(daysToExpiry(makeToken(7))).toBe(53);
  });
  it('returns 0 at the boundary', () => {
    expect(daysToExpiry(makeToken(60))).toBe(0);
  });
  it('returns a negative number after expiry', () => {
    expect(daysToExpiry(makeToken(61))).toBeLessThan(0);
  });
});

describe('isExpired', () => {
  it('false when in the future', () => {
    expect(isExpired(makeToken(0))).toBe(false);
  });
  it('true at and past the boundary', () => {
    expect(isExpired(makeToken(60))).toBe(true);
    expect(isExpired(makeToken(61))).toBe(true);
  });
});

describe('shouldWarnReauth', () => {
  it('false when many days remain', () => {
    expect(shouldWarnReauth(makeToken(0))).toBe(false);
  });
  it(`true within the ${REAUTH_WARNING_DAYS}-day warning window`, () => {
    expect(shouldWarnReauth(makeToken(54))).toBe(true);
  });
  it('false when already expired (a separate template handles that)', () => {
    expect(shouldWarnReauth(makeToken(60))).toBe(false);
  });
});
