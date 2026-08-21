import { readImageDimensions } from '../util/imageSize';

/**
 * Half of LinkedIn's recommended 1200x627 post image. Below this the feed
 * upscales the image and it visibly degrades, so a smaller one is worse than
 * no image at all.
 */
const MIN_IMAGE_WIDTH = 600;
const MIN_IMAGE_HEIGHT = 315;

/**
 * Filename tokens that mark site chrome rather than article art. Feeds without
 * a per-article image routinely point og:image at a house logo — arXiv serves
 * `arxiv-logo-fb.png` for every paper, GitHub's blog serves
 * `generic-github-logo-left.png` — and those are full-size, so the dimension
 * floor alone never catches them.
 */
const SITE_CHROME_TOKEN =
  /(^|[/_-])(logos?|icons?|favicon|avatar|sprite|placeholder|default|generic|watermark)([/_.-]|$)/i;

/** Query params image CDNs use to serve a downscaled rendition. */
const DOWNSCALE_PARAMS = ['w', 'h', 'width', 'height', 'q', 'quality', 'size', 'resize', 'fit'];

export function looksLikeSiteChrome(url: string): boolean {
  try {
    return SITE_CHROME_TOKEN.test(new URL(url).pathname);
  } catch {
    return SITE_CHROME_TOKEN.test(url);
  }
}

/**
 * Drop the CDN sizing params so the original asset is fetched instead of a
 * thumbnail — VentureBeat's feed enclosures carry `?w=300&q=30`, which yields a
 * 300px image where the underlying asset is over 1000px.
 *
 * Returns null when nothing was stripped, so callers can skip a duplicate
 * request. The stripped URL is always tried alongside the original rather than
 * replacing it: some CDNs sign or require their params.
 */
export function withoutDownscaleParams(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  let stripped = false;
  for (const param of DOWNSCALE_PARAMS) {
    if (parsed.searchParams.has(param)) {
      parsed.searchParams.delete(param);
      stripped = true;
    }
  }
  return stripped ? parsed.toString() : null;
}

/**
 * Whether the decoded image is large enough to publish. Unreadable headers pass:
 * the dimensions are unknown, not known-bad, and rejecting would throw away
 * usable images from formats this parser doesn't cover.
 */
export function meetsMinimumSize(bytes: Buffer, mime: string): boolean {
  const dimensions = readImageDimensions(bytes, mime);
  if (!dimensions) return true;
  return dimensions.width >= MIN_IMAGE_WIDTH && dimensions.height >= MIN_IMAGE_HEIGHT;
}
