import { XMLParser } from 'fast-xml-parser';
import { fetchWithRetry } from '../util/http';
import { log } from '../util/logger';
import type { SourceCategory, SourceItem } from '../types';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

/**
 * Fetch and parse a feed. Returns [] on any error and logs a warning so a
 * single dead feed never sinks the run. Supports both RSS 2.0 and Atom shapes.
 */
export async function fetchFeed(url: string, category: SourceCategory): Promise<SourceItem[]> {
  let res: Response;
  try {
    res = await fetchWithRetry(url, {
      headers: { 'User-Agent': 'InDraft/1.0 (+https://github.com/feRpicoral/indraft)' },
      retries: 1,
      timeoutMs: 15_000,
    });
  } catch (err) {
    log.warn('feed fetch failed', { url, err: String(err) });
    return [];
  }
  if (!res.ok) {
    log.warn('feed non-ok', { url, status: res.status });
    return [];
  }
  const text = await res.text();
  try {
    return parseFeed(text, url, category);
  } catch (err) {
    log.warn('feed parse failed', { url, err: String(err) });
    return [];
  }
}

export function parseFeed(text: string, source: string, category: SourceCategory): SourceItem[] {
  const obj = parser.parse(text) as Record<string, unknown>;
  if ((obj.rss as { channel?: unknown } | undefined)?.channel) {
    return parseRss2(obj.rss as Rss2Root, source, category);
  }
  if (obj.feed) {
    return parseAtom(obj.feed as AtomRoot, source, category);
  }
  return [];
}

interface Rss2Root {
  channel: {
    title?: string;
    item?: Rss2Item | Rss2Item[];
  };
}
interface MediaNode {
  '@_url'?: string;
  '@_type'?: string;
  '@_medium'?: string;
}

interface Rss2Item {
  title?: string | { '#text'?: string };
  link?: string | { '#text'?: string; '@_href'?: string };
  description?: string;
  'content:encoded'?: string;
  pubDate?: string;
  guid?: string | { '#text'?: string };
  'media:content'?: MediaNode | MediaNode[];
  'media:thumbnail'?: MediaNode | MediaNode[];
  enclosure?: MediaNode | MediaNode[];
}

interface AtomRoot {
  title?: string;
  entry?: AtomEntry | AtomEntry[];
}
interface AtomEntry {
  title?: string | { '#text'?: string };
  link?: AtomLink | AtomLink[];
  summary?: string | { '#text'?: string };
  content?: string | { '#text'?: string };
  updated?: string;
  published?: string;
  id?: string;
  'media:content'?: MediaNode | MediaNode[];
  'media:thumbnail'?: MediaNode | MediaNode[];
}
interface AtomLink {
  '@_href'?: string;
  '@_rel'?: string;
  '@_type'?: string;
}

function parseRss2(root: Rss2Root, source: string, category: SourceCategory): SourceItem[] {
  const items = toArray(root.channel.item);
  return items
    .map((it): SourceItem | null => {
      const url =
        typeof it.link === 'string' ? it.link : (it.link?.['@_href'] ?? it.link?.['#text']);
      const rawTitle = typeof it.title === 'string' ? it.title : (it.title?.['#text'] ?? '');
      const title = decodeHtmlEntities(rawTitle);
      if (!url || !title) return null;
      const html = it['content:encoded'] ?? it.description ?? '';
      const summary = stripHtml(html);
      const published_at = parseDate(it.pubDate) ?? Date.now();
      const image_url = firstImageUrl(
        [it['media:content'], it['media:thumbnail'], it.enclosure],
        html,
        url,
      );
      return {
        title,
        url,
        summary,
        source,
        published_at,
        category,
        ...(image_url ? { image_url } : {}),
      };
    })
    .filter((x): x is SourceItem => x !== null);
}

