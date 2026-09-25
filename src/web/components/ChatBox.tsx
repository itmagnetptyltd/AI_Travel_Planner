import { useEffect, useRef, type FormEvent } from 'react';
import type { Currency } from '../../shared/currencies';
import type { SavedPlan } from '../../shared/plan-schemas';
import { ChatProposal } from './ChatProposal';
import { proposalIsOutOfDate, roleLabel } from './chat-view-state';
import { useChat } from './use-chat';

/**
 * The chat box on a Trip that has a Plan. The Traveler asks questions or asks for changes; a change is shown as
 * a preview to accept or reject. Every message goes to the server, which is the only thing that talks to the AI.
 * `planVersion` is the Plan on show, so a suggestion made for an older one is shown as out of date. `onBusyChange`
 * tells the Plan section when the chat is working, so the two never change the Plan at once.
 */
export function ChatBox({ tripId, planVersion, currency, isBusy, onBusyChange, onPlanChanged }: {
  readonly tripId: string;
  readonly planVersion: number;
  readonly currency: Currency;
  readonly isBusy: boolean;
  readonly onBusyChange: (isChatBusy: boolean) => void;
  readonly onPlanChanged: (plan: SavedPlan) => void;
}) {
  const chat = useChat(tripId, onPlanChanged);
  const messageBox = useRef<HTMLTextAreaElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const isChatBusy = chat.isSending || chat.isDeciding;
  useEffect(() => onBusyChange(isChatBusy), [isChatBusy, onBusyChange]);
  const isWorking = isChatBusy || isBusy;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void chat.send().then(() => messageBox.current?.focus());
  };
  const decide = (decision: () => Promise<void>) => () => void decision().then(() => heading.current?.focus());

  return (
    <section aria-labelledby="chat-heading">
      <h2 id="chat-heading" ref={heading} tabIndex={-1}>
        Chat
      </h2>
      {chat.isLoading ? <p>Loading the chat…</p> : null}
      {chat.messages.length > 0 ? (
        <ul aria-label="Chat messages">
          {chat.messages.map((message) => (
            <li key={message.id}>
              <strong>{roleLabel(message.role)}</strong> <span className="chat-text">{message.text}</span>
              {message.proposal ? (
                <ChatProposal
                  proposal={message.proposal}
                  currency={currency}
                  isOutOfDate={proposalIsOutOfDate(message.proposal, planVersion)}
                  isBusy={isWorking}
                  onAccept={decide(() => chat.accept(message.id))}
                  onReject={decide(() => chat.reject(message.id))}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="chat-message">Message</label>
          <textarea
            id="chat-message"
            ref={messageBox}
            rows={2}
            maxLength={1000}
            value={chat.draft}
            onChange={(event) => chat.setDraft(event.target.value)}
          />
        </div>
        <button type="submit" disabled={isWorking || chat.isLoading || chat.draft.trim() === ''}>
          Send
        </button>
      </form>
      <div aria-live="polite">{chat.announcement}</div>
      {chat.problem ? <p role="alert">{chat.problem}</p> : null}
    </section>
  );
}
