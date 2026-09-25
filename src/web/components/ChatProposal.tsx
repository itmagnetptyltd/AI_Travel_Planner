import type { ChatProposal as Proposal } from '../../shared/chat-schemas';
import type { Currency } from '../../shared/currencies';
import { totalChangeLabel } from './budget-view-state';
import { decisionLabel, proposalLines, suggestedChangeHeading } from './chat-view-state';

/**
 * A change the AI proposes to the Plan, shown as a preview until the Traveler decides: each Day it would alter,
 * every Activity marked in words as Added, Changed, Unchanged or Removed, with its duration, cost and place, and
 * for a Changed one what it was. The Plan itself does not change until Accept (REQ-TRV-037, REQ-TRV-038). A
 * suggestion made for a Plan that has since changed cannot be accepted, and says so. Once decided it is only a
 * line saying which way it went.
 */
export function ChatProposal({ proposal, currency, isOutOfDate, isBusy, onAccept, onReject }: {
  readonly proposal: Proposal;
  readonly currency: Currency;
  readonly isOutOfDate: boolean;
  readonly isBusy: boolean;
  readonly onAccept: () => void;
  readonly onReject: () => void;
}) {
  const decided = decisionLabel(proposal.status);
  if (decided) return <p className="muted">{decided}</p>;
  // Worked out against the Plan it was made for, so once that Plan has moved on the figures no longer match the budget on show.
  const totalChange = isOutOfDate ? null : totalChangeLabel(proposal.estimatedTotal, currency);
  return (
    <div role="group" aria-label="Suggested change">
      {proposal.days.map((day) => (
        <div key={day.dayNumber}>
          <strong>{suggestedChangeHeading(day)}</strong> <span className="muted">{day.date}</span>
          <ul>
            {proposalLines(day).map((line) => (
              <li key={line.key}>
                <strong>{line.label}</strong> {line.text}. <span className="muted">{line.details}.</span>
                {line.was ? <span className="muted">{` Was: ${line.was}.`}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {totalChange ? <p>{totalChange}</p> : null}
      {isOutOfDate ? (
        <p className="muted">Out of date: the Plan has changed since this was suggested. Ask again if you still want it.</p>
      ) : (
        <button type="button" disabled={isBusy} onClick={onAccept}>
          Accept
        </button>
      )}
      <button type="button" disabled={isBusy} onClick={onReject}>
        Reject
      </button>
    </div>
  );
}