function parseAtom(root: AtomRoot, source: string, category: SourceCategory): SourceItem[] {
  const entries = toArray(root.entry);
  return entries
    .map((e): SourceItem | null => {
      const links = toArray(e.link);
      const link =
        links.find((l) => l['@_rel'] === 'alternate' || !l['@_rel'])?.['@_href'] ??
        links[0]?.['@_href'];
      const rawTitle = typeof e.title === 'string' ? e.title : (e.title?.['#text'] ?? '');
      const title = decodeHtmlEntities(rawTitle);
      if (!link || !title) return null;
      const summaryRaw =
        typeof e.summary === 'string'
          ? e.summary
          : (e.summary?.['#text'] ??
            (typeof e.content === 'string' ? e.content : e.content?.['#text']) ??
            '');
      const summary = stripHtml(summaryRaw);
      const published_at = parseDate(e.published ?? e.updated) ?? Date.now();
      const enclosures: MediaNode[] = links
        .filter((l) => l['@_rel'] === 'enclosure' && l['@_href'])
        .map((l) => ({ '@_url': l['@_href'], '@_type': l['@_type'] }));
      // Scanned separately from summaryRaw: entries commonly carry a plain-text
      // <summary> alongside an HTML <content> that holds the only <img>, and
      // summaryRaw stops at the first of the two that exists.
      const contentHtml = typeof e.content === 'string' ? e.content : (e.content?.['#text'] ?? '');
      const image_url = firstImageUrl(
        [e['media:content'], e['media:thumbnail'], enclosures],
        `${summaryRaw}\n${contentHtml}`,
        link,
      );
      return {
        title,
        url: link,
        summary,
        source,
        published_at,
        category,
        ...(image_url ? { image_url } : {}),
      };
    })
    .filter((x): x is SourceItem => x !== null);
}

/**
 * Resolve the entry's image, preferring explicit media declarations over an
 * image scraped out of the summary HTML. Feeds disagree wildly on which tag
 * they use — media:content (Ars), enclosure (Crunchbase, VentureBeat), or
 * nothing but an inline <img> (The Verge) — so all of them are tried.
 */
function firstImageUrl(
  nodeGroups: Array<MediaNode | MediaNode[] | undefined>,
  html: string,
  base: string,
): string | undefined {
  for (const group of nodeGroups) {
    for (const node of toArray(group)) {
      const url = imageNodeUrl(node);
      if (url) return resolveUrl(url, base);
    }
  }
  const inline = html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i)?.[1];
  return inline ? resolveUrl(decodeHtmlEntities(inline), base) : undefined;
}

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|avif)(\?|#|$)/i;

function imageNodeUrl(node: MediaNode | undefined): string | undefined {
  const url = node?.['@_url'];
  if (!url) return undefined;
  const type = node['@_type'];
  const medium = node['@_medium'];
  if (type) return type.startsWith('image/') ? url : undefined;
  if (medium) return medium === 'image' ? url : undefined;
  // Untyped nodes are only trusted when the URL itself looks like an image,
  // otherwise audio/video enclosures get picked up as thumbnails.
  return IMAGE_EXTENSION.test(url) ? url : undefined;
}

function resolveUrl(candidate: string, base: string): string {
  try {
    return new URL(candidate, base).toString();
  } catch {
    return candidate;
  }
}

function toArray<T>(x: T | T[] | undefined): T[] {
  if (x === undefined) return [];
  return Array.isArray(x) ? x : [x];
}

function stripHtml(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  mdash: '—',
  ndash: '–',
  hellip: '…',
};

/**
 * Resolve the HTML entities that survive XML parsing. Feed titles and summaries
 * arrive inside CDATA marked `type="html"`, so numeric references like
 * `&#8217;` are verbatim text the XML parser leaves alone; they only become
 * real characters here.
 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex: string) => fromCodePoint(parseInt(hex, 16)) ?? m)
    .replace(/&#(\d+);/g, (m, dec: string) => fromCodePoint(parseInt(dec, 10)) ?? m)
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, name: string) => NAMED_ENTITIES[name] ?? m);
}

function fromCodePoint(code: number): string | null {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return null;
  try {
    return String.fromCodePoint(code);
  } catch {
    return null;
  }
}

function parseDate(s: string | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return isNaN(t) ? null : t;
}
