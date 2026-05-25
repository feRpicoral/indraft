import type { SourceItem } from '../types';

/**
 * Canonicalize a URL for dedup: lowercase host, strip default ports, strip
 * tracking params (utm_*, fbclid, gclid, …), drop trailing slash. Do NOT
 * change the scheme or path beyond that.
 */
export function canonicalUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw.trim();
  }
  u.hostname = u.hostname.toLowerCase();
  if (
    (u.protocol === 'http:' && u.port === '80') ||
    (u.protocol === 'https:' && u.port === '443')
  ) {
    u.port = '';
  }
  const drop = new Set<string>();
  for (const key of u.searchParams.keys()) {
    if (key.startsWith('utm_') || key === 'fbclid' || key === 'gclid' || key === 'ref') {
      drop.add(key);
    }
  }
  for (const k of drop) u.searchParams.delete(k);
  let s = u.toString();
  // Drop trailing slash from bare-path URLs (but keep `/` if it's the whole path).
  if (s.endsWith('/') && u.pathname !== '/') s = s.slice(0, -1);
  return s;
}

export function dedup(items: SourceItem[]): SourceItem[] {
  const seen = new Set<string>();
  const out: SourceItem[] = [];
  for (const it of items) {
    const key = canonicalUrl(it.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...it, url: key });
  }
  return out;
}
