import type { Config } from '../config/schema';
import type { Draft, Pillar, SourceItem } from '../types';
import { loadConfig, loadEnv } from '../config/loader';
import { getKv } from '../state/kv';
import { k } from '../state/keys';
import {
  getLinkedInToken,
  getLinkedInReauthNotifiedAt,
  setLinkedInReauthNotifiedAt,
  issueMagicNonce,
} from '../state/tokens';
import { createDraft, transition } from '../state/drafts';
import { recentPillars, lastPillar, isDuplicate } from '../state/history';
import { collect } from '../collector';
import { buildProvider } from '../llm';
import { draft as generateDraft } from '../generator';
import { selectMedia } from '../media';
import { buildNotifier } from '../notify';
import { signMagicLink } from '../review/magicLink';
import { newNonce } from '../util/id';
import { log } from '../util/logger';
import { localDayAndHour, ONE_DAY_MS } from '../util/time';
import { daysToExpiry, isExpired, shouldWarnReauth } from '../auth/tokenExpiry';
import { buildAuthUrl } from '../auth/linkedinOAuth';

export type SkipReason =
  | 'wrong_day'
  | 'wrong_hour'
  | 'locked'
  | 'token_missing'
  | 'token_expired'
  | 'no_sources'
  | 'duplicate';

export interface RunResult {
  created?: Draft;
  skipped?: SkipReason;
  warnings?: string[];
}

export interface RunOpts {
  dryRun?: boolean;
  /** Override "now" for deterministic test runs. */
  now?: number;
}

const CRON_LOCK_TTL_S = 600; // 10 min
const HOUR_TOLERANCE = 1; // ±1h to absorb DST drift on a daily UTC cron

export async function runScheduledJob(opts: RunOpts = {}): Promise<RunResult> {
  const now = opts.now ?? Date.now();
  const cfg = loadConfig();
  const env = loadEnv();
  const kv = getKv();

  // 1. Lock
  const lockOk = await kv.set(k.cronLock(), String(now), { ex: CRON_LOCK_TTL_S, nx: true });
  if (!lockOk) {
    log.warn('cron lock held; skipping');
    return { skipped: 'locked' };
  }

  try {
    // 2. Day/hour filter (DST-tolerant)
    const { day, hour } = localDayAndHour(new Date(now), cfg.schedule.timezone);
    if (!cfg.schedule.days.includes(day)) {
      log.info('scheduler skip: wrong day', { day });
      return { skipped: 'wrong_day' };
    }
    if (Math.abs(hour - cfg.schedule.hour) > HOUR_TOLERANCE) {
      log.info('scheduler skip: wrong hour', { hour, target: cfg.schedule.hour });
      return { skipped: 'wrong_hour' };
    }

    // 3. Token preflight
    const tokenWarnings = await preflightToken(cfg, env, now);
    if (tokenWarnings.fatal) {
      return { skipped: tokenWarnings.fatal, warnings: tokenWarnings.notes };
    }

    // 4. Collect
    const sources = await collect(cfg);
    if (sources.length === 0) {
      log.warn('no sources collected');
      return { skipped: 'no_sources', warnings: tokenWarnings.notes };
    }

    // 5. Pillar rotation + chosen item
    const recent = await recentPillars();
    const last = await lastPillar();
    const targetPillar = pickNextPillar(cfg.content.pillars, last, recent);
    const chosenItem = pickChosenItem(sources);

    // Dedup against history
    if (await isDuplicate({ source_url: chosenItem.url, body: chosenItem.title })) {
      log.info('skipping duplicate item', { url: chosenItem.url });
      return { skipped: 'duplicate', warnings: tokenWarnings.notes };
    }

    // 6. Generate
    const llm = buildProvider(cfg);
    const { output, linter_warnings } = await generateDraft(
      { cfg, llm },
      { sources, chosenItem, targetPillar, recentPillars: recent },
    );

    // 7. Media
    const media = await selectMedia(output, cfg);

    // 8. Persist as DRAFTED → PENDING_REVIEW
    const draft = await createDraft({
      body: output.body,
      hashtags: output.hashtags,
      mentions: output.mentions,
      pillar: output.pillar,
      source_url: output.source_url,
      conversation: [],
      ...(media ? { media } : {}),
      ...(output.link
        ? { link: { url: output.link, placement: output.link_placement } }
        : {}),
      ...(output.verbatim_ranges ? { verbatim_ranges: output.verbatim_ranges } : {}),
      ...(linter_warnings.length ? { linter_warnings } : {}),
    });
    const pending = await transition(draft.id, 'PENDING_REVIEW');

    // 9. Notify (unless dry run)
    if (!opts.dryRun) {
      const nonce = newNonce();
      const ttlSec = cfg.review.link_ttl_hours * 3600;
      await issueMagicNonce({ nonce, draft_id: pending.id, ttlSeconds: ttlSec });
      const token = signMagicLink({
        payload: { draft_id: pending.id, nonce, exp: now + ttlSec * 1000 },
        secret: env.MAGIC_LINK_SIGNING_SECRET,
      });
      const magicUrl = `${env.APP_URL ?? 'http://localhost:3000'}/review?token=${token}`;
      const notifier = buildNotifier();
      await notifier.draftReady(pending, magicUrl);
    } else {
      log.info('dry run: skipping notify');
    }

    return { created: pending, warnings: [...tokenWarnings.notes, ...linter_warnings] };
  } finally {
    await kv.del(k.cronLock());
  }
}

