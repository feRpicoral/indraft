import { describe, it, expect } from 'vitest';
import { signMagicLink, verifyMagicLink } from '@/lib/review/magicLink';

const SECRET = 'a'.repeat(40);

describe('signMagicLink / verifyMagicLink', () => {
  it('round-trips a valid payload', () => {
    const exp = Date.now() + 60 * 1000;
    const token = signMagicLink({
      payload: { draft_id: 'd1', nonce: 'n1', exp },
      secret: SECRET,
    });
    const r = verifyMagicLink({ token, secret: SECRET });
    expect(r?.draft_id).toBe('d1');
    expect(r?.nonce).toBe('n1');
    expect(r?.exp).toBe(exp);
  });

  it('rejects an expired token', () => {
    const token = signMagicLink({
      payload: { draft_id: 'd1', nonce: 'n1', exp: Date.now() - 1 },
      secret: SECRET,
    });
    expect(verifyMagicLink({ token, secret: SECRET })).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = signMagicLink({
      payload: { draft_id: 'd1', nonce: 'n1', exp: Date.now() + 60_000 },
      secret: SECRET,
    });
    const parts = token.split('.');
    const tampered = `${parts[0]?.slice(0, -1)}X.${parts[1]}`;
    expect(verifyMagicLink({ token: tampered, secret: SECRET })).toBeNull();
  });

  it('rejects a token signed by a different secret', () => {
    const token = signMagicLink({
      payload: { draft_id: 'd1', nonce: 'n1', exp: Date.now() + 60_000 },
      secret: SECRET,
    });
    expect(verifyMagicLink({ token, secret: 'different-secret-of-equal-length-aaa' })).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifyMagicLink({ token: 'no-dot', secret: SECRET })).toBeNull();
    expect(verifyMagicLink({ token: '', secret: SECRET })).toBeNull();
    expect(verifyMagicLink({ token: 'a.b.c', secret: SECRET })).toBeNull();
  });
});
