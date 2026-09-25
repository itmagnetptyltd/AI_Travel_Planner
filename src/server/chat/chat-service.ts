import { requestTextOf, type AiReply, type AiService } from '../ai/ai-service';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import type { TripService } from '../trips/trip-service';
import { CHAT_CONTEXT_MESSAGES, type ChatMessage } from '../../shared/chat-schemas';
import type { SavedPlan } from '../../shared/plan-schemas';
import { createAiCaller, type AiCaller, type AiUnavailable, type LimitReached } from '../plans/ai-call';
import type { AiUsageLimitService } from '../plans/ai-usage-limit-service';
import { promptInputForTrip } from '../plans/plan-request-context';
import type { PlanGenerationSettings } from '../plans/plan-service';
import type { PlanStore } from '../plans/plan-store';
import { applyProposal, buildProposal, estimatedTotalsOf } from './chat-proposal';
import { buildChatPrompt } from './chat-prompt';
import { parseChatReply } from './chat-reply';
import type { ChatStore } from './chat-store';

export type SendResult =
  | { readonly ok: true; readonly messages: readonly [ChatMessage, ChatMessage] }
  | { readonly ok: false; readonly error: 'not-found' | 'no-plan' }
  | AiUnavailable
  | LimitReached;

export type ListResult = { readonly ok: true; readonly messages: readonly ChatMessage[] } | { readonly ok: false; readonly error: 'not-found' };

type DecisionProblem = 'not-found' | 'message-not-found' | 'not-pending';

export type AcceptResult =
  | { readonly ok: true; readonly plan: SavedPlan; readonly message: ChatMessage }
  | { readonly ok: false; readonly error: DecisionProblem | 'stale' };

export type RejectResult = { readonly ok: true; readonly message: ChatMessage } | { readonly ok: false; readonly error: DecisionProblem };

/** A Trip's chat: questions answered, and changes to the Plan proposed for the Traveler to accept or reject. */
export interface ChatService {
  send(ownerId: string, tripId: string, message: string): Promise<SendResult>;
  list(ownerId: string, tripId: string): ListResult;
  /** Puts a proposed change on the Plan as a new version. Only while the Plan is still the one it was made for. */
  accept(ownerId: string, tripId: string, messageId: string): AcceptResult;
  reject(ownerId: string, tripId: string, messageId: string): RejectResult;
}

export function createChatService(deps: {
  readonly db: TrvDatabase;
  readonly clock: Clock;
  readonly ai: AiService;
  readonly trips: TripService;
  readonly limits: AiUsageLimitService;
  readonly store: PlanStore;
  readonly chat: ChatStore;
  readonly settings: PlanGenerationSettings;
}): ChatService {
  const { db, trips, store, chat, settings } = deps;
  const caller: AiCaller = createAiCaller(deps);

  const unusable = (recordId: string, reply: AiReply, problem: string): AiUnavailable => {
    caller.settle(recordId, 'failed', reply);
    return { ok: false, error: 'ai-unavailable', reason: `The AI reply was not a usable chat reply (${problem}).` };
  };

  /** The messages that belong to an AI reply carrying a proposal, or the problem in finding one. */
  const pendingProposal = (ownerId: string, tripId: string, messageId: string) => {
    if (!trips.getForOwner(ownerId, tripId)) return { ok: false, error: 'not-found' } as const;
    const message = chat.find(tripId, messageId);
    if (!message?.proposal) return { ok: false, error: 'message-not-found' } as const;
    if (message.proposal.status !== 'pending') return { ok: false, error: 'not-pending' } as const;
    return { ok: true, proposal: message.proposal } as const;
  };

  return {
    async send(ownerId, tripId, text) {
      const trip = trips.getForOwner(ownerId, tripId);
      const input = trip ? promptInputForTrip(db, trip, settings.destinationTextMaxChars) : null;
      if (!trip || !input) return { ok: false, error: 'not-found' };
      const plan = store.current(tripId);
      if (!plan) return { ok: false, error: 'no-plan' };

      const history = chat.recent(tripId, CHAT_CONTEXT_MESSAGES).map(({ role, text: said }) => ({ role, text: said }));
      const prompt = buildChatPrompt({ trip: input, plan, history, message: text });
      const reservation = caller.reserve('chat', ownerId, tripId, requestTextOf(prompt));
      if (!reservation.ok) return reservation;
      const answer = await caller.ask(reservation.recordId, prompt);
      if ('refusal' in answer) return answer.refusal;

      const reply = parseChatReply(answer.reply.text, { instructions: prompt.system });
      if (!reply.ok) return unusable(reservation.recordId, answer.reply, reply.problem);
      const proposed = buildProposal(plan, reply.changes);
      if (!proposed.ok) return unusable(reservation.recordId, answer.reply, proposed.error);

      const proposal =
        proposed.days.length > 0
          ? { basePlanVersion: plan.version, days: proposed.days, estimatedTotal: estimatedTotalsOf(plan, proposed.days) }
          : undefined;
      return caller.saveWithin(reservation.recordId, answer.reply, (tx): SendResult => {
        if (!trips.getForOwner(ownerId, tripId)) return { ok: false, error: 'not-found' };
        const entry = { role: 'assistant', text: reply.reply, ...(proposal ? { proposal } : {}) } as const;
        return { ok: true, messages: chat.appendExchange(tripId, { role: 'traveler', text }, entry, tx) };
      });
    },

    list(ownerId, tripId) {
      return trips.getForOwner(ownerId, tripId) ? { ok: true, messages: chat.list(tripId) } : { ok: false, error: 'not-found' };
    },

    accept(ownerId, tripId, messageId) {
      const found = pendingProposal(ownerId, tripId, messageId);
      if (!found.ok) return found;
      const current = store.current(tripId);
      if (!current || current.version !== found.proposal.basePlanVersion) return { ok: false, error: 'stale' };
      return db.transaction((tx): AcceptResult => {
        const plan = store.save(tripId, applyProposal(current, found.proposal.days), 'chat', tx);
        const message = chat.setProposalStatus(tripId, messageId, 'accepted', tx);
        // Cannot happen after the message was found above; throwing rolls the new version back rather than keeping it.
        if (!message) throw new Error('The proposal being accepted disappeared while it was accepted.');
        return { ok: true, plan, message };
      });
    },

    reject(ownerId, tripId, messageId) {
      const found = pendingProposal(ownerId, tripId, messageId);
      if (!found.ok) return found;
      const message = chat.setProposalStatus(tripId, messageId, 'rejected');
      return message ? { ok: true, message } : { ok: false, error: 'message-not-found' };
    },
  };
}