interface TokenPreflight {
  fatal?: SkipReason;
  notes: string[];
}

async function preflightToken(
  cfg: Config,
  env: ReturnType<typeof loadEnv>,
  now: number,
): Promise<TokenPreflight> {
  const token = await getLinkedInToken();
  const notes: string[] = [];
  const notifier = buildNotifier();

  if (!token) {
    // Still allow draft creation — owner can review without a token; only
    // publishing requires it. But we should email a reauth ping.
    if (env.LINKEDIN_CLIENT_ID && env.APP_URL) {
      await notifier.reauthLinkedIn(
        0,
        buildAuthUrl(
          {
            clientId: env.LINKEDIN_CLIENT_ID,
            clientSecret: env.LINKEDIN_CLIENT_SECRET ?? '',
            redirectUri: `${env.APP_URL}/api/auth/linkedin/callback`,
          },
          'preflight',
        ),
      );
    }
    notes.push('linkedin token missing — drafts will accumulate; publish blocked');
    return { notes };
  }
  if (isExpired(token, now)) {
    if (env.LINKEDIN_CLIENT_ID && env.APP_URL) {
      await notifier.reauthLinkedIn(
        0,
        buildAuthUrl(
          {
            clientId: env.LINKEDIN_CLIENT_ID,
            clientSecret: env.LINKEDIN_CLIENT_SECRET ?? '',
            redirectUri: `${env.APP_URL}/api/auth/linkedin/callback`,
          },
          'preflight',
        ),
      );
    }
    notes.push('linkedin token expired — drafts will accumulate; publish blocked');
    return { notes };
  }
  if (shouldWarnReauth(token, now)) {
    const lastNotified = (await getLinkedInReauthNotifiedAt()) ?? 0;
    if (now - lastNotified > ONE_DAY_MS) {
      // Dedup: at most one reauth email per day
      if (env.LINKEDIN_CLIENT_ID && env.APP_URL) {
        await notifier.reauthLinkedIn(
          daysToExpiry(token, now),
          buildAuthUrl(
            {
              clientId: env.LINKEDIN_CLIENT_ID,
              clientSecret: env.LINKEDIN_CLIENT_SECRET ?? '',
              redirectUri: `${env.APP_URL}/api/auth/linkedin/callback`,
            },
            'preflight',
          ),
        );
      }
      await setLinkedInReauthNotifiedAt(now);
      notes.push(`linkedin token expires in ${daysToExpiry(token, now)} days`);
    }
  }
  return { notes };
}

function pickNextPillar(
  pillars: Pillar[],
  last: Pillar | null,
  recent: Pillar[],
): Pillar {
  // Pick the pillar least recently used; tiebreak by config order.
  const ranking = pillars.map((p) => {
    const idx = recent.indexOf(p);
    return { p, score: idx === -1 ? Infinity : -idx };
  });
  // Exclude the most-recent pillar entirely if there are alternatives.
  const candidates = pillars.length > 1 ? ranking.filter((r) => r.p !== last) : ranking;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.p ?? pillars[0]!;
}

function pickChosenItem(sources: SourceItem[]): SourceItem {
  // Sources are pre-sorted by score; take the top. Fall back to most recent
  // if scores are all zero.
  return sources[0]!;
}
