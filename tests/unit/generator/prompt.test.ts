import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildDraftMessages } from '@/lib/generator/prompt';
import { buildEditMessages } from '@/lib/generator/editPrompt';
import type { Config } from '@/lib/config/schema';
import type { Draft, SourceItem } from '@/lib/types';

const cfg: Config = {
  profile: {
    about: 'I build full-stack apps with Next.js and TypeScript.',
    links: { github: 'https://github.com/x' },
  },
  schedule: { days: ['MON'], timezone: 'UTC', hour: 9 },
  sources: { dev: [], ai_research: [], hardware: [], business: [] },
  content: {
    pillars: ['fullstack', 'cs_fundamentals'],
    tone_default: 'casual',
    linter: { max_em_dashes: 2, max_emojis: 1, max_hashtags: 5, buzzwords: [], generic_openers: [] },
  },
  media: { image_provider: 'pexels', allow_ai_image_when_on_topic: false },
  post: { link_placement: 'none', hashtags_target: 4 },
  review: { link_ttl_hours: 24, reminder_after_hours: 24, stale_after_hours: 48 },
  llm: {
    gateway: 'openrouter',
    draft_model: 'm1',
    utility_model: 'm2',
    prompt_caching: true,
    max_retries: 3,
  },
};

const item: SourceItem = {
  title: 'New TypeScript 6.0 release',
  url: 'https://example.com/ts-6',
  summary: 'TypeScript 6.0 ships with stricter inference.',
  source: 'example.com',
  published_at: Date.parse('2026-05-24T00:00:00Z'),
  category: 'dev',
};

describe('buildSystemPrompt', () => {
  it('embeds the pillars and locked link_placement default', () => {
    const sys = buildSystemPrompt(cfg);
    expect(sys).toContain('fullstack');
    expect(sys).toContain('cs_fundamentals');
    expect(sys).toContain('Default link_placement is "none"');
    expect(sys).toContain('STRICT JSON only');
  });

  it('lists the most common AI tells explicitly', () => {
    const sys = buildSystemPrompt(cfg);
    expect(sys).toContain("Let's dive in");
    expect(sys).toContain("I'm thrilled to share");
    expect(sys).toContain('No em-dash spam');
  });
});

describe('buildDraftMessages', () => {
  it('returns three user messages with the first two marked cacheable', () => {
    const { messages, cacheBreakpoints } = buildDraftMessages({
      cfg,
      sources: [item],
      chosenItem: item,
      targetPillar: 'fullstack',
      recentPillars: ['cs_fundamentals'],
    });
    expect(messages).toHaveLength(3);
    expect(cacheBreakpoints).toEqual([0, 1]);
    expect(messages[0]?.content).toContain('PROFILE');
    expect(messages[1]?.content).toContain('SOURCE CONTEXT');
    expect(messages[2]?.content).toContain('Target pillar: fullstack');
    expect(messages[2]?.content).toContain('Recent pillars used');
    expect(messages[2]?.content).toContain('TypeScript 6.0');
  });

  it('handles no-recent-pillar case gracefully', () => {
    const { messages } = buildDraftMessages({
      cfg,
      sources: [item],
      chosenItem: item,
      targetPillar: 'fullstack',
      recentPillars: [],
    });
    expect(messages[2]?.content).toContain('No recent pillar history');
  });

  it('truncates very long source summaries', () => {
    const huge: SourceItem = { ...item, summary: 'x'.repeat(2000) };
    const { messages } = buildDraftMessages({
      cfg,
      sources: [huge],
      chosenItem: huge,
      targetPillar: 'fullstack',
      recentPillars: [],
    });
    expect((messages[1]?.content as string).length).toBeLessThan(2500);
  });
});

describe('buildEditMessages', () => {
  const baseDraft: Draft = {
    id: 'd1',
    version: 2,
    status: 'PENDING_REVIEW',
    body: 'Original body.',
    content_kind: 'text',
    hashtags: [],
    mentions: [],
    pillar: 'fullstack',
    source_url: 'https://example.com/x',
    conversation: [],
    created_at: 0,
    updated_at: 0,
  };

  it('surfaces content_kind and a preserve-kind instruction', () => {
    const { messages } = buildEditMessages({
      cfg,
      sources: [item],
      current: baseDraft,
      message: 'tighten the opener',
    });
    const content = messages[2]?.content as string;
    expect(content).toContain('content_kind: text');
    expect(content).toContain('Preserve content_kind ("text")');
  });

  it('surfaces article.source/title/thumbnail when content_kind is article', () => {
    const articleDraft: Draft = {
      ...baseDraft,
      content_kind: 'article',
      article: {
        source: 'https://example.com/the-piece',
        title: 'A specific article',
        thumbnail: { kind: 'owner', bytes: 'abc', mime: 'image/png' },
      },
    };
    const { messages } = buildEditMessages({
      cfg,
      sources: [item],
      current: articleDraft,
      message: 'sharpen the angle',
    });
    const content = messages[2]?.content as string;
    expect(content).toContain('content_kind: article');
    expect(content).toContain('article.source: https://example.com/the-piece');
    expect(content).toContain('article.title: A specific article');
    expect(content).toContain('article.thumbnail: attached');
  });

  it('omits the article fields block when content_kind is not article', () => {
    const { messages } = buildEditMessages({
      cfg,
      sources: [item],
      current: baseDraft,
      message: 'tighten',
    });
    const content = messages[2]?.content as string;
    expect(content).not.toMatch(/^article\.source:/m);
    expect(content).not.toMatch(/^article\.title:/m);
    expect(content).not.toMatch(/^article\.thumbnail:/m);
  });
});
