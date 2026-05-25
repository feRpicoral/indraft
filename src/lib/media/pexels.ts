import { fetchWithRetry } from '../util/http';
import { log } from '../util/logger';

const PEXELS_API = 'https://api.pexels.com/v1';

interface PexelsSearchResp {
  photos?: Array<{
    id: number;
    src: { large: string; large2x: string; medium: string; original: string };
    alt?: string;
    photographer?: string;
    url?: string;
  }>;
}

export interface StockPhoto {
  url: string;
  alt: string;
  attribution: string;
}

export async function searchPexels(query: string, apiKey: string): Promise<StockPhoto | null> {
  if (!query) return null;
  try {
    const url = `${PEXELS_API}/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`;
    const res = await fetchWithRetry(url, {
      headers: { Authorization: apiKey },
      retries: 1,
      timeoutMs: 10_000,
    });
    if (!res.ok) {
      log.warn('pexels non-ok', { status: res.status });
      return null;
    }
    const data = (await res.json()) as PexelsSearchResp;
    const first = data.photos?.[0];
    if (!first) return null;
    return {
      url: first.src.large,
      alt: first.alt ?? query,
      attribution: first.photographer
        ? `Photo by ${first.photographer} on Pexels`
        : 'Photo via Pexels',
    };
  } catch (err) {
    log.warn('pexels search failed', { err: String(err) });
    return null;
  }
}
