import { describe, it, expect } from 'vitest';
import { draft, edit } from '@/lib/generator';
import type { LLMProvider, CompletionRequest, CompletionResult } from '@/lib/llm/provider';
import type { Config } from '@/lib/config/schema';
import type { Draft, SourceItem } from '@/lib/types';

const cfg: Config = {
  profile: { about: 'I build stuff.', links: {} },
  schedule: { days: ['MON'], timezone: 'UTC', hour: 9 },
  sources: { dev: [], ai_research: [], hardware: [], business: [] },
  content: {
    pillars: ['fullstack'],
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
    max_retries: 2,
  },
};

const sourceItem: SourceItem = {
  title: 'A real announcement',
  url: 'https://example.com/x',
  summary: 'Some specific news.',
  source: 'example.com',
  published_at: Date.parse('2026-05-24T00:00:00Z'),
  category: 'dev',
};

class StubLLM implements LLMProvider {
  public calls = 0;
  public requests: CompletionRequest[] = [];
  constructor(private readonly responses: string[]) {}
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.requests.push(req);
    const idx = this.calls++;
    const text = this.responses[Math.min(idx, this.responses.length - 1)]!;
    return { text, raw: { text } };
  }
  async health(): Promise<boolean> {
    return true;
  }
}

const goodResponse = JSON.stringify({
  body: 'A specific, opinionated take about TypeScript 6 ergonomics. I migrated my side project today and discovered the stricter inference catches a real bug I had been carrying.',
  content_kind: 'text',
  needs_image: false,
  image_source: 'none',
  link_placement: 'none',
  hashtags: ['typescript'],
  mentions: [],
  pillar: 'fullstack',
  source_url: 'https://example.com/x',
});

const badResponseLinter = JSON.stringify({
  body: "Let's dive in to the world of TypeScript 6. In today's fast-paced industry, this is a real game-changer that you won't want to miss.",
  content_kind: 'text',
  needs_image: false,
  image_source: 'none',
  link_placement: 'none',
  hashtags: [],
  mentions: [],
  pillar: 'fullstack',
  source_url: 'https://example.com/x',
});

const badResponseUnparseable = 'this is not json';

describe('generator.draft', () => {
  it('returns clean output on first try when the response passes the linter', async () => {
    const llm = new StubLLM([goodResponse]);

    const res = await draft(
      { cfg, llm },
      {
        sources: [sourceItem],
        chosenItem: sourceItem,
        targetPillar: 'fullstack',
        recentPillars: [],
      },
    );

    expect(llm.calls).toBe(1);
    expect(res.linter_warnings).toEqual([]);
    expect(res.output.pillar).toBe('fullstack');
  });

  it('retries on linter failure and returns clean output if a retry succeeds', async () => {
    const llm = new StubLLM([badResponseLinter, goodResponse]);

    const res = await draft(
      { cfg, llm },
      {
        sources: [sourceItem],
        chosenItem: sourceItem,
        targetPillar: 'fullstack',
        recentPillars: [],
      },
    );

    expect(llm.calls).toBe(2);
    expect(res.linter_warnings).toEqual([]);
  });

  it('surfaces warnings (does not throw) after exhausting retries', async () => {
    const llm = new StubLLM([badResponseLinter, badResponseLinter, badResponseLinter]);

    const res = await draft(
      { cfg, llm },
      {
        sources: [sourceItem],
        chosenItem: sourceItem,
        targetPillar: 'fullstack',
        recentPillars: [],
      },
    );

    expect(llm.calls).toBe(3);
    expect(res.linter_warnings.length).toBeGreaterThan(0);
    expect(res.linter_warnings.some((w) => w.startsWith('genericOpeners'))).toBe(true);
  });

  it('retries on unparseable JSON and succeeds when a retry returns valid JSON', async () => {
    const llm = new StubLLM([badResponseUnparseable, goodResponse]);

    const res = await draft(
      { cfg, llm },
      {
        sources: [sourceItem],
        chosenItem: sourceItem,
        targetPillar: 'fullstack',
        recentPillars: [],
      },
    );

    expect(llm.calls).toBe(2);
    expect(res.output.body).toContain('TypeScript 6');
  });

  it('falls back to source_url when article.source is not a URL', async () => {
    const articleResponse = JSON.stringify({
      body: 'Specific, opinionated take about a link-card article. The important part is that the source URL stays publishable even if the model labels the source by name.',
      content_kind: 'article',
      article: {
        source: 'Example News',
        title: 'A real announcement',
      },
      needs_image: false,
      image_source: 'none',
      link_placement: 'none',
      hashtags: ['typescript'],
      mentions: [],
      pillar: 'fullstack',
      source_url: 'https://example.com/x',
    });
    const llm = new StubLLM([articleResponse]);

    const res = await draft(
      { cfg, llm },
      {
        sources: [sourceItem],
        chosenItem: sourceItem,
        targetPillar: 'fullstack',
        recentPillars: [],
      },
    );

    expect(llm.calls).toBe(1);
    expect(res.output.article?.source).toBe('https://example.com/x');
  });

  it('throws when retries run out of parseable output entirely', async () => {
    const llm = new StubLLM([badResponseUnparseable, badResponseUnparseable, badResponseUnparseable]);

    await expect(
      draft(
        { cfg, llm },
        {
          sources: [sourceItem],
          chosenItem: sourceItem,
          targetPillar: 'fullstack',
          recentPillars: [],
        },
      ),
    ).rejects.toThrow();
  });
});

