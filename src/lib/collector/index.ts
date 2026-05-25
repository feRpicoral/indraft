import type { Config } from '../config/schema';
import type { SourceItem, SourceCategory } from '../types';
import { fetchFeed } from './rss';
import { fetchOwnerGithubActivity } from './github';
import { dedup } from './dedup';
import { withScores, sortByScore } from './score';

export interface CollectOpts {
  /** Skip GitHub fetch (useful for tests). */
  skipGithub?: boolean;
  /** Override `now` for deterministic scoring. */
  now?: number;
}

/**
 * Pull from every configured feed in parallel, then GitHub (if enabled), then
 * dedup by canonical URL, then score by freshness, then sort.
 */
export async function collect(cfg: Config, opts: CollectOpts = {}): Promise<SourceItem[]> {
  const categoryFeeds: Array<[SourceCategory, string]> = [];
  for (const [cat, urls] of [
    ['dev', cfg.sources.dev],
    ['ai_research', cfg.sources.ai_research],
    ['hardware', cfg.sources.hardware],
    ['business', cfg.sources.business],
  ] as Array<[SourceCategory, string[]]>) {
    for (const u of urls) categoryFeeds.push([cat, u]);
  }

  const feedResults = await Promise.all(
    categoryFeeds.map(([cat, url]) => fetchFeed(url, cat)),
  );
  const collected: SourceItem[] = feedResults.flat();

  if (!opts.skipGithub && cfg.sources.personal?.github_user) {
    const gh = await fetchOwnerGithubActivity(cfg.sources.personal.github_user);
    collected.push(...gh);
  }

  return sortByScore(withScores(dedup(collected), opts.now));
}

export { fetchFeed } from './rss';
export { dedup, canonicalUrl } from './dedup';
export { withScores, sortByScore, freshnessScore } from './score';
export { fetchOwnerGithubActivity } from './github';
export { scanLocalRepos } from './localRepos';
