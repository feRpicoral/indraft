import { describe, expect, it } from 'vitest';
import { resolveChatSendDraft } from '@/app/review/chatSend';
import type { EditTurn } from '@/lib/types';

const pendingTurn: EditTurn = {
  role: 'user',
  content: 'tighten this https://example.com/source',
  pastedUrl: 'https://example.com/source',
  ts: 1,
};

describe('resolveChatSendDraft', () => {
  it('uses typed text when present', () => {
    const draft = resolveChatSendDraft('rewrite the opener', pendingTurn);

    expect(draft).toEqual({ text: 'rewrite the opener' });
  });

  it('resends the pending turn when the input is empty', () => {
    const draft = resolveChatSendDraft('', pendingTurn);

    expect(draft).toEqual({
      text: 'tighten this https://example.com/source',
      pastedUrl: 'https://example.com/source',
    });
  });

  it('does not send empty input without a pending turn', () => {
    const draft = resolveChatSendDraft('   ', null);

    expect(draft).toBeNull();
  });
});
