import type { Config } from '../config/schema';
import type { DraftMedia, DraftOutput } from '../types';
import { searchPexels } from './pexels';
import { generateAiImage } from './aiImage';

export { validateImage } from './validate';
export { searchPexels } from './pexels';

/**
 * Select an image for the draft based on the generator's recommendation.
 * Priority order matches spec §6.1: owner-supplied (handled in the review
 * UI) > specific stock (Pexels) > AI (gated) > none.
 */
export async function selectMedia(
  out: DraftOutput,
  cfg: Config,
): Promise<DraftMedia | undefined> {
  if (!out.needs_image) return undefined;

  switch (out.image_source) {
    case 'none':
      return undefined;
    case 'owner':
      // The UI handles owner uploads; the scheduled run can't produce them.
      return undefined;
    case 'stock': {
      if (cfg.media.image_provider !== 'pexels') return undefined;
      const apiKey = process.env.PEXELS_API_KEY;
      if (!apiKey) return undefined;
      const query = out.image_query?.trim();
      if (!query) return undefined;
      const photo = await searchPexels(query, apiKey);
      if (!photo) return undefined;
      return { kind: 'stock', url: photo.url, alt: photo.alt };
    }
    case 'ai': {
      if (!cfg.media.allow_ai_image_when_on_topic) return undefined;
      const concept = out.image_concept?.trim();
      if (!concept) return undefined;
      const generated = await generateAiImage(concept);
      if (!generated) return undefined;
      return { kind: 'ai', url: generated.url, alt: generated.alt };
    }
  }
}
