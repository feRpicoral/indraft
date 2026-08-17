import type { Config } from '../config/schema';
import type { ContentKind, DraftMedia, DraftOutput, SourceItem } from '../types';
import { loadEnv } from '../config/loader';
import { downloadImageBytes } from '../util/downloadImageBytes';
import { log } from '../util/logger';
import { searchPexels } from './pexels';
import { generateAiImage } from './aiImage';
import { selectSourceImage } from './sourceImage';

export { validateImage } from './validate';
export { searchPexels } from './pexels';
export { selectSourceImage } from './sourceImage';

export interface DraftMediaSelection {
  media?: DraftMedia;
  /** Kind after attaching the image; a resolved image promotes a text post. */
  content_kind: ContentKind;
}

/**
 * Pick the media for a newly generated draft.
 *
 * The source article's own image wins over stock imagery and is attached even
 * when the generator didn't ask for one: the system prompt biases `needs_image`
 * to false, so waiting for the model to request an image meant drafts
 * effectively never got one. A real image from the article also beats a generic
 * stock photo on relevance.
 *
 * Article-kind posts are skipped entirely — LinkedIn renders the link card's
 * own preview, and the publish route resolves that thumbnail separately.
 */
export async function selectDraftMedia(
  out: DraftOutput,
  cfg: Config,
  item: SourceItem,
): Promise<DraftMediaSelection> {
  if (out.content_kind === 'article') return { content_kind: 'article' };

  const media = (await selectSourceImage(item)) ?? (await selectMedia(out, cfg));
  if (!media) return { content_kind: out.content_kind };

  return {
    media,
    content_kind: out.content_kind === 'text' ? 'single_image' : out.content_kind,
  };
}

/**
 * Select an image for the draft based on the generator's recommendation.
 * Priority order matches spec §6.1: owner-supplied (handled in the review
 * UI) > specific stock (Pexels) > AI (gated) > none.
 *
 * Stock/AI images are downloaded inline (bytes + mime) so the publisher can
 * upload them directly. Storing only a remote URL is unsafe: by publish time
 * the URL may have rotated/expired, and the publisher requires bytes to
 * complete the LinkedIn upload chain — without them the post silently
 * downgrades to text.
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
      const apiKey = loadEnv().PEXELS_API_KEY;
      if (!apiKey) return undefined;
      const query = out.image_query?.trim();
      if (!query) return undefined;
      const photo = await searchPexels(query, apiKey);
      if (!photo) return undefined;
      const img = await downloadImageBytes(photo.url);
      if (!img) {
        log.info('stock image fetched URL but download failed; skipping', { url: photo.url });
        return undefined;
      }
      return {
        kind: 'stock',
        url: photo.url,
        alt: photo.alt,
        bytes: img.bytes,
        mime: img.mime,
      };
    }
    case 'ai': {
      if (!cfg.media.allow_ai_image_when_on_topic) return undefined;
      const concept = out.image_concept?.trim();
      if (!concept) return undefined;
      const generated = await generateAiImage(concept);
      if (!generated) return undefined;
      const img = await downloadImageBytes(generated.url);
      if (!img) {
        log.info('ai image generated but download failed; skipping', { url: generated.url });
        return undefined;
      }
      return {
        kind: 'ai',
        url: generated.url,
        alt: generated.alt,
        bytes: img.bytes,
        mime: img.mime,
      };
    }
  }
}
