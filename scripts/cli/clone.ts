import type { Command } from 'commander';
import { getDraft, createDraft, transition } from '../../src/lib/state/drafts';
import { signMagicLink } from '../../src/lib/review/magicLink';
import { issueMagicNonce } from '../../src/lib/state/tokens';
import { newNonce } from '../../src/lib/util/id';
import { loadConfig, loadEnv } from '../../src/lib/config/loader';

export function registerClone(program: Command): void {
  program
    .command('clone <draftId>')
    .description(
      'Copy an existing draft (any status) into a fresh PENDING_REVIEW draft and print a magic link to review it.',
    )
    .action(async (sourceId: string) => {
      const source = await getDraft(sourceId);
      if (!source) {
        // eslint-disable-next-line no-console
        console.error(`draft not found: ${sourceId}`);
        process.exit(1);
      }
      const cloned = await createDraft({
        body: source.body,
        hashtags: source.hashtags,
        mentions: source.mentions,
        pillar: source.pillar,
        source_url: source.source_url,
        conversation: [],
        ...(source.media ? { media: source.media } : {}),
        ...(source.link ? { link: source.link } : {}),
        ...(source.verbatim_ranges ? { verbatim_ranges: source.verbatim_ranges } : {}),
      });
      const promoted = await transition(cloned.id, 'PENDING_REVIEW');

      const env = loadEnv();
      const cfg = loadConfig();
      const ttlSec = cfg.review.link_ttl_hours * 3600;
      const nonce = newNonce();
      await issueMagicNonce({ nonce, draft_id: promoted.id, ttlSeconds: ttlSec });
      const token = signMagicLink({
        payload: { draft_id: promoted.id, nonce, exp: Date.now() + ttlSec * 1000 },
        secret: env.MAGIC_LINK_SIGNING_SECRET,
      });
      const base = env.APP_URL ?? 'http://localhost:3000';
      const url = `${base}/api/review/consume?token=${token}`;

      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            source_id: sourceId,
            new_id: promoted.id,
            status: promoted.status,
            magic_url: url,
            body_len: promoted.body.length,
            hashtag_count: promoted.hashtags.length,
            has_media: !!promoted.media,
          },
          null,
          2,
        ),
      );
    });
}
