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
import { recordCronAudit, type CronAuditEntry } from '../state/cronAudit';
import { recentPillars, lastPillar, isDuplicate } from '../state/history';
import { collect } from '../collector';
import { buildProvider } from '../llm';
import { draft as generateDraft } from '../generator';
import { selectMedia } from '../media';
import { buildNotifier, type Notifier } from '../notify';
import { signMagicLink } from '../review/magicLink';
import { newNonce } from '../util/id';
import { log } from '../util/logger';
import { localDayAndHour, ONE_DAY_MS } from '../util/time';
import { daysToExpiry, isExpired, shouldWarnReauth } from '../auth/tokenExpiry';
import { buildReauthStartUrl } from '../auth/linkedinOAuth';

export type SkipReason =
  | 'wrong_day'
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
  /**
   * Bypass the day-of-week filter to run off-schedule. Used by manual smoke
   * tests (`/api/cron/run?force=1` and `yarn indraft run --force`).
   */
  force?: boolean;
}

const CRON_LOCK_TTL_S = 600; // 10 min

export async function runScheduledJob(opts: RunOpts = {}): Promise<RunResult> {
  const now = opts.now ?? Date.now();
  const cfg = loadConfig();
  const env = loadEnv();
  const kv = getKv();
  const local = opts.force ? null : localDayAndHour(new Date(now), cfg.schedule.timezone);
  const audit: CronAuditEntry = {
    id: newNonce(),
    status: 'started',
    started_at: now,
    dry_run: opts.dryRun === true,
    force: opts.force === true,
    target_days: [...cfg.schedule.days],
    target_hour: cfg.schedule.hour,
    timezone: cfg.schedule.timezone,
    ...(local ? { day: local.day, hour: local.hour } : {}),
  };
  await recordCronAudit(audit);
  const finish = async (result: RunResult): Promise<RunResult> => {
    await recordCronAudit({
      ...audit,
      status: result.skipped ? 'skipped' : 'success',
      finished_at: Date.now(),
      ...(result.skipped ? { skipped: result.skipped } : {}),
      ...(result.created ? { draft_id: result.created.id } : {}),
      ...(result.warnings?.length ? { warnings: result.warnings } : {}),
    });
    return result;
  };

  let lockAcquired = false;
  try {
    const lockOk = await kv.set(k.cronLock(), String(now), { ex: CRON_LOCK_TTL_S, nx: true });
    if (!lockOk) {
      log.warn('cron lock held; skipping');
      return finish({ skipped: 'locked' });
    }
    lockAcquired = true;

    if (!opts.force) {
      if (!local) throw new Error('local schedule metadata missing');
      if (!cfg.schedule.days.includes(local.day)) {
        log.info('scheduler skip: wrong day', { day: local.day });
        return finish({ skipped: 'wrong_day' });
      }
      // No local-hour gate: the GitHub Actions cron already pins the trigger to
      // the configured days and hour, and its scheduled delivery arrives late by
      // a variable amount (observed up to ~2h), so a narrow hour window would
      // skip otherwise-legitimate runs.
    } else {
      log.info('scheduler force=true; bypassing day filter');
    }

    const tokenWarnings = await preflightToken(cfg, env, now);
    if (tokenWarnings.fatal) {
      return finish({ skipped: tokenWarnings.fatal, warnings: tokenWarnings.notes });
    }

    const sources = await collect(cfg);
    if (sources.length === 0) {
      log.warn('no sources collected');
      return finish({ skipped: 'no_sources', warnings: tokenWarnings.notes });
    }

    const recent = await recentPillars();
    const last = await lastPillar();
    const targetPillar = pickNextPillar(cfg.content.pillars, last, recent);
    const chosenItem = pickChosenItem(sources);

    if (await isDuplicate({ source_url: chosenItem.url, body: chosenItem.title })) {
      log.info('skipping duplicate item', { url: chosenItem.url });
      return finish({ skipped: 'duplicate', warnings: tokenWarnings.notes });
    }

    const llm = buildProvider();
    const { output, linter_warnings } = await generateDraft(
      { cfg, llm },
      { sources, chosenItem, targetPillar, recentPillars: recent },
    );

    const media = await selectMedia(output, cfg);

    const draft = await createDraft({
      body: output.body,
      content_kind: output.content_kind,
      hashtags: output.hashtags,
      mentions: output.mentions,
      pillar: output.pillar,
      source_url: output.source_url,
      conversation: [],
      ...(media ? { media } : {}),
      ...(output.article ? { article: output.article } : {}),
      ...(output.link
        ? { link: { url: output.link, placement: output.link_placement } }
        : {}),
      ...(output.verbatim_ranges ? { verbatim_ranges: output.verbatim_ranges } : {}),
      ...(linter_warnings.length ? { linter_warnings } : {}),
    });
    const pending = await transition(draft.id, 'PENDING_REVIEW');

    if (!opts.dryRun) {
      const nonce = newNonce();
      const ttlSec = cfg.review.link_ttl_hours * 3600;
      await issueMagicNonce({ nonce, draft_id: pending.id, ttlSeconds: ttlSec });
      const token = signMagicLink({
        payload: { draft_id: pending.id, nonce, exp: now + ttlSec * 1000 },
        secret: env.MAGIC_LINK_SIGNING_SECRET,
      });
      const magicUrl = `${env.APP_URL}/api/review/consume?token=${token}`;
      const notifier = buildNotifier();
      await notifier.draftReady(pending, magicUrl);
    } else {
      log.info('dry run: skipping notify');
    }

    return finish({ created: pending, warnings: [...tokenWarnings.notes, ...linter_warnings] });
  } catch (err) {
    await recordCronAudit({
      ...audit,
      status: 'error',
      finished_at: Date.now(),
      error: String(err),
    });
    throw err;
  } finally {
    if (lockAcquired) await kv.del(k.cronLock());
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
    await sendReauthPing(env, notifier, 0);
    notes.push('linkedin token missing — drafts will accumulate; publish blocked');
    return { notes };
  }
  if (isExpired(token, now)) {
    await sendReauthPing(env, notifier, 0);
    notes.push('linkedin token expired — drafts will accumulate; publish blocked');
    return { notes };
  }
  if (shouldWarnReauth(token, now)) {
    const lastNotified = (await getLinkedInReauthNotifiedAt()) ?? 0;
    if (now - lastNotified > ONE_DAY_MS) {
      // Dedup: at most one reauth email per day
      await sendReauthPing(env, notifier, daysToExpiry(token, now));
      await setLinkedInReauthNotifiedAt(now);
      notes.push(`linkedin token expires in ${daysToExpiry(token, now)} days`);
    }
  }
  return { notes };
}

/**
 * Email a LinkedIn reauth link. The link goes through /api/auth/linkedin/start
 * (via buildReauthStartUrl) so the OAuth `state` cookie is set before the
 * redirect to LinkedIn — a link straight to LinkedIn arrives at the callback
 * with no matching cookie and is rejected as invalid state. Requires the
 * bootstrap token, which authorizes /start for a cold (sessionless) click and
 * is the same precondition the `indraft auth` CLI enforces; without it there is
 * no working self-serve reauth link to send.
 */
async function sendReauthPing(
  env: ReturnType<typeof loadEnv>,
  notifier: Notifier,
  daysLeft: number,
): Promise<void> {
  if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET || !env.ENROLLMENT_BOOTSTRAP_TOKEN) {
    return;
  }
  await notifier.reauthLinkedIn(
    daysLeft,
    buildReauthStartUrl(env.APP_URL, env.ENROLLMENT_BOOTSTRAP_TOKEN),
  );
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
  // collect() returns sources sorted by score.
  return sources[0]!;
}
