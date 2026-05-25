export interface ImageMeta {
  mime: string;
  size: number;
}

const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg']);
const MAX_BYTES = 5 * 1024 * 1024; // LinkedIn-friendly cap

export function validateImage(meta: ImageMeta): { ok: boolean; reason?: string } {
  if (!ALLOWED_MIMES.has(meta.mime)) {
    return { ok: false, reason: `unsupported mime ${meta.mime}; expected PNG or JPEG` };
  }
  if (meta.size > MAX_BYTES) {
    return { ok: false, reason: `size ${meta.size}B exceeds ${MAX_BYTES}B` };
  }
  return { ok: true };
}
