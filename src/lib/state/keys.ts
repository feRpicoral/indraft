import type { DraftStatus } from '../types';

/**
 * Single source of truth for KV key shapes. Keep all `${...}:${...}` interpolation
 * here — never hand-roll a key in a caller.
 */
export const k = {
  draft: (id: string) => `draft:${id}`,
  draftIndexPending: () => `draft:index:pending`,
  draftIndexByStatus: (s: DraftStatus) => `draft:index:by-status:${s}`,

  historyPosts: () => `history:posts`,
  historyPillarLast: () => `history:pillar:last`,

  magicNonce: (nonce: string) => `magic:nonce:${nonce}`,

  webauthnCredentials: () => `webauthn:credentials`,
  webauthnChallenge: (sessionId: string) => `webauthn:challenge:${sessionId}`,

  linkedinToken: () => `linkedin:token`,
  linkedinReauthNotifiedAt: () => `linkedin:reauth:notified_at`,

  ratelimit: (provider: string) => `ratelimit:${provider}`,

  session: (sid: string) => `session:${sid}`,

  cronLock: () => `cron:lock`,
} as const;
