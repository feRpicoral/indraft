import type { Config } from '../config/schema';
import type { Draft, DraftOutput, EditResponse, Pillar, SourceItem } from '../types';
import type { LLMProvider, ChatMessage } from '../llm/provider';
import { parseJson, LlmJsonParseError } from '../llm/parse';
import { lint } from '../linter';
import { log } from '../util/logger';
import { stripTrailingHashtagBlock, mergeHashtags } from '../util/hashtag';
import { DraftOutputSchema, EditResponseSchema } from './schema';
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
  /** Aborting cancels the in-flight LLM call. */
  signal?: AbortSignal;
}

export interface GeneratorResult {
  output: DraftOutput;
  linter_warnings: string[];
}

export interface EditGeneratorResult {
  response: EditResponse;
  linter_warnings: string[];
}

/**
 * Draft a new post. Calls the LLM with the structured prompt + caches the
 * profile/source blocks; on linter failure, retries up to cfg.llm.max_retries
 * and surfaces warnings on the final attempt rather than blocking.
 */
export async function draft(deps: GeneratorDeps, args: DraftArgs): Promise<GeneratorResult> {
  const { cfg, llm } = deps;
  const system = buildSystemPrompt(cfg);
  const { messages, cacheBreakpoints } = buildDraftMessages({
    cfg,
    sources: args.sources,
    chosenItem: args.chosenItem,
    targetPillar: args.targetPillar,
    recentPillars: args.recentPillars,
  });
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
      output = parseJson(res.text, DraftOutputSchema);
    } catch (err) {
      if (err instanceof LlmJsonParseError && attempt < maxRetries) {
        log.warn('generator parse failure; retrying', { attempt, error: err.message });
        continue;
      }
      throw err;
    }
    output = stripTrailingTagsFromBody(output);
    const lintRes = lint(output.body, cfg.content.linter, output.verbatim_ranges);
    if (lintRes.ok) return { output, linter_warnings: [] };
    lastOutput = output;
    lastWarnings = lintRes.failures.map((f) => `${f.rule}: ${f.detail}`);
    if (attempt < maxRetries) {
      log.info('linter rejected draft; retrying', { attempt, warnings: lastWarnings });
    }
  }
  if (!lastOutput) throw new Error('generator failed to produce any parseable output');
  return { output: lastOutput, linter_warnings: lastWarnings };
}

/**
 * Apply a conversational chat turn. The LLM chooses between a "reply" turn
 * (no field changes, just a message into chat history) and an "edit" turn
 * (carries a full DraftOutput patch). Linter only runs on edits.
 */
export async function edit(deps: GeneratorDeps, args: EditArgs): Promise<EditGeneratorResult> {
  const { cfg, llm } = deps;
  const system = buildSystemPrompt(cfg, 'edit');
  const ctx: EditContext = {
    cfg,
    sources: args.sources,
    current: args.current,
    message: args.message,
    ...(args.pastedUrl !== undefined ? { pastedUrl: args.pastedUrl } : {}),
    ...(args.pastedSummary !== undefined ? { pastedSummary: args.pastedSummary } : {}),
  };
  const { messages, cacheBreakpoints } = buildEditMessages(ctx);
  const initialVerbatim = args.current.verbatim_ranges;
  const maxRetries = cfg.llm.max_retries;
  let lastResponse: EditResponse | null = null;
  let lastWarnings: string[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await llm.complete({
      system,
      messages,
      model: cfg.llm.draft_model,
      json: true,
      cacheBreakpoints: cfg.llm.prompt_caching ? cacheBreakpoints : [],
      ...(args.signal ? { signal: args.signal } : {}),
    });
    let response: EditResponse;
    try {
      response = parseJson(res.text, EditResponseSchema);
    } catch (err) {
      if (err instanceof LlmJsonParseError && attempt < maxRetries) {
        log.warn('edit parse failure; retrying', { attempt, error: err.message });
        continue;
      }
      throw err;
    }
    if (response.intent === 'reply') return { response, linter_warnings: [] };

    const cleaned = stripTrailingTagsFromBody(response.patch);
    response = { intent: 'edit', message: response.message, patch: cleaned };
    const verbatim = cleaned.verbatim_ranges ?? initialVerbatim;
    const lintRes = lint(cleaned.body, cfg.content.linter, verbatim);
    if (lintRes.ok) return { response, linter_warnings: [] };
    lastResponse = response;
    lastWarnings = lintRes.failures.map((f) => `${f.rule}: ${f.detail}`);
    if (attempt < maxRetries) {
      log.info('linter rejected edit; retrying', { attempt, warnings: lastWarnings });
    }
  }
  if (!lastResponse) throw new Error('generator failed to produce any parseable edit response');
  return { response: lastResponse, linter_warnings: lastWarnings };
}

/**
 * Safety net for models that occasionally append a trailing `#tag` block to
 * the body. Lift any such tags into `hashtags` so the UI never shows them
 * twice.
 */
function stripTrailingTagsFromBody(output: DraftOutput): DraftOutput {
  const stripped = stripTrailingHashtagBlock(output.body);
  if (stripped.body === output.body) return output;
  return {
    ...output,
    body: stripped.body,
    hashtags: mergeHashtags(output.hashtags, stripped.extracted),
  };
}

export { buildSystemPrompt, buildDraftMessages };
export { buildEditMessages };
// Re-export to keep ChatMessage imports stable for callers.
export type { ChatMessage };
