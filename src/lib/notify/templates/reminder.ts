import type { Draft } from '../../types';

export interface ReminderArgs {
  draft: Draft;
  magicUrl: string;
  hoursAgo: number;
}

export function renderReminder(args: ReminderArgs): { subject: string; html: string; text: string } {
  const subject = `InDraft — reminder: 1 draft awaiting review`;
  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto;">
      <p>You have an unreviewed draft (${Math.round(args.hoursAgo)}h old).</p>
      <p><a href="${args.magicUrl}">Open it</a> when you have a minute. Nothing publishes without your passkey.</p>
      <p style="color:#999; font-size: 12px;">If the news is stale, the UI offers a "regenerate against current news" button.</p>
    </div>
  `.trim();
  const text = [
    `Reminder: an InDraft draft has been waiting ${Math.round(args.hoursAgo)} hours.`,
    `Open: ${args.magicUrl}`,
    `Nothing publishes without your passkey.`,
  ].join('\n');
  return { subject, html, text };
}
