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
export async function fetchFeed(
  url: string,
  category: SourceCategory,
): Promise<SourceItem[]> {
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
interface Rss2Item {
  title?: string | { '#text'?: string };
  link?: string | { '#text'?: string; '@_href'?: string };
  description?: string;
  'content:encoded'?: string;
  pubDate?: string;
  guid?: string | { '#text'?: string };
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
      const url = typeof it.link === 'string' ? it.link : (it.link?.['@_href'] ?? it.link?.['#text']);
      const title = typeof it.title === 'string' ? it.title : (it.title?.['#text'] ?? '');
      if (!url || !title) return null;
      const summary = stripHtml(it['content:encoded'] ?? it.description ?? '');
      const published_at = parseDate(it.pubDate) ?? Date.now();
      return {
        title,
        url,
        summary,
        source,
        published_at,
        category,
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
      const title = typeof e.title === 'string' ? e.title : (e.title?.['#text'] ?? '');
      if (!link || !title) return null;
      const summaryRaw =
        typeof e.summary === 'string'
          ? e.summary
          : (e.summary?.['#text'] ??
            (typeof e.content === 'string' ? e.content : e.content?.['#text']) ??
            '');
      const summary = stripHtml(summaryRaw);
      const published_at = parseDate(e.published ?? e.updated) ?? Date.now();
      return {
        title,
        url: link,
        summary,
        source,
        published_at,
        category,
      };
    })
    .filter((x): x is SourceItem => x !== null);
}

function toArray<T>(x: T | T[] | undefined): T[] {
  if (x === undefined) return [];
  return Array.isArray(x) ? x : [x];
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(s: string | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return isNaN(t) ? null : t;
}