describe('generator.edit', () => {
  const currentDraft: Draft = {
    id: 'd1',
    version: 1,
    status: 'PENDING_REVIEW',
    body: 'Original draft body about TypeScript.',
    hashtags: ['ts'],
    mentions: [],
    pillar: 'fullstack',
    source_url: 'https://example.com/x',
    conversation: [],
    content_kind: 'text',
    created_at: 0,
    updated_at: 0,
  };

  const goodEditResponse = JSON.stringify({
    intent: 'edit',
    message: 'Tightened the opener.',
    patch: JSON.parse(goodResponse),
  });

  it('feeds the current draft + user message into the LLM and returns an edit response', async () => {
    const llm = new StubLLM([goodEditResponse]);

    const res = await edit(
      { cfg, llm },
      {
        current: currentDraft,
        message: 'tighten this',
        sources: [sourceItem],
      },
    );

    expect(res.response.intent).toBe('edit');
    if (res.response.intent !== 'edit') throw new Error('expected edit intent');
    expect(res.response.patch.body).toBeTruthy();
    expect(res.response.message).toBe('Tightened the opener.');
    expect(llm.requests[0]?.system).toContain('chat-edit request');
    expect(llm.requests[0]?.system).not.toContain('Schema:\n  { body');
  });

  it('passes verbatim_ranges when the model produces them', async () => {
    const verbatimResp = JSON.stringify({
      intent: 'edit',
      message: 'Used the verbatim opener you supplied.',
      patch: {
        body: 'A custom opener — that the user wrote verbatim — sits inside this updated draft, accompanied by my own commentary on the broader context.',
        content_kind: 'text',
        needs_image: false,
        image_source: 'none',
        link_placement: 'none',
        hashtags: [],
        mentions: [],
        pillar: 'fullstack',
        source_url: 'https://example.com/x',
        verbatim_ranges: [[2, 50]],
      },
    });
    const llm = new StubLLM([verbatimResp]);

    const res = await edit(
      { cfg, llm },
      {
        current: currentDraft,
        message: 'use this opener: "A custom opener that the user wrote verbatim"',
        sources: [sourceItem],
      },
    );

    if (res.response.intent !== 'edit') throw new Error('expected edit intent');
    expect(res.response.patch.verbatim_ranges).toEqual([[2, 50]]);
  });

  it('returns a reply turn unchanged (no patch, no body fields)', async () => {
    const replyResp = JSON.stringify({
      intent: 'reply',
      message: "I'd lead with the counterpoint — pushes back harder.",
    });
    const llm = new StubLLM([replyResp]);

    const res = await edit(
      { cfg, llm },
      {
        current: currentDraft,
        message: 'what do you think of the angle?',
        sources: [sourceItem],
      },
    );

    expect(res.response.intent).toBe('reply');
    expect(res.response.message).toContain('counterpoint');
    expect(res.linter_warnings).toEqual([]);
  });
});
