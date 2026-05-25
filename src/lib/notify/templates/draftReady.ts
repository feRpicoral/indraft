import type { Draft } from '../../types';

export interface DraftReadyArgs {
  draft: Draft;
  magicUrl: string;
}

export function renderDraftReady(args: DraftReadyArgs): { subject: string; html: string; text: string } {
  const preview = args.draft.body.slice(0, 140).replace(/\n/g, ' ').trim() + '…';
  const pillar = args.draft.pillar;
  const subject = `InDraft — draft ready (${pillar})`;
  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto;">
      <p>One draft is ready for review.</p>
      <p style="color:#555; font-size: 14px; border-left: 3px solid #0a66c2; padding-left: 12px;">${escapeHtml(preview)}</p>
      <p>
        <a href="${args.magicUrl}"
           style="display:inline-block; background:#0a66c2; color:#fff; padding:10px 16px; border-radius:6px; text-decoration:none;">
          Open review
        </a>
      </p>
      <p style="color:#999; font-size: 12px;">Link expires in 24h. Nothing publishes without your passkey.</p>
    </div>
  `.trim();
  const text = [
    'A draft is ready for review.',
    '',
    preview,
    '',
    `Open: ${args.magicUrl}`,
    '',
    'Link expires in 24h. Nothing publishes without your passkey.',
  ].join('\n');
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return c;
    }
  });
}
