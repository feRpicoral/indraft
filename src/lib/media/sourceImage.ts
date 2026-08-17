import type { DraftMedia, SourceItem } from '../types';
import { downloadImageBytes } from '../util/downloadImageBytes';
import { fetchOgImage } from '../util/ogImage';
import { log } from '../util/logger';

/**
 * Resolve the image belonging to the source article itself: the feed's own
 * declaration first, then the article page's og:image. Most feeds ship neither
 * media:* nor an enclosure, so the og:image scrape is the path that actually
 * carries the majority of sources.
 *
 * Returns undefined when neither yields usable bytes (no declaration, fetch
 * failure, unsupported mime, oversize). Callers treat that as a clean "no
 * image" and fall through to stock.
 */
export async function selectSourceImage(item: SourceItem): Promise<DraftMedia | undefined> {
  if (item.image_url) {
    const img = await downloadImageBytes(item.image_url);
    if (img) {
      return {
        kind: 'source',
        url: item.image_url,
        alt: item.title,
        bytes: img.bytes,
        mime: img.mime,
      };
    }
    log.info('source image: feed image unusable, falling back to og:image', {
      url: item.image_url,
    });
  }

  const og = await fetchOgImage(item.url);
  if (!og) return undefined;
  return {
    kind: 'source',
    bytes: og.bytes,
    mime: og.mime,
    alt: og.alt ?? item.title,
  };
}
