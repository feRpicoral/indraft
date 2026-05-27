import { fetchWithRetry } from './http';
import { log } from './logger';
import { downloadImageBytes } from './downloadImageBytes';

/**
 * Fetch the OpenGraph image declared on a page. Used as a fallback when we
 * publish an Article post but the owner didn't upload a thumbnail — pull the
 * source URL's <meta property="og:image"> and download the bytes so they can
 * be re-uploaded as a LinkedIn image URN.
 *
 * Returns null if anything goes wrong (no og:image tag, fetch failure, image
 * too large, unsupported mime). Callers should fall through to a no-thumbnail
 * article card in that case.
 */
export interface OgImage {
  /** Base64-encoded bytes ready to feed into the LinkedIn upload chain. */
  bytes: string;
  mime: 'image/png' | 'image/jpeg';
  /** Optional alt text scraped from og:image:alt or the page title. */
  alt?: string;
}

const HTML_TIMEOUT_MS = 8_000;
const IMAGE_TIMEOUT_MS = 15_000;

export async function fetchOgImage(pageUrl: string): Promise<OgImage | null> {
  let imageUrl: string | null = null;
  let alt: string | undefined;
  try {
    const html = await fetchHtml(pageUrl);
    if (!html) return null;
    imageUrl = extractMeta(html, 'og:image') ?? extractMeta(html, 'twitter:image');
    if (!imageUrl) {
      log.info('og image: no og:image meta tag', { pageUrl });
      return null;
    }
    imageUrl = resolveUrl(pageUrl, imageUrl);
    alt = extractMeta(html, 'og:image:alt') ?? extractTitle(html);
  } catch (err) {
    log.warn('og image: html fetch failed', { pageUrl, err: String(err) });
    return null;
  }
  return downloadImage(imageUrl, alt);
}

async function fetchHtml(url: string): Promise<string | null> {
  const res = await fetchWithRetry(url, {
    headers: {
      'User-Agent': 'InDraft/1.0 (+https://github.com/feRpicoral/indraft)',
      Accept: 'text/html,application/xhtml+xml',
    },
    retries: 1,
    timeoutMs: HTML_TIMEOUT_MS,
  });
  if (!res.ok) return null;
  // Cheap safety: don't process huge HTML bodies looking for meta tags.
  const text = await res.text();
  return text.length > 5 * 1024 * 1024 ? null : text;
}

/**
 * Extract the `content` attribute of <meta property="..."> or <meta name="...">.
 * Tolerates quote-style and attribute order variations.
 */
function extractMeta(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Try property first (OG convention), then name (Twitter convention).
  for (const attr of ['property', 'name']) {
    const re = new RegExp(
      `<meta\\s+[^>]*${attr}\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']+)["']`,
      'i',
    );
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]);
    // attribute order may be reversed (content before property)
    const re2 = new RegExp(
      `<meta\\s+[^>]*content\\s*=\\s*["']([^"']+)["'][^>]*${attr}\\s*=\\s*["']${escaped}["']`,
      'i',
    );
    const m2 = html.match(re2);
    if (m2?.[1]) return decodeEntities(m2[1]);
  }
  return null;
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m?.[1] ? decodeEntities(m[1]).trim() : undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function resolveUrl(base: string, candidate: string): string {
  try {
    return new URL(candidate, base).toString();
  } catch {
    return candidate;
  }
}

async function downloadImage(url: string, alt: string | undefined): Promise<OgImage | null> {
  const img = await downloadImageBytes(url, { timeoutMs: IMAGE_TIMEOUT_MS });
  if (!img) return null;
  const result: OgImage = { bytes: img.bytes, mime: img.mime };
  if (alt) result.alt = alt;
  return result;
}
