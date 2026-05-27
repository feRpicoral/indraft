import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { __resetKvForTest, getKv } from '@/lib/state/kv';
import { claimMagicNonce, issueMagicNonce } from '@/lib/state/tokens';
import { consumeChallenge, storeChallenge } from '@/lib/state/webauthn';

beforeAll(() => {
  process.env.INDRAFT_FORCE_MEMORY_KV = '1';
});
beforeEach(() => {
  __resetKvForTest();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('KvAdapter.getdel', () => {
  it('returns the value and deletes the key', async () => {
    const kv = getKv();
    await kv.set('k', 'v');
    expect(await kv.getdel('k')).toBe('v');
    expect(await kv.get('k')).toBeNull();
  });

  it('returns null for a missing key', async () => {
    expect(await getKv().getdel('missing')).toBeNull();
  });

  it('treats concurrent getdel as single-use: exactly one caller observes the value', async () => {
    const kv = getKv();
    await kv.set('nonce', 'one-shot');
    const results = await Promise.all([
      kv.getdel<string>('nonce'),
      kv.getdel<string>('nonce'),
      kv.getdel<string>('nonce'),
    ]);
    const hits = results.filter((r) => r === 'one-shot');
    expect(hits).toHaveLength(1);
    expect(results.filter((r) => r === null)).toHaveLength(2);
  });

  it('respects TTL: an expired key getdel returns null', async () => {
    vi.useFakeTimers();
    try {
      const kv = getKv();
      await kv.set('k', 'v', { ex: 1 });
      vi.advanceTimersByTime(2000);
      expect(await kv.getdel('k')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('claimMagicNonce (atomic single-use)', () => {
  it('one of N concurrent claims wins, the rest see null', async () => {
    await issueMagicNonce({ nonce: 'n1', draft_id: 'd_xyz', ttlSeconds: 60 });
    const results = await Promise.all([
      claimMagicNonce('n1'),
      claimMagicNonce('n1'),
      claimMagicNonce('n1'),
      claimMagicNonce('n1'),
    ]);
    expect(results.filter((r) => r === 'd_xyz')).toHaveLength(1);
    expect(results.filter((r) => r === null)).toHaveLength(3);
  });

  it('a second sequential claim returns null', async () => {
    await issueMagicNonce({ nonce: 'n2', draft_id: 'd_2', ttlSeconds: 60 });
    expect(await claimMagicNonce('n2')).toBe('d_2');
    expect(await claimMagicNonce('n2')).toBeNull();
  });
});

describe('consumeChallenge (atomic single-use)', () => {
  it('one of N concurrent consumes wins, the rest see null', async () => {
    await storeChallenge('sess-a', 'chal-1');
    const results = await Promise.all([
      consumeChallenge('sess-a'),
      consumeChallenge('sess-a'),
      consumeChallenge('sess-a'),
    ]);
    expect(results.filter((r) => r === 'chal-1')).toHaveLength(1);
    expect(results.filter((r) => r === null)).toHaveLength(2);
  });
});
