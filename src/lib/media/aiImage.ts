import { log } from '../util/logger';

/**
 * AI-generated image stub. Gated behind:
 *   1. config.media.allow_ai_image_when_on_topic === true
 *   2. The post topic is explicitly about AI imagery
 *
 * No image generator is wired up yet — when both gates pass, this returns
 * null and logs an info message so the run continues with `image_source: none`.
 *
 * To actually generate, plug an image model (OpenAI, Stability, FAL) here and
 * return { url, alt }.
 */
export async function generateAiImage(concept: string): Promise<{ url: string; alt: string } | null> {
  log.info('ai image requested but generator not configured', { concept });
  return null;
}
