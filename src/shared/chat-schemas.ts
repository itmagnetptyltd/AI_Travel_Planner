import { z } from 'zod';
import type { PlanActivity } from './plan-schemas';

/** ANSWERS.md, "Is the chat conversation kept?": only the last 20 messages are sent to the AI as context. */
export const CHAT_CONTEXT_MESSAGES = 20;
export const CHAT_MESSAGE_MAX_CHARS = 1000;
export const CHAT_REPLY_MAX_CHARS = 2000;

/** Shown in place of a reply that would have given away the instructions the AI was sent (REQ-TRV-040). */
export const CHAT_DECLINE_MESSAGE = 'Sorry, I can only help with this Trip and with travel to its Destination.';

export const CHAT_LIMIT_REACHED = 'CHAT_LIMIT_REACHED';
/** The Plan changed since a change was proposed, so accepting it could overwrite something newer. */
export const PROPOSAL_STALE = 'PROPOSAL_STALE';
export const MESSAGE_NOT_FOUND = 'MESSAGE_NOT_FOUND';
export const PROPOSAL_NOT_PENDING = 'PROPOSAL_NOT_PENDING';

export const chatMessageRequestSchema = z.object({ message: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_CHARS) }).strict();

export const CHAT_ROLES = ['traveler', 'assistant'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

/** How a proposed Activity differs from the Plan on show. */
export type ProposalMark = 'unchanged' | 'added' | 'altered';

export interface ProposedActivity extends PlanActivity {
  readonly mark: ProposalMark;
  /** What an altered Activity was before the change, so the preview can say exactly what differs. */
  readonly previously?: PlanActivity | undefined;
}

/** One Day a chat change would alter: what it would hold, marked, and what it would lose. */
export interface ProposedDay {
  readonly dayNumber: number;
  readonly date: string;
  readonly activities: readonly ProposedActivity[];
  readonly removed: readonly PlanActivity[];
}

export const PROPOSAL_STATUSES = ['pending', 'accepted', 'rejected'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/** A change to the Plan proposed in the chat, shown as a preview until the Traveler accepts or rejects it. */
export interface ChatProposal {
  /** The Plan version the change was made for; it can be accepted only while that is still the current one. */
  readonly basePlanVersion: number;
  readonly status: ProposalStatus;
  readonly days: readonly ProposedDay[];
}

export interface ChatMessage {
  readonly id: string;
  readonly role: ChatRole;
  readonly text: string;
  readonly createdAt: string;
  readonly proposal: ChatProposal | null;
}
