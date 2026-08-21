import type { DraftMedia, SourceItem } from '../types';
import { downloadImageBytes } from '../util/downloadImageBytes';
import { fetchOgImage } from '../util/ogImage';
import { log } from '../util/logger';
import { looksLikeSiteChrome, meetsMinimumSize, withoutDownscaleParams } from './imageQuality';

/**
 * Resolve the image belonging to the source article itself: the feed's own
 * declaration first, then the article page's og:image. Most feeds ship neither
 * media:* nor an enclosure, so the og:image scrape is the path that actually
 * carries the majority of sources.
 *
 * Every candidate is vetted — a house logo or a 300px thumbnail reads worse on
 * a post than no image at all — and a rejected candidate falls through to the
 * next rather than ending the search.
 *
 * Returns undefined when nothing usable is found. Callers treat that as a clean
 * "no image" and fall through to stock.
 */
export async function selectSourceImage(item: SourceItem): Promise<DraftMedia | undefined> {
  for (const url of feedCandidates(item.image_url)) {
    const media = await tryFeedImage(url, item.title);
    if (media) return media;
  }
  return tryOgImage(item);
}

/**
 * The declared URL plus, when the URL carries CDN sizing params, the unsized
 * original ahead of it.
 */
function feedCandidates(imageUrl: string | undefined): string[] {
  if (!imageUrl) return [];
  const original = withoutDownscaleParams(imageUrl);
  return original ? [original, imageUrl] : [imageUrl];
}

async function tryFeedImage(url: string, title: string): Promise<DraftMedia | undefined> {
  if (looksLikeSiteChrome(url)) {
    log.info('source image: skipping site chrome', { url });
    return undefined;
  }
  const img = await downloadImageBytes(url);
  if (!img) return undefined;
  if (!meetsMinimumSize(Buffer.from(img.bytes, 'base64'), img.mime)) {
    log.info('source image: below minimum size', { url });
    return undefined;
  }
  return { kind: 'source', url, alt: title, bytes: img.bytes, mime: img.mime };
}

async function tryOgImage(item: SourceItem): Promise<DraftMedia | undefined> {
  const og = await fetchOgImage(item.url);
  if (!og) return undefined;
  if (looksLikeSiteChrome(og.url)) {
    log.info('source image: og:image is site chrome', { url: og.url });
    return undefined;
  }
  if (!meetsMinimumSize(Buffer.from(og.bytes, 'base64'), og.mime)) {
    log.info('source image: og:image below minimum size', { url: og.url });
    return undefined;
  }
  return { kind: 'source', url: og.url, bytes: og.bytes, mime: og.mime, alt: og.alt ?? item.title };
}
