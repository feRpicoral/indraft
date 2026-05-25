export interface AccessLinkRow {
  draft_id: string;
  url: string;
  preview: string;
}

export function renderAccessLinks(
  rows: AccessLinkRow[],
): { subject: string; html: string; text: string } {
  const subject = `InDraft — fresh review links (${rows.length})`;
  const items = rows.map((r) => `<li><a href="${r.url}">${escape(r.preview)}</a></li>`).join('');
  const textItems = rows.map((r) => `- ${r.preview}\n  ${r.url}`).join('\n');
  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto;">
      <p>Fresh review links for your pending drafts:</p>
      <ul>${items || '<li>(no pending drafts)</li>'}</ul>
      <p style="color:#999; font-size: 12px;">Each link is single-use and expires in 24h.</p>
    </div>
  `.trim();
  const text = rows.length === 0 ? '(no pending drafts)' : textItems;
  return { subject, html, text };
}

function escape(s: string): string {
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
