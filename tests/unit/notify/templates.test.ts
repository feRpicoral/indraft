import { describe, it, expect } from 'vitest';
import { renderDraftReady } from '@/lib/notify/templates/draftReady';
import { renderReminder } from '@/lib/notify/templates/reminder';
import { renderReauthLinkedIn } from '@/lib/notify/templates/reauthLinkedIn';
import { renderAccessLinks } from '@/lib/notify/templates/accessLinks';
import type { Draft } from '@/lib/types';

const draft: Draft = {
  id: 'd1',
  version: 1,
  status: 'PENDING_REVIEW',
  body: 'A draft body with a real opinion.',
  hashtags: [],
  mentions: [],
  pillar: 'fullstack',
  source_url: 'https://example.com/x',
  conversation: [],
  created_at: 0,
  updated_at: 0,
};

describe('draftReady template', () => {
  it('includes the pillar in the subject and the magic url in the body', () => {
    const t = renderDraftReady({ draft, magicUrl: 'https://app/review?token=abc' });
    expect(t.subject).toContain('fullstack');
    expect(t.html).toContain('https://app/review?token=abc');
    expect(t.text).toContain('https://app/review?token=abc');
  });
  it('escapes HTML special chars in the body preview', () => {
    const evil: Draft = { ...draft, body: '<script>alert(1)</script>' };
    const t = renderDraftReady({ draft: evil, magicUrl: 'u' });
    expect(t.html).not.toContain('<script>');
    expect(t.html).toContain('&lt;script&gt;');
  });
});

describe('reminder template', () => {
  it('renders the hours-since-creation', () => {
    const t = renderReminder({ draft, magicUrl: 'u', hoursAgo: 24 });
    expect(t.text).toContain('24');
    expect(t.subject).toContain('reminder');
  });
});

describe('reauthLinkedIn template', () => {
  it('uses the future tense when days > 0', () => {
    const t = renderReauthLinkedIn({ daysLeft: 5, authUrl: 'https://reauth' });
    expect(t.html).toContain('expires in 5 days');
    expect(t.html).toContain('https://reauth');
  });
  it('uses the past tense when expired', () => {
    const t = renderReauthLinkedIn({ daysLeft: 0, authUrl: 'https://reauth' });
    expect(t.html).toContain('has expired');
  });
});

describe('accessLinks template', () => {
  it('lists pending drafts', () => {
    const t = renderAccessLinks([
      { draft_id: 'd1', url: 'https://app/review?token=t1', preview: 'A draft preview' },
    ]);
    expect(t.html).toContain('A draft preview');
    expect(t.html).toContain('https://app/review?token=t1');
  });
  it('shows (no pending drafts) when empty', () => {
    const t = renderAccessLinks([]);
    expect(t.html).toContain('no pending drafts');
  });
});
