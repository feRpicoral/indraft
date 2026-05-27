import { describe, it, expect } from 'vitest';
import { canonicalUrl, dedup } from '@/lib/collector/dedup';
import type { SourceItem } from '@/lib/types';

describe('canonicalUrl', () => {
  it('lowercases host', () => {
    const result = canonicalUrl('https://Example.COM/path');

    expect(result).toBe('https://example.com/path');
  });

  it('strips utm tracking', () => {
    const result = canonicalUrl(
      'https://example.com/x?utm_source=twitter&utm_campaign=launch&id=42',
    );

    expect(result).toBe('https://example.com/x?id=42');
  });

  it('strips fbclid and gclid', () => {
    const result = canonicalUrl('https://example.com/x?fbclid=abc&gclid=def&id=1');

    expect(result).toBe('https://example.com/x?id=1');
  });

  it('strips default ports', () => {
    const https = canonicalUrl('https://example.com:443/x');
    const http = canonicalUrl('http://example.com:80/x');

    expect(https).toBe('https://example.com/x');
    expect(http).toBe('http://example.com/x');
  });

  it('drops trailing slash from non-root paths', () => {
    const nested = canonicalUrl('https://example.com/foo/');
    const root = canonicalUrl('https://example.com/');

    expect(nested).toBe('https://example.com/foo');
    expect(root).toBe('https://example.com/');
  });

  it('returns input unchanged when not parseable', () => {
    const result = canonicalUrl('not a url');

    expect(result).toBe('not a url');
  });

  it('returns empty string for undefined / null / empty input (no throw)', () => {
    const undef = canonicalUrl(undefined);
    const nul = canonicalUrl(null);
    const empty = canonicalUrl('');

    expect(undef).toBe('');
    expect(nul).toBe('');
    expect(empty).toBe('');
  });
});

describe('dedup', () => {
  const mk = (url: string, ts = 0): SourceItem => ({
    title: url,
    url,
    summary: '',
    source: 's',
    published_at: ts,
    category: 'dev',
  });

  it('removes items with the same canonical URL', () => {
    const items = [
      mk('https://example.com/x'),
      mk('https://example.com/x?utm_source=twitter'),
      mk('https://example.com/x/'),
      mk('https://example.com/y'),
    ];

    const result = dedup(items);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.url).sort()).toEqual([
      'https://example.com/x',
      'https://example.com/y',
    ]);
  });

  it('keeps the first occurrence', () => {
    const items = [mk('https://example.com/x', 1), mk('https://example.com/x', 2)];

    const result = dedup(items);

    expect(result[0]?.published_at).toBe(1);
  });
});
