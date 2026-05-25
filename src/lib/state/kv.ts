/**
 * KV adapter. Wraps @vercel/kv for production and falls back to an in-memory
 * implementation for local dev + tests. The interface is intentionally narrow:
 * just the operations the state layer actually needs.
 *
 * We don't use @vercel/kv's full API directly so that the test backend can
 * be a tiny pure-JS shim with no Redis semantics to maintain.
 */

import { kv as vercelKv } from '@vercel/kv';

export interface KvAdapter {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number; nx?: boolean }): Promise<'OK' | null>;
  del(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;

  // Sets (for status indexes)
  sadd(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, ...members: string[]): Promise<number>;

  // Sorted sets (for pending-drafts queue)
  zadd(key: string, ...entries: Array<{ score: number; member: string }>): Promise<number>;
  zrange(
    key: string,
    start: number,
    stop: number,
    opts?: { rev?: boolean },
  ): Promise<string[]>;
  zrem(key: string, ...members: string[]): Promise<number>;

  // Lists (for capped history)
  lpush(key: string, ...members: string[]): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  ltrim(key: string, start: number, stop: number): Promise<'OK'>;
}

/** In-memory KV. Used in tests and local dev when KV_REST_API_URL is missing. */
class MemoryKv implements KvAdapter {
  private store = new Map<string, unknown>();
  private expiries = new Map<string, number>();
  private sets = new Map<string, Set<string>>();
  private zsets = new Map<string, Map<string, number>>();
  private lists = new Map<string, string[]>();

  private check(key: string): void {
    const exp = this.expiries.get(key);
    if (exp != null && exp < Date.now()) {
      this.store.delete(key);
      this.sets.delete(key);
      this.zsets.delete(key);
      this.lists.delete(key);
      this.expiries.delete(key);
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    this.check(key);
    const v = this.store.get(key);
    return (v as T | undefined) ?? null;
  }

  async set(
    key: string,
    value: unknown,
    opts?: { ex?: number; nx?: boolean },
  ): Promise<'OK' | null> {
    this.check(key);
    if (opts?.nx && this.store.has(key)) return null;
    this.store.set(key, value);
    if (opts?.ex) this.expiries.set(key, Date.now() + opts.ex * 1000);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const hadStore = this.store.delete(key);
    const hadSet = this.sets.delete(key);
    const hadZ = this.zsets.delete(key);
    const hadList = this.lists.delete(key);
    this.expiries.delete(key);
    return [hadStore, hadSet, hadZ, hadList].filter(Boolean).length > 0 ? 1 : 0;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.check(key);
    if (
      !this.store.has(key) &&
      !this.sets.has(key) &&
      !this.zsets.has(key) &&
      !this.lists.has(key)
    )
      return 0;
    this.expiries.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    this.check(key);
    let s = this.sets.get(key);
    if (!s) {
      s = new Set();
      this.sets.set(key, s);
    }
    let added = 0;
    for (const m of members) {
      if (!s.has(m)) {
        s.add(m);
        added++;
      }
    }
    return added;
  }
  async smembers(key: string): Promise<string[]> {
    this.check(key);
    return Array.from(this.sets.get(key) ?? []);
  }
  async srem(key: string, ...members: string[]): Promise<number> {
    this.check(key);
    const s = this.sets.get(key);
    if (!s) return 0;
    let removed = 0;
    for (const m of members) {
      if (s.delete(m)) removed++;
    }
    return removed;
  }

  async zadd(
    key: string,
    ...entries: Array<{ score: number; member: string }>
  ): Promise<number> {
    this.check(key);
    let z = this.zsets.get(key);
    if (!z) {
      z = new Map();
      this.zsets.set(key, z);
    }
    let added = 0;
    for (const e of entries) {
      if (!z.has(e.member)) added++;
      z.set(e.member, e.score);
    }
    return added;
  }
  async zrange(
    key: string,
    start: number,
    stop: number,
    opts?: { rev?: boolean },
  ): Promise<string[]> {
    this.check(key);
    const z = this.zsets.get(key);
    if (!z) return [];
    const sorted = Array.from(z.entries()).sort((a, b) => a[1] - b[1]);
    const ordered = opts?.rev ? sorted.reverse() : sorted;
    // Redis ZRANGE: stop is INCLUSIVE; negative indices wrap.
    const len = ordered.length;
    const s = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
    const e = stop < 0 ? len + stop : Math.min(stop, len - 1);
    return ordered.slice(s, e + 1).map(([m]) => m);
  }
  async zrem(key: string, ...members: string[]): Promise<number> {
    this.check(key);
    const z = this.zsets.get(key);
    if (!z) return 0;
    let removed = 0;
    for (const m of members) {
      if (z.delete(m)) removed++;
    }
    return removed;
  }

  async lpush(key: string, ...members: string[]): Promise<number> {
    this.check(key);
    let l = this.lists.get(key);
    if (!l) {
      l = [];
      this.lists.set(key, l);
    }
    // Redis LPUSH inserts in reverse order from the args
    for (const m of members) l.unshift(m);
    return l.length;
  }
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    this.check(key);
    const l = this.lists.get(key);
    if (!l) return [];
    const len = l.length;
    const s = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
    const e = stop < 0 ? len + stop : Math.min(stop, len - 1);
    return l.slice(s, e + 1);
  }
  async ltrim(key: string, start: number, stop: number): Promise<'OK'> {
    this.check(key);
    const l = this.lists.get(key);
    if (!l) return 'OK';
    const len = l.length;
    const s = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
    const e = stop < 0 ? len + stop : Math.min(stop, len - 1);
    this.lists.set(key, l.slice(s, e + 1));
    return 'OK';
  }

  /** Test-only: wipe everything. */
  __reset(): void {
    this.store.clear();
    this.expiries.clear();
    this.sets.clear();
    this.zsets.clear();
    this.lists.clear();
  }
}

const memoryBackend = new MemoryKv();

/**
 * Choose backend based on env. Real @vercel/kv when credentials are present;
 * in-memory otherwise. Override with INDRAFT_FORCE_MEMORY_KV=1 for tests.
 */
function selectBackend(): KvAdapter {
  if (process.env.INDRAFT_FORCE_MEMORY_KV === '1') return memoryBackend;
  if (!process.env.KV_REST_API_URL) return memoryBackend;
  // The @vercel/kv client is API-compatible with the subset we use.
  return vercelKv as unknown as KvAdapter;
}

let _kv: KvAdapter | null = null;
export function getKv(): KvAdapter {
  if (!_kv) _kv = selectBackend();
  return _kv;
}

/** Test helper: re-select backend (e.g. after stubEnv) and wipe memory store. */
export function __resetKvForTest(): void {
  memoryBackend.__reset();
  _kv = null;
}
