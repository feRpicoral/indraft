import type { Config } from '../config/schema';
import type { Draft, DraftOutput, Pillar, SourceItem } from '../types';
import type { LLMProvider } from '../llm/provider';
import { parseJson, LlmJsonParseError } from '../llm/parse';
import { lint } from '../linter';
import { log } from '../util/logger';
import { stripTrailingHashtagBlock, mergeHashtags } from '../util/hashtag';
import { DraftOutputSchema } from './schema';
import { buildDraftMessages, buildSystemPrompt } from './prompt';
import { buildEditMessages, type EditContext } from './editPrompt';

export interface GeneratorDeps {
  cfg: Config;
  llm: LLMProvider;
}

export interface DraftArgs {
  sources: SourceItem[];
  chosenItem: SourceItem;
  targetPillar: Pillar;
  recentPillars: Pillar[];
}

export interface EditArgs {
  current: Draft;
  message: string;
  sources: SourceItem[];
  pastedUrl?: string;
  pastedSummary?: string;
}

export interface GeneratorResult {
  output: DraftOutput;
  linter_warnings: string[];
}

/**
 * Draft a new post. Calls the LLM with the structured prompt + caches the
 * profile/source blocks; on linter failure, retries up to cfg.llm.max_retries
 * and surfaces warnings on the final attempt rather than blocking.
 */
export async function draft(deps: GeneratorDeps, args: DraftArgs): Promise<GeneratorResult> {
  const { cfg } = deps;
  const system = buildSystemPrompt(cfg);
  const { messages, cacheBreakpoints } = buildDraftMessages({
    cfg,
    sources: args.sources,
    chosenItem: args.chosenItem,
    targetPillar: args.targetPillar,
    recentPillars: args.recentPillars,
  });
  return runWithRetry(deps, system, messages, cacheBreakpoints);
}

/**
 * Apply a conversational edit. The current draft, prior turns, the new user
 * message, and any attachments feed the same JSON-output contract.
 */
export async function edit(deps: GeneratorDeps, args: EditArgs): Promise<GeneratorResult> {
  const { cfg } = deps;
  const system = buildSystemPrompt(cfg);
  const ctx: EditContext = {
    cfg,
    sources: args.sources,
    current: args.current,
    message: args.message,
    ...(args.pastedUrl !== undefined ? { pastedUrl: args.pastedUrl } : {}),
    ...(args.pastedSummary !== undefined ? { pastedSummary: args.pastedSummary } : {}),
  };
  const { messages, cacheBreakpoints } = buildEditMessages(ctx);
  return runWithRetry(deps, system, messages, cacheBreakpoints, args.current.verbatim_ranges);
}

async function runWithRetry(
  deps: GeneratorDeps,
  system: string,
  messages: import('../llm/provider').ChatMessage[],
  cacheBreakpoints: number[],
  initialVerbatim?: Array<[number, number]>,
): Promise<GeneratorResult> {
  const { cfg, llm } = deps;
  const maxRetries = cfg.llm.max_retries;
  let lastOutput: DraftOutput | null = null;
  let lastWarnings: string[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await llm.complete({
      system,
      messages,
      model: cfg.llm.draft_model,
      json: true,
      cacheBreakpoints: cfg.llm.prompt_caching ? cacheBreakpoints : [],
    });
    let output: DraftOutput;
    try {
      const parsed = parseJson(res.text, DraftOutputSchema);
      // Zod's ZodEffects (from superRefine) loses the `.default('text')` in
      // its output-type inference, so normalize content_kind explicitly here.
      output = {
        ...parsed,
        content_kind: parsed.content_kind ?? (parsed.article ? 'article' : 'text'),
      };
    } catch (err) {
      if (err instanceof LlmJsonParseError && attempt < maxRetries) {
        log.warn('generator parse failure; retrying', { attempt, error: err.message });
        continue;
      }
      throw err;
    }
    // Safety net: even with explicit prompt instructions, models sometimes
    // append a trailing #tag block to the body. Lift it into the hashtags
    // array and clean the body so the UI never shows tags twice.
    const stripped = stripTrailingHashtagBlock(output.body);
    if (stripped.body !== output.body) {
      output = {
        ...output,
        body: stripped.body,
        hashtags: mergeHashtags(output.hashtags, stripped.extracted),
      };
    }
    const verbatim = output.verbatim_ranges ?? initialVerbatim;
    const lintRes = lint(output.body, cfg.content.linter, verbatim);
    if (lintRes.ok) {
      return { output, linter_warnings: [] };
    }
    lastOutput = output;
    lastWarnings = lintRes.failures.map((f) => `${f.rule}: ${f.detail}`);
    if (attempt < maxRetries) {
      log.info('linter rejected draft; retrying', { attempt, warnings: lastWarnings });
    }
  }
  // Out of retries — surface the best attempt with warnings rather than block.
  if (!lastOutput) throw new Error('generator failed to produce any parseable output');
  return { output: lastOutput, linter_warnings: lastWarnings };
}

export { buildSystemPrompt, buildDraftMessages };
export { buildEditMessages };
