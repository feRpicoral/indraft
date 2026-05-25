import { fetchWithRetry } from '../util/http';
import { log } from '../util/logger';
import type { SourceItem } from '../types';

const GITHUB_API = 'https://api.github.com';

interface GhEvent {
  type: string;
  created_at: string;
  repo?: { name: string };
  payload?: {
    commits?: Array<{ message: string }>;
    pull_request?: { title: string; html_url: string };
    release?: { name: string; html_url: string };
    description?: string;
  };
}

/**
 * Fetch the owner's recent public GitHub activity. We only use it as
 * "personal signal" — what the owner is actually working on — not as a
 * primary news source. Returns [] on any error (rate limit, missing user).
 */
export async function fetchOwnerGithubActivity(user: string): Promise<SourceItem[]> {
  if (!user) return [];
  try {
    const res = await fetchWithRetry(`${GITHUB_API}/users/${user}/events/public`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'InDraft/1.0',
      },
      retries: 1,
      timeoutMs: 10_000,
    });
    if (!res.ok) {
      log.warn('github events non-ok', { status: res.status });
      return [];
    }
    const events = (await res.json()) as GhEvent[];
    return eventsToItems(events);
  } catch (err) {
    log.warn('github events failed', { err: String(err) });
    return [];
  }
}

function eventsToItems(events: GhEvent[]): SourceItem[] {
  const items: SourceItem[] = [];
  for (const e of events) {
    const ts = Date.parse(e.created_at);
    if (isNaN(ts)) continue;
    const repo = e.repo?.name ?? 'unknown';
    if (e.type === 'PushEvent' && e.payload?.commits) {
      const summary = e.payload.commits
        .slice(0, 3)
        .map((c) => c.message)
        .join(' | ');
      items.push({
        title: `Pushed to ${repo}`,
        url: `https://github.com/${repo}`,
        summary,
        source: 'github',
        published_at: ts,
        category: 'personal',
      });
    } else if (e.type === 'PullRequestEvent' && e.payload?.pull_request) {
      items.push({
        title: `PR: ${e.payload.pull_request.title}`,
        url: e.payload.pull_request.html_url,
        summary: `PR in ${repo}`,
        source: 'github',
        published_at: ts,
        category: 'personal',
      });
    } else if (e.type === 'ReleaseEvent' && e.payload?.release) {
      items.push({
        title: `Release: ${e.payload.release.name}`,
        url: e.payload.release.html_url,
        summary: `Released ${e.payload.release.name} in ${repo}`,
        source: 'github',
        published_at: ts,
        category: 'personal',
      });
    }
  }
  return items;
}
