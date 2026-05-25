import type { Draft, DraftOutput, EditTurn } from '../types';

/**
 * Pure reducer for one edit turn. Given the current draft, the user's
 * message, the generator's output, and the optional attachments — produce
 * the patch object the state-machine transition() call needs.
 *
 * This function does NOT touch KV. It returns a deterministic patch that
 * can be unit-tested without any external state.
 */
export interface EditApplyArgs {
  current: Draft;
  userMessage: string;
  output: DraftOutput;
  imageUrl?: string;
  pastedUrl?: string;
}

export function buildEditPatch(args: EditApplyArgs): Partial<Draft> {
  const userTurn: EditTurn = {
    role: 'user',
    content: args.userMessage,
    ...(args.imageUrl !== undefined ? { imageUrl: args.imageUrl } : {}),
    ...(args.pastedUrl !== undefined ? { pastedUrl: args.pastedUrl } : {}),
    ts: Date.now(),
  };
  const assistantTurn: EditTurn = {
    role: 'assistant',
    content: args.output.body,
    ts: Date.now(),
  };
  const patch: Partial<Draft> = {
    body: args.output.body,
    hashtags: args.output.hashtags,
    mentions: args.output.mentions,
    pillar: args.output.pillar,
    source_url: args.output.source_url,
    conversation: [...args.current.conversation, userTurn, assistantTurn],
  };
  if (args.output.verbatim_ranges !== undefined) {
    patch.verbatim_ranges = args.output.verbatim_ranges;
  }
  if (args.output.link) {
    patch.link = { url: args.output.link, placement: args.output.link_placement };
  } else {
    // User asked to drop the link
    patch.link = undefined;
  }
  return patch;
}
