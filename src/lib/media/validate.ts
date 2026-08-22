import { readImageDimensions } from '../util/imageSize';

export interface ImageMeta {
  mime: string;
  size: number;
}

const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg']);
const MAX_BYTES = 5 * 1024 * 1024; // LinkedIn-friendly cap

/**
 * LinkedIn's Images API documents a ceiling of "less than 36,152,320 pixels".
 * Exceeding it is not rejected at upload time — the PUT succeeds and the asset
 * later flips to PROCESSING_FAILED — so it has to be caught before publish or
 * the post ships with a silently broken image.
 *
 * https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api
 */
const MAX_IMAGE_PIXELS = 36_152_320;

export function validateImage(meta: ImageMeta): { ok: boolean; reason?: string } {
  if (!ALLOWED_MIMES.has(meta.mime)) {
    return { ok: false, reason: `unsupported mime ${meta.mime}; expected PNG or JPEG` };
  }
  if (meta.size > MAX_BYTES) {
    return { ok: false, reason: `size ${meta.size}B exceeds ${MAX_BYTES}B` };
  }
  return { ok: true };
}

/**
 * Whether the decoded image is under LinkedIn's pixel ceiling. Images whose
 * dimensions can't be read pass: the count is unknown, not known-bad.
 */
export function withinPixelCeiling(bytes: Buffer, mime: string): boolean {
  const dimensions = readImageDimensions(bytes, mime);
  if (!dimensions) return true;
  return dimensions.width * dimensions.height < MAX_IMAGE_PIXELS;
}
