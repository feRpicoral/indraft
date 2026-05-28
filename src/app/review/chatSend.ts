import type { EditTurn } from '@/lib/types';

const URL_RE = /(https?:\/\/[^\s]+)/g;

export interface ChatSendDraft {
  text: string;
  pastedUrl?: string;
}

export function resolveChatSendDraft(message: string, pendingTurn: EditTurn | null): ChatSendDraft | null {
  const typed = message.trim().length > 0;
  const text = typed ? message : (pendingTurn?.content ?? '');
  if (!text.trim()) return null;
  const pastedUrl = extractFirstUrl(text) ?? (!typed ? pendingTurn?.pastedUrl : undefined);
  return {
    text,
    ...(pastedUrl !== undefined ? { pastedUrl } : {}),
  };
}

function extractFirstUrl(s: string): string | undefined {
  const m = s.match(URL_RE);
  return m?.[0];
}
