import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadKv() {
  return await import('@/lib/state/kv');
}

describe('selectBackend production guard', () => {
  it('throws when VERCEL_ENV=production and Upstash creds are missing', async () => {
    vi.stubEnv('INDRAFT_FORCE_MEMORY_KV', '');
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'production');
    const { getKv, KvNotConfiguredError } = await loadKv();
    expect(() => getKv()).toThrow(KvNotConfiguredError);
  });

  it('throws when NODE_ENV=production with no Vercel signal and no creds', async () => {
    vi.stubEnv('INDRAFT_FORCE_MEMORY_KV', '');
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NODE_ENV', 'production');
    const { getKv, KvNotConfiguredError } = await loadKv();
    expect(() => getKv()).toThrow(KvNotConfiguredError);
  });

  it('falls back to memory in preview deploys (VERCEL_ENV=preview, no creds)', async () => {
    vi.stubEnv('INDRAFT_FORCE_MEMORY_KV', '');
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('NODE_ENV', 'production'); // Next sets this in `next build`
    const { getKv } = await loadKv();
    expect(() => getKv()).not.toThrow();
  });

  it('honors INDRAFT_FORCE_MEMORY_KV=1 even when prod signals are present', async () => {
    vi.stubEnv('INDRAFT_FORCE_MEMORY_KV', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'production');
    const { getKv } = await loadKv();
    expect(() => getKv()).not.toThrow();
  });

  it('falls back to memory in development with no creds', async () => {
    vi.stubEnv('INDRAFT_FORCE_MEMORY_KV', '');
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NODE_ENV', 'development');
    const { getKv } = await loadKv();
    expect(() => getKv()).not.toThrow();
  });
});
