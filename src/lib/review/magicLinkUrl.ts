import { loadEnv } from '../config/loader';
import { isProductionRuntime } from '../util/runtime';

const LOCAL_BASE = 'http://localhost:3000';

/**
 * Build the magic-link consume URL. In non-production runtimes the base is
 * forced to localhost so the review loop is reachable locally without
 * depending on a deployed APP_URL. Production reads env.APP_URL as configured.
 */
export function buildConsumeUrl(token: string): string {
  if (!isProductionRuntime()) {
    return `${LOCAL_BASE}/api/review/consume?token=${token}`;
  }
  const env = loadEnv();
  return `${env.APP_URL ?? ''}/api/review/consume?token=${token}`;
}
