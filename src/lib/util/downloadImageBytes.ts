import { fetchWithRetry } from './http';
import { log } from './logger';

/**
 * Download an image URL and return base64 bytes ready to upload to LinkedIn.
 * Returns null if anything goes wrong (fetch failure, unsupported mime, oversize).
 *
 * Callers should treat null as a clean "no image" — never as a hard error.
 */
export interface DownloadedImage {
  bytes: string;
  mime: 'image/png' | 'image/jpeg';
}

const MAX_BYTES = 5 * 1024 * 1024; // LinkedIn's practical cap
const DEFAULT_TIMEOUT_MS = 15_000;
const USER_AGENT = 'InDraft/1.0 (+https://github.com/feRpicoral/indraft)';

export async function downloadImageBytes(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<DownloadedImage | null> {
  let res: Response;
  try {
    res = await fetchWithRetry(url, {
      headers: { 'User-Agent': USER_AGENT },
      retries: 1,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
  } catch (err) {
    log.warn('image download: failed', { url, err: String(err) });
    return null;
  }
  if (!res.ok) {
    log.warn('image download: non-ok', { url, status: res.status });
    return null;
  }
  const contentType = (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  let mime: 'image/png' | 'image/jpeg';
  if (contentType === 'image/png') mime = 'image/png';
  else if (contentType === 'image/jpeg' || contentType === 'image/jpg') mime = 'image/jpeg';
  else {
    log.info('image download: unsupported mime', { url, contentType });
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    log.info('image download: too large', { url, bytes: buf.byteLength });
    return null;
  }
  return { bytes: buf.toString('base64'), mime };
}
