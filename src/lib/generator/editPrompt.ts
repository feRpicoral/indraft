import type { Config } from '../config/schema';
import type { Draft, SourceItem } from '../types';
import type { ChatMessage } from '../llm/provider';

export interface EditContext {
  cfg: Config;
  sources: SourceItem[];
  current: Draft;
  message: string;
  imageUrl?: string;
  pastedUrl?: string;
  /** Optional fetched summary of `pastedUrl` so the model sees fresh context. */
  pastedSummary?: string;
}

export function buildEditMessages(
  ctx: EditContext,
): { messages: ChatMessage[]; cacheBreakpoints: number[] } {
  const profileBlock = renderProfileBlock(ctx.cfg);
  const sourceSnapshot = renderSourceSnapshot(ctx.sources);
  const editBody = renderEditRequest(ctx);

  return {
    messages: [
      { role: 'user', content: profileBlock },
      { role: 'user', content: sourceSnapshot },
      { role: 'user', content: editBody },
    ],
    cacheBreakpoints: [0, 1],
  };
}

function renderProfileBlock(cfg: Config): string {
  return [
    'PROFILE',
    '-------',
    cfg.profile.about.trim(),
    '',
    'Pillars:',
    cfg.content.pillars.map((p) => `- ${p}`).join('\n'),
  ].join('\n');
}

function renderSourceSnapshot(items: SourceItem[]): string {
  const top = items.slice(0, 10);
  const lines = top.map((s, i) => {
    return `[${i + 1}] (${s.category}) ${s.title}\n    ${s.url}`;
  });
  return ['SOURCE CONTEXT (for topic pivots)', '--------------------------------', ...lines].join(
    '\n',
  );
}

function renderEditRequest(ctx: EditContext): string {
  const { current } = ctx;
  const conversation = current.conversation
    .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
    .join('\n\n');

  return [
    'CURRENT DRAFT',
    '-------------',
    `version: ${current.version}`,
    `pillar: ${current.pillar}`,
    `source_url: ${current.source_url}`,
    `link: ${current.link ? `${current.link.url} (${current.link.placement})` : '(none)'}`,
    `hashtags: ${current.hashtags.join(', ') || '(none)'}`,
    'body:',
    current.body,
    '',
    'CONVERSATION SO FAR',
    '-------------------',
    conversation || '(no prior turns)',
    '',
    'NEW USER MESSAGE',
    '----------------',
    ctx.message,
    '',
    ctx.imageUrl ? `ATTACHED IMAGE: ${ctx.imageUrl}` : '(no image attached)',
    ctx.pastedUrl
      ? `PASTED URL: ${ctx.pastedUrl}\nFRESH CONTEXT:\n${ctx.pastedSummary ?? '(could not fetch)'}`
      : '',
    '',
    'INSTRUCTIONS',
    '------------',
    '- The CURRENT DRAFT body above is authoritative. The owner may have edited it directly outside of this chat. Preserve their exact wording unless the new message explicitly asks for a change.',
    '- If the user supplied quoted verbatim text (in "..." or backticks), use it verbatim in the body and set verbatim_ranges so the linter skips it.',
    '- Do NOT regenerate fields the user did not ask about, unless the change forces it (e.g., a topic pivot also changes source_url and pillar).',
    '- Keep the same hard rules: voice, length, no AI tells, 3–5 hashtags, ≤1 emoji.',
    '- Return JSON only.',
  ]
    .filter((s) => s !== '')
    .join('\n');
}
