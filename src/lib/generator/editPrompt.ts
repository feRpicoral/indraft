import type { Config } from '../config/schema';
import type { Draft, SourceItem } from '../types';
import type { ChatMessage, MessagePart } from '../llm/provider';

export interface EditContext {
  cfg: Config;
  sources: SourceItem[];
  current: Draft;
  message: string;
  pastedUrl?: string;
  /** Optional fetched summary of `pastedUrl` so the model sees fresh context. */
  pastedSummary?: string;
}

export function buildEditMessages(
  ctx: EditContext,
): { messages: ChatMessage[]; cacheBreakpoints: number[] } {
  const profileBlock = renderProfileBlock(ctx.cfg);
  const sourceSnapshot = renderSourceSnapshot(ctx.sources);
  const editText = renderEditRequest(ctx);

  // The third message is multimodal when the current draft has media attached.
  // Image goes through to the LLM (vision-capable models will analyze it).
  const imageUrl = mediaUrlForLlm(ctx.current);
  const editContent: ChatMessage['content'] = imageUrl
    ? ([
        { type: 'text', text: editText },
        { type: 'image_url', image_url: { url: imageUrl } },
      ] satisfies MessagePart[])
    : editText;

  return {
    messages: [
      { role: 'user', content: profileBlock },
      { role: 'user', content: sourceSnapshot },
      { role: 'user', content: editContent },
    ],
    cacheBreakpoints: [0, 1],
  };
}

/**
 * Build the image input the LLM should see, if any. Prefers an external URL
 * (cheap reference for stock photos); falls back to a `data:` URL built from
 * inline base64 bytes (owner uploads).
 */
function mediaUrlForLlm(draft: Draft): string | null {
  const m = draft.media;
  if (!m) return null;
  if (m.url) return m.url;
  if (m.bytes && m.mime) return `data:${m.mime};base64,${m.bytes}`;
  return null;
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

  const mediaLine = mediaSummary(current);
  const articleLines =
    current.content_kind === 'article' && current.article
      ? [
          `article.source: ${current.article.source || '(empty)'}`,
          `article.title: ${current.article.title || '(empty)'}`,
          `article.thumbnail: ${current.article.thumbnail ? 'attached' : '(none)'}`,
        ]
      : [];

  return [
    'CURRENT DRAFT',
    '-------------',
    `version: ${current.version}`,
    `content_kind: ${current.content_kind}`,
    `pillar: ${current.pillar}`,
    `source_url: ${current.source_url}`,
    ...articleLines,
    `link: ${current.link ? `${current.link.url} (${current.link.placement})` : '(none)'}`,
    `hashtags: ${current.hashtags.join(', ') || '(none)'}`,
    `media: ${mediaLine}`,
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
    ctx.pastedUrl
      ? `PASTED URL: ${ctx.pastedUrl}\nFRESH CONTEXT:\n${ctx.pastedSummary ?? '(could not fetch)'}`
      : '',
    '',
    'INSTRUCTIONS',
    '------------',
    '- The CURRENT DRAFT body above is authoritative. The owner may have edited it directly outside of this chat. Preserve their exact wording unless the new message explicitly asks for a change.',
    `- Preserve content_kind ("${current.content_kind}") unless the user explicitly asks to switch kinds. When kind is "article", preserve article.source and article.title above unless the user asks for a topic pivot.`,
    '- Hashtags belong in the `hashtags` JSON field only. Do NOT include them in the body.',
    '- If an image is attached to this message, you can see it. Reference it in the body only when the user asks you to or when its contents directly affect the angle.',
    '- If the user supplied quoted verbatim text (in "..." or backticks), use it verbatim in the body and set verbatim_ranges so the linter skips it.',
    '- Do NOT regenerate fields the user did not ask about, unless the change forces it (e.g., a topic pivot also changes source_url and pillar).',
    '- Keep the same hard rules: voice, length, no AI tells, 3–5 hashtags, ≤1 emoji.',
    '',
    'RESPONSE SHAPE',
    '--------------',
    'Return STRICT JSON only, matching ONE of these two shapes (pick the right intent):',
    '',
    '  { "intent": "reply", "message": "<your conversational reply>" }',
    '  { "intent": "edit",  "message": "<1–2 sentence summary of what you changed>", "patch": <DraftOutput> }',
    '',
    'Pick "reply" when:',
    '- The user is asking a question, brainstorming, or being unclear about what to change.',
    '- You want to propose options or ask for clarification before mutating the draft.',
    '- The right move is to discuss, not to edit.',
    '',
    'Pick "edit" when:',
    '- The user asked for a concrete change (tighten, swap, add, remove, rewrite, pivot, etc.).',
    '- You have enough information to apply it confidently.',
    '',
    'In "reply" mode the message is your full reply to the user — be specific and conversational, NOT a generic summary. Do not include a patch.',
    'In "edit" mode the message is a short summary of what you changed (it gets shown in the chat history). The patch carries the new draft state and uses the same DraftOutput schema as a fresh draft.',
  ]
    .filter((s) => s !== '')
    .join('\n');
}

function mediaSummary(draft: Draft): string {
  const m = draft.media;
  if (!m) return '(no image attached)';
  const kind = m.kind;
  const alt = m.alt ? ` alt="${m.alt}"` : '';
  if (m.url) return `attached (${kind}, url)${alt}`;
  if (m.bytes && m.mime) return `attached (${kind}, ${m.mime}, ${approxKb(m.bytes)}KB inline)${alt}`;
  return `attached (${kind})${alt}`;
}

function approxKb(base64: string): number {
  // base64 → bytes ratio is ~3/4
  return Math.round((base64.length * 3) / 4 / 1024);
}
