export interface ReauthLinkedInArgs {
  daysLeft: number;
  authUrl: string;
}

export function renderReauthLinkedIn(
  args: ReauthLinkedInArgs,
): { subject: string; html: string; text: string } {
  const subject = `InDraft — LinkedIn token expires in ${args.daysLeft} days`;
  const intro =
    args.daysLeft <= 0
      ? `Your LinkedIn token has expired. Reconnect to keep publishing.`
      : `Your LinkedIn token expires in ${args.daysLeft} days. Self-serve apps don't get refresh tokens, so this is the reauth ping.`;
  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto;">
      <p>${intro}</p>
      <p>
        <a href="${args.authUrl}"
           style="display:inline-block; background:#0a66c2; color:#fff; padding:10px 16px; border-radius:6px; text-decoration:none;">
          Reconnect LinkedIn
        </a>
      </p>
      <p style="color:#999; font-size: 12px;">Drafts will keep being created; only publishing is blocked while the token is missing.</p>
    </div>
  `.trim();
  const text = [intro, '', `Reconnect: ${args.authUrl}`].join('\n');
  return { subject, html, text };
}
