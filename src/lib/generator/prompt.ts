import type { Config } from '../config/schema';
import type { SourceItem, Pillar } from '../types';
import type { ChatMessage } from '../llm/provider';

/**
 * The system prompt does the heavy lifting on voice + anti-AI-tells. The
 * linter is a thin safety net; we don't expect it to catch much when the
 * system prompt is strict.
 */
export function buildSystemPrompt(cfg: Config): string {
  const pillars = cfg.content.pillars.join(', ');
  return [
    "You are a drafting assistant for an engineer's personal LinkedIn account.",
    'Voice:',
    '- First person, opinionated, specific. A sharp engineer talking to peers, not a marketer.',
    '- Casual by default; never corporate.',
    '- Tie every post to something recent and concrete. No evergreen advice.',
    'Format:',
    '- Strong, specific first line (LinkedIn truncates after ~2 lines). Do not start with a hook cliché.',
    '- Short, scannable paragraphs.',
    '- One single angle per post tied to ONE pillar from this set: ' + pillars + '.',
    '- A light discussion prompt at the end is okay only when it follows naturally.',
    'Hard "do not" rules (these are the most common AI tells):',
    '- No em-dash spam (max 2).',
    '- No "Let\'s dive in", "I\'m thrilled to share", "In today\'s fast-paced", "game-changer", "it\'s not just X, it\'s Y".',
    '- No rule-of-three padding ("fast, easy, and powerful").',
    '- No "buzzword soup" — revolutionary / leverage / synergy / unleash / world-class / cutting-edge.',
    '- Hashtags go in the `hashtags` JSON field ONLY (3–5 of them). Do NOT include them in the body — not at the end, not mid-sentence, not anywhere.',
    '- ≤1 emoji.',
    'Content kinds (choose one):',
    '- "text": commentary only. Default for opinion/commentary posts that stand on their own.',
    '- "single_image": commentary plus one image. Use when an image meaningfully reinforces the angle.',
    '- "article": the post is fundamentally a link share with a rich preview card. Use when the link IS the point (you are reacting to a specific article and want readers to follow it). When chosen, set article: { source, title } and do NOT set link_placement — the source lives inside the card.',
    'Output:',
    '- STRICT JSON only — no markdown fences, no commentary. Schema:',
    `  { body, content_kind: "text|single_image|article", article?: { source, title },`,
    `    needs_image, image_source: "none|owner|stock|ai", image_query?, image_concept?,`,
    `    link?, link_placement: "${cfg.post.link_placement === 'none' ? 'none' : 'none|body|comment'}",`,
    `    hashtags: string[], mentions: string[], pillar, source_url, verbatim_ranges?: [start, end][] }`,
    '- Default link_placement is "' +
      cfg.post.link_placement +
      '" — 2026 LinkedIn algorithm research shows both body and comment links reduce reach.',
    '- needs_image is false unless an image genuinely adds value AND a concrete query exists.',
  ].join('\n');
}

export interface DraftContext {
  cfg: Config;
  /** The full collected source set. Static within a run; cacheable. */
  sources: SourceItem[];
  /** The pillars (with counts) used in recent published posts. */
  recentPillars: Pillar[];
  chosenItem: SourceItem;
  targetPillar: Pillar;
}

/**
 * Build the message sequence for a fresh draft. The first two user messages
 * are cacheable; the third carries the dynamic request.
 *
 * Returns `messages` and the indices to mark as cache boundaries.
 */
export function buildDraftMessages(
  ctx: DraftContext,
): { messages: ChatMessage[]; cacheBreakpoints: number[] } {
  const profileBlock = renderProfileBlock(ctx.cfg);
  const sourceSnapshot = renderSourceSnapshot(ctx.sources);
  const requestBody = renderDraftRequest(ctx);

  return {
    messages: [
      { role: 'user', content: profileBlock },
      { role: 'user', content: sourceSnapshot },
      { role: 'user', content: requestBody },
    ],
    cacheBreakpoints: [0, 1],
  };
}

function renderProfileBlock(cfg: Config): string {
  const links = Object.entries(cfg.profile.links)
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  return [
    'PROFILE',
    '-------',
    cfg.profile.about.trim(),
    '',
    'Links:',
    links || '(none)',
    '',
    'Pillars (rotate; do not repeat the same one back-to-back):',
    cfg.content.pillars.map((p) => `- ${p}`).join('\n'),
  ].join('\n');
}

function renderSourceSnapshot(items: SourceItem[]): string {
  const top = items.slice(0, 10);
  const lines = top.map((s, i) => {
    const date = new Date(s.published_at).toISOString().slice(0, 10);
    return `[${i + 1}] (${s.category}, ${date}) ${s.title}\n    ${s.url}\n    ${truncate(s.summary, 220)}`;
  });
  return ['SOURCE CONTEXT', '--------------', ...lines].join('\n');
}

function renderDraftRequest(ctx: DraftContext): string {
  const rotationHint =
    ctx.recentPillars.length > 0
      ? `Recent pillars used (avoid repeating most recent): ${ctx.recentPillars.join(', ')}`
      : 'No recent pillar history.';
  return [
    'TASK',
    '----',
    rotationHint,
    `Target pillar: ${ctx.targetPillar}`,
    '',
    'CHOSEN ITEM',
    '-----------',
    `${ctx.chosenItem.title}`,
    `${ctx.chosenItem.url}`,
    truncate(ctx.chosenItem.summary, 800),
    '',
    'Write ONE post about this item, tied to the target pillar. Return JSON only.',
  ].join('\n');
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}
