import {
  CHAT_LIMIT_REACHED,
  MESSAGE_NOT_FOUND,
  PROPOSAL_NOT_PENDING,
  PROPOSAL_STALE,
  type ChatMessage,
  type ChatProposal,
  type ChatRole,
  type ProposalStatus,
  type ProposedDay,
} from '../../shared/chat-schemas';
import { AI_UNAVAILABLE, AI_UNAVAILABLE_MESSAGE, type PlanActivity } from '../../shared/plan-schemas';
import type { ApiError } from '../api-client';
import { activityHeading } from '../pages/plan-view-state';

export const roleLabel = (role: ChatRole): string => (role === 'traveler' ? 'You' : 'AI');

export interface ProposalLine {
  readonly key: string;
  /** In words, so a change is never shown by colour alone. */
  readonly label: 'Added' | 'Changed' | 'Unchanged' | 'Removed';
  readonly text: string;
  /** How long it takes, what it costs and where, so a change to any of them is seen before it is accepted. */
  readonly details: string;
  /** For a Changed Activity, what it was before. */
  readonly was: string | null;
}

const MARK_LABELS = { added: 'Added', altered: 'Changed', unchanged: 'Unchanged' } as const;

const detailsOf = (activity: PlanActivity): string => `${activity.durationMinutes} min, cost ${activity.estimatedCost}, ${activity.location}`;

/** A Day a chat change would alter, one line per Activity: what it would hold, marked, then what it would lose (REQ-TRV-038). */
export function proposalLines(day: ProposedDay): readonly ProposalLine[] {
  return [
    ...day.activities.map(
      (activity): ProposalLine => ({
        key: activity.id,
        label: MARK_LABELS[activity.mark],
        text: activityHeading(activity),
        details: detailsOf(activity),
        was: activity.previously ? `${activity.previously.startTime}, ${detailsOf(activity.previously)}` : null,
      }),
    ),
    ...day.removed.map((activity): ProposalLine => ({ key: `removed-${activity.id}`, label: 'Removed', text: activityHeading(activity), details: detailsOf(activity), was: null })),
  ];
}

/** Named for the suggestion, so it is not mistaken for the Plan's own heading for the same Day. */
export const suggestedChangeHeading = (day: ProposedDay): string => `Suggested change for Day ${day.dayNumber}`;

export const replaceMessage = (messages: readonly ChatMessage[], updated: ChatMessage): ChatMessage[] =>
  messages.map((message) => (message.id === updated.id ? updated : message));

/** New messages after the ones on show, none twice, and the newer copy of any that were already there. */
export function mergeMessages(shown: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] {
  const incomingById = new Map(incoming.map((message) => [message.id, message]));
  const shownIds = new Set(shown.map((message) => message.id));
  return [...shown.map((message) => incomingById.get(message.id) ?? message), ...incoming.filter((message) => !shownIds.has(message.id))];
}

/** A suggestion still waiting, made for a Plan that has changed since, can no longer be accepted. */
export const proposalIsOutOfDate = (proposal: ChatProposal, planVersion: number): boolean =>
  proposal.status === 'pending' && proposal.basePlanVersion !== planVersion;

export const decisionLabel = (status: ProposalStatus): 'Accepted' | 'Rejected' | null => {
  if (status === 'accepted') return 'Accepted';
  return status === 'rejected' ? 'Rejected' : null;
};

const KNOWN_MESSAGES = [CHAT_LIMIT_REACHED, PROPOSAL_STALE, PROPOSAL_NOT_PENDING, MESSAGE_NOT_FOUND];
const PLAIN_PROBLEM = 'The message could not be sent. Try again.';

/** What to tell the Traveler when the chat could not do what they asked. */
export function chatProblem(error: ApiError): string {
  if (error.code === AI_UNAVAILABLE) return error.message ?? AI_UNAVAILABLE_MESSAGE;
  if (KNOWN_MESSAGES.includes(error.code) && error.message) return error.message;
  if (error.field === 'message') return 'Check the message: it must be between 1 and 1000 characters.';
  return error.message ?? PLAIN_PROBLEM;
}
