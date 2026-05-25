import type { Publisher, PublishInput, PublishResult } from './index';

/**
 * Browser publisher stub. Documented in the spec §16 as a future path for
 * cases where the official API is insufficient (real @mentions, carousels).
 * Such an adapter would:
 *
 * 1. Run on a persistent host (NOT serverless).
 * 2. Route through the owner's Surfshark VPN dedicated IP.
 * 3. Persist a logged-in session across runs.
 * 4. Simulate genuine human behavior (mouse, timing, scroll, typing cadence).
 *
 * Do not use Playwright (even patched). As of early 2026, Playwright forks
 * fail at the automation-protocol fingerprinting layer regardless of patch
 * quality; CDP-driven tools (e.g. nodriver) are more robust.
 *
 * IMPORTANT: A browser publisher violates LinkedIn's ToS and risks the
 * account. It is intentionally not implemented in this codebase. This stub
 * exists only so the Publisher interface stays clean and a future maintainer
 * can wire it up.
 */
export class BrowserPublisherNotImplemented implements Publisher {
  async publish(_post: PublishInput): Promise<PublishResult> {
    throw new Error(
      'BrowserPublisher is documented in the README but intentionally not implemented. ' +
        'See spec §16 and src/lib/publisher/browserStub.ts.',
    );
  }
  async addComment(_postUrn: string, _text: string): Promise<void> {
    throw new Error('BrowserPublisher is not implemented.');
  }
  async healthCheck(): Promise<{ ok: boolean; reason?: string }> {
    return { ok: false, reason: 'BrowserPublisher is a documented-only stub' };
  }
}
