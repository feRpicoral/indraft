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

const rss2Entities = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example</title>
    <item>
      <title type="html"><![CDATA[Ford&#8217;s $30,000 truck &amp; more]]></title>
      <link>https://example.com/1</link>
      <description><![CDATA[<p>It&#8217;s here &#x2014; really</p>]]></description>
    </item>
  </channel>
</rss>`;

const atomEntities = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example</title>
  <entry>
    <title type="html"><![CDATA[LG&#8217;s glossy OLED]]></title>
    <link href="https://example.com/a1" rel="alternate"/>
    <summary><![CDATA[Rare &amp; cheap]]></summary>
  </entry>
</feed>`;

describe('parseFeed HTML entity decoding', () => {
  it('decodes numeric and named entities in RSS titles and summaries', () => {
    const items = parseFeed(rss2Entities, 'example.com', 'dev');

    expect(items[0]?.title).toBe('Ford’s $30,000 truck & more');
    expect(items[0]?.summary).toBe('It’s here — really');
  });

  it('decodes entities in Atom titles and summaries', () => {
    const items = parseFeed(atomEntities, 'example.com', 'dev');

    expect(items[0]?.title).toBe('LG’s glossy OLED');
    expect(items[0]?.summary).toBe('Rare & cheap');
  });
});

describe('parseFeed (unknown)', () => {
  it('returns [] on garbage input', () => {
    const items = parseFeed('<not>a feed</not>', 's', 'dev');

    expect(items).toEqual([]);
  });
});

function rss2Item(inner: string): string {
  return `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Example</title><item>
  <title>Post</title><link>https://example.com/post</link>${inner}
</item></channel></rss>`;
}

describe('parseFeed image extraction', () => {
  it('reads media:content', () => {
    const items = parseFeed(
      rss2Item('<media:content url="https://cdn.example.com/a.jpg" medium="image"/>'),
      'example.com',
      'dev',
    );

    expect(items[0]?.image_url).toBe('https://cdn.example.com/a.jpg');
  });

  it('reads media:thumbnail when media:content is absent', () => {
    const items = parseFeed(
      rss2Item('<media:thumbnail url="https://cdn.example.com/t.jpg" type="image/jpeg"/>'),
      'example.com',
      'dev',
    );

    expect(items[0]?.image_url).toBe('https://cdn.example.com/t.jpg');
  });

  it('reads an image enclosure', () => {
    const items = parseFeed(
      rss2Item('<enclosure url="https://cdn.example.com/e.jpg" type="image/jpeg"/>'),
      'example.com',
      'dev',
    );

    expect(items[0]?.image_url).toBe('https://cdn.example.com/e.jpg');
  });

  it('ignores non-image enclosures', () => {
    const items = parseFeed(
      rss2Item('<enclosure url="https://cdn.example.com/ep.mp3" type="audio/mpeg"/>'),
      'example.com',
      'dev',
    );

    expect(items[0]?.image_url).toBeUndefined();
  });

  it('ignores untyped enclosures whose url is not an image', () => {
    const items = parseFeed(
      rss2Item('<enclosure url="https://example.com/listen"/>'),
      'example.com',
      'dev',
    );

    expect(items[0]?.image_url).toBeUndefined();
  });

  it('falls back to the first inline img and resolves it against the entry link', () => {
    const items = parseFeed(
      rss2Item('<description><![CDATA[<p>hi</p><img src="/img/hero.jpg"/>]]></description>'),
      'example.com',
      'dev',
    );

    expect(items[0]?.image_url).toBe('https://example.com/img/hero.jpg');
  });

  it('prefers a media declaration over an inline img', () => {
    const items = parseFeed(
      rss2Item(
        '<media:content url="https://cdn.example.com/a.jpg" medium="image"/>' +
          '<description><![CDATA[<img src="https://cdn.example.com/inline.jpg"/>]]></description>',
      ),
      'example.com',
      'dev',
    );

    expect(items[0]?.image_url).toBe('https://cdn.example.com/a.jpg');
  });

  it('leaves image_url unset when the entry carries no image', () => {
    const items = parseFeed(rss2Item('<description>plain text</description>'), 'example.com', 'dev');

    expect(items[0]?.image_url).toBeUndefined();
  });

  it('scans Atom content when the summary carries no img', () => {
    const atomWithContent = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><entry>
  <title>Entry</title>
  <link href="https://example.com/a1" rel="alternate"/>
  <summary>Plain text summary, no markup</summary>
  <content type="html"><![CDATA[<p>body</p><img src="https://cdn.example.com/atom.jpg"/>]]></content>
</entry></feed>`;

    const items = parseFeed(atomWithContent, 'example.com', 'dev');

    expect(items[0]?.image_url).toBe('https://cdn.example.com/atom.jpg');
    expect(items[0]?.summary).toBe('Plain text summary, no markup');
  });

  it('reads an Atom enclosure link', () => {
    const atomEnclosure = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><entry>
  <title>Entry</title>
  <link href="https://example.com/a1" rel="alternate"/>
  <link href="https://cdn.example.com/enc.jpg" rel="enclosure" type="image/jpeg"/>
  <summary>Summary</summary>
</entry></feed>`;

    const items = parseFeed(atomEnclosure, 'example.com', 'dev');

    expect(items[0]?.image_url).toBe('https://cdn.example.com/enc.jpg');
  });
});
