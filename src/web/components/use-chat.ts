import { useCallback, useEffect, useRef, useState } from 'react';
import { PROPOSAL_NOT_PENDING, PROPOSAL_STALE, type ChatMessage } from '../../shared/chat-schemas';
import type { SavedPlan } from '../../shared/plan-schemas';
import { api } from '../api-client';
import { chatProblem, mergeMessages, replaceMessage } from './chat-view-state';
import { endingOf, foldStreamEvent, NOTHING_STREAMED, streamChatMessage } from './chat-stream';

export interface ChatController {
  readonly messages: readonly ChatMessage[];
  readonly draft: string;
  readonly setDraft: (text: string) => void;
  readonly isLoading: boolean;
  readonly isSending: boolean;
  readonly isDeciding: boolean;
  /** Why the last thing the Traveler did did not work. Nothing else in the chat is hidden by it. */
  readonly problem: string | null;
  /** Said to a screen reader as the chat changes: that the AI is answering, and that it has. */
  readonly announcement: string;
  /** While a reply is arriving: what was asked, and as much of the reply as has come. Null the rest of the time. */
  readonly arriving: { readonly question: string; readonly reply: string } | null;
  readonly send: () => Promise<void>;
  readonly accept: (messageId: string) => Promise<void>;
  readonly reject: (messageId: string) => Promise<void>;
}

/**
 * A Trip's chat. What was said is kept on the server and shown again when the Trip is reopened. When a message
 * fails, nothing is added to the conversation and what the Traveler typed stays in the box, so it can be sent
 * again. `onPlanChanged` runs with the new Plan when the Traveler accepts a proposed change.
 */
export function useChat(tripId: string, onPlanChanged: (plan: SavedPlan) => void): ChatController {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isDeciding, setIsDeciding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [arriving, setArriving] = useState<{ readonly question: string; readonly reply: string } | null>(null);
  const chatPath = `/api/trips/${encodeURIComponent(tripId)}/chat`;
  // A reply can take up to two minutes; a Traveler who has left the page by then must not have it drawn into another Trip's chat.
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, [tripId]);

  const load = useCallback(async (isCurrent: () => boolean) => {
    const result = await api<{ messages: readonly ChatMessage[] }>('GET', chatPath);
    if (!isCurrent()) return;
    if (result.ok) setMessages((previous) => mergeMessages(previous, result.data.messages));
    else setProblem(chatProblem(result.error));
    setIsLoading(false);
  }, [chatPath]);

  useEffect(() => {
    let isCurrent = true;
    void load(() => isCurrent);
    return () => {
      isCurrent = false;
    };
  }, [load]);

  const send = async () => {
    const text = draft.trim();
    if (text === '' || isLoading) return;
    setProblem(null);
    setIsSending(true);
    setAnnouncement('Waiting for the AI to answer.');
    setArriving({ question: text, reply: '' });
    let reply = NOTHING_STREAMED;
    const started = await streamChatMessage(chatPath, text, (event) => {
      reply = foldStreamEvent(reply, event);
      if (isMounted.current) setArriving({ question: text, reply: reply.text });
    });
    if (!isMounted.current) return;
    setIsSending(false);
    setArriving(null);
    const ending = endingOf(started, reply);
    if (ending.kind === 'problem') {
      setAnnouncement('');
      setProblem(chatProblem(ending.error));
      if (ending.shouldReloadChat) await load(() => isMounted.current);
      return;
    }
    setMessages((previous) => mergeMessages(previous, ending.messages));
    // Only what was sent is cleared: anything typed while the AI was answering is the Traveler's next message.
    setDraft((current) => (current.trim() === text ? '' : current));
    setAnnouncement('The AI has replied.');
  };

  const decide = async (messageId: string, decision: 'accept' | 'reject') => {
    setProblem(null);
    setIsDeciding(true);
    const result = await api<{ plan?: SavedPlan; message: ChatMessage }>('POST', `${chatPath}/${encodeURIComponent(messageId)}/${decision}`);
    setIsDeciding(false);
    if (!result.ok) {
      setProblem(chatProblem(result.error));
      // A suggestion that has gone stale, or was decided elsewhere, is read again so it is shown as it now is.
      if ([PROPOSAL_STALE, PROPOSAL_NOT_PENDING].includes(result.error.code)) await load(() => true);
      return;
    }
    setMessages((previous) => replaceMessage(previous, result.data.message));
    if (result.data.plan) onPlanChanged(result.data.plan);
  };

  return {
    messages,
    draft,
    setDraft,
    isLoading,
    isSending,
    isDeciding,
    problem,
    announcement,
    arriving,
    send,
    accept: (messageId) => decide(messageId, 'accept'),
    reject: (messageId) => decide(messageId, 'reject'),
  };
}
