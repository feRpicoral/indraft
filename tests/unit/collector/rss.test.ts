import { describe, it, expect } from 'vitest';
import { parseFeed } from '@/lib/collector/rss';

const rss2 = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example</title>
    <item>
      <title>First post</title>
      <link>https://example.com/1</link>
      <pubDate>Mon, 25 May 2026 12:00:00 GMT</pubDate>
      <description><![CDATA[<p>Hello <em>world</em></p>]]></description>
    </item>
    <item>
      <title>Second post</title>
      <link>https://example.com/2</link>
      <pubDate>Sun, 24 May 2026 12:00:00 GMT</pubDate>
      <description>No HTML here</description>
    </item>
  </channel>
</rss>`;

const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example</title>
  <entry>
    <title>Atom entry one</title>
    <link href="https://example.com/a1" rel="alternate"/>
    <updated>2026-05-25T12:00:00Z</updated>
    <summary>Summary one</summary>
  </entry>
</feed>`;

describe('parseFeed (RSS 2.0)', () => {
  it('extracts items with normalized fields', () => {
    const items = parseFeed(rss2, 'example.com', 'dev');

    expect(items).toHaveLength(2);
    expect(items[0]?.title).toBe('First post');
    expect(items[0]?.url).toBe('https://example.com/1');
    expect(items[0]?.summary).toBe('Hello world');
    expect(items[0]?.category).toBe('dev');
    expect(items[0]?.published_at).toBeGreaterThan(0);
  });
});

describe('parseFeed (Atom)', () => {
  it('extracts entries with normalized fields', () => {
    const items = parseFeed(atom, 'example.com', 'ai_research');

    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('Atom entry one');
    expect(items[0]?.url).toBe('https://example.com/a1');
    expect(items[0]?.summary).toBe('Summary one');
    expect(items[0]?.category).toBe('ai_research');
  });
});

describe('parseFeed (unknown)', () => {
  it('returns [] on garbage input', () => {
    const items = parseFeed('<not>a feed</not>', 's', 'dev');

    expect(items).toEqual([]);
  });
});
