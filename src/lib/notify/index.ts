import { ResendNotifier } from './resend';
import { renderDraftReady } from './templates/draftReady';
import { renderReminder } from './templates/reminder';
import { renderReauthLinkedIn } from './templates/reauthLinkedIn';
import { renderAccessLinks, type AccessLinkRow } from './templates/accessLinks';
import type { Draft } from '../types';
import { loadEnv } from '../config/loader';

export interface Notifier {
  draftReady(draft: Draft, magicUrl: string): Promise<void>;
  reminder(draft: Draft, magicUrl: string, hoursAgo: number): Promise<void>;
  reauthLinkedIn(daysLeft: number, authUrl: string): Promise<void>;
  accessLinks(rows: AccessLinkRow[]): Promise<void>;
}

/**
 * Build the configured notifier. When RESEND_API_KEY isn't set (dry-run, CI),
 * returns a dev notifier that logs to stdout instead of sending.
 */
export function buildNotifier(): Notifier {
  const env = loadEnv();
  if (!env.RESEND_API_KEY) {
    return new ConsoleNotifier();
  }
  return new ResendNotifierBackend(
    new ResendNotifier({
      apiKey: env.RESEND_API_KEY,
      from: env.NOTIFY_FROM_ADDRESS,
      to: env.NOTIFY_TO_ADDRESS,
    }),
  );
}

class ResendNotifierBackend implements Notifier {
  constructor(private readonly r: ResendNotifier) {}
  async draftReady(draft: Draft, magicUrl: string): Promise<void> {
    await this.r.send(renderDraftReady({ draft, magicUrl }));
  }
  async reminder(draft: Draft, magicUrl: string, hoursAgo: number): Promise<void> {
    await this.r.send(renderReminder({ draft, magicUrl, hoursAgo }));
  }
  async reauthLinkedIn(daysLeft: number, authUrl: string): Promise<void> {
    await this.r.send(renderReauthLinkedIn({ daysLeft, authUrl }));
  }
  async accessLinks(rows: AccessLinkRow[]): Promise<void> {
    await this.r.send(renderAccessLinks(rows));
  }
}

class ConsoleNotifier implements Notifier {
  async draftReady(draft: Draft, magicUrl: string): Promise<void> {
    const tmpl = renderDraftReady({ draft, magicUrl });
    log(tmpl);
  }
  async reminder(draft: Draft, magicUrl: string, hoursAgo: number): Promise<void> {
    log(renderReminder({ draft, magicUrl, hoursAgo }));
  }
  async reauthLinkedIn(daysLeft: number, authUrl: string): Promise<void> {
    log(renderReauthLinkedIn({ daysLeft, authUrl }));
  }
  async accessLinks(rows: AccessLinkRow[]): Promise<void> {
    log(renderAccessLinks(rows));
  }
}

function log(t: { subject: string; text: string }): void {
  // eslint-disable-next-line no-console
  console.log(`\n=== ${t.subject} ===\n${t.text}\n`);
}

export { renderDraftReady, renderReminder, renderReauthLinkedIn, renderAccessLinks };
