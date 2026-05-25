import { describe, it, expect } from 'vitest';
import { canonicalUrl, dedup } from '@/lib/collector/dedup';
import type { SourceItem } from '@/lib/types';

describe('canonicalUrl', () => {
  it('lowercases host', () => {
    expect(canonicalUrl('https://Example.COM/path')).toBe('https://example.com/path');
  });
  it('strips utm tracking', () => {
    expect(
      canonicalUrl('https://example.com/x?utm_source=twitter&utm_campaign=launch&id=42'),
    ).toBe('https://example.com/x?id=42');
  });
  it('strips fbclid and gclid', () => {
    expect(canonicalUrl('https://example.com/x?fbclid=abc&gclid=def&id=1')).toBe(
      'https://example.com/x?id=1',
    );
  });
  it('strips default ports', () => {
    expect(canonicalUrl('https://example.com:443/x')).toBe('https://example.com/x');
    expect(canonicalUrl('http://example.com:80/x')).toBe('http://example.com/x');
  });
  it('drops trailing slash from non-root paths', () => {
    expect(canonicalUrl('https://example.com/foo/')).toBe('https://example.com/foo');
    expect(canonicalUrl('https://example.com/')).toBe('https://example.com/');
  });
  it('returns input unchanged when not parseable', () => {
    expect(canonicalUrl('not a url')).toBe('not a url');
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
