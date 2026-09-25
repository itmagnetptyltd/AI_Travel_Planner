import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { chatMessages } from '../db/schema';
import type { ChatMessage, ChatRole, EstimatedTotals, ProposalStatus, ProposedDay } from '../../shared/chat-schemas';
import { ACTIVITY_CATEGORIES } from '../../shared/plan-schemas';
import type { Executor } from '../plans/plan-store';

/** One message to add: what was said and, for an AI message, the change it proposes. */
export interface NewChatEntry {
  readonly role: ChatRole;
  readonly text: string;
  readonly proposal?: { readonly basePlanVersion: number; readonly days: readonly ProposedDay[]; readonly estimatedTotal: EstimatedTotals };
}

export interface ChatStore {
  /** Adds messages to a Trip's chat, in order. Pass `within` to make it part of a transaction the caller has open. */
  append(tripId: string, entries: readonly NewChatEntry[], within?: Executor): ChatMessage[];
  /** Adds a Traveler's message and the reply to it, together. */
  appendExchange(tripId: string, message: NewChatEntry, reply: NewChatEntry, within?: Executor): readonly [ChatMessage, ChatMessage];
  /** The whole conversation, oldest first. */
  list(tripId: string): ChatMessage[];
  /** The `count` most recent messages, oldest first. */
  recent(tripId: string, count: number): ChatMessage[];
  find(tripId: string, messageId: string): ChatMessage | null;
  /** Marks a proposal accepted or rejected. Null when the message has no proposal. */
  setProposalStatus(tripId: string, messageId: string, status: ProposalStatus, within?: Executor): ChatMessage | null;
}

type Row = typeof chatMessages.$inferSelect;

const storedActivity = z.object({
  id: z.string(),
  title: z.string(),
  startTime: z.string(),
  durationMinutes: z.number(),
  estimatedCost: z.number(),
  location: z.string(),
  reason: z.string(),
  category: z.enum(ACTIVITY_CATEGORIES),
  changedByHand: z.boolean(),
});

const storedProposal = z.object({
  basePlanVersion: z.number(),
  estimatedTotal: z.object({ before: z.number(), after: z.number() }).optional(),
  days: z.array(
    z.object({
      dayNumber: z.number(),
      date: z.string(),
      activities: z.array(storedActivity.extend({ mark: z.enum(['unchanged', 'added', 'altered']), previously: storedActivity.optional() })),
      removed: z.array(storedActivity),
    }),
  ),
});

/**
 * A stored proposal is data read back from disk, so it is checked, never trusted. One that fails the check is
 * shown as a message with no suggestion, so a single bad row cannot make the whole conversation unreadable.
 */
function messageOf(row: Row): ChatMessage {
  if (row.proposalJson === null || row.proposalStatus === null) {
    return { id: row.id, role: row.role, text: row.text, createdAt: row.createdAt.toISOString(), proposal: null };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(row.proposalJson);
  } catch {
    raw = undefined;
  }
  const parsed = storedProposal.safeParse(raw);
  if (!parsed.success) return { id: row.id, role: row.role, text: row.text, createdAt: row.createdAt.toISOString(), proposal: null };
  return {
    id: row.id,
    role: row.role,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    proposal: { basePlanVersion: parsed.data.basePlanVersion, status: row.proposalStatus, days: parsed.data.days, estimatedTotal: parsed.data.estimatedTotal },
  };
}

export function createChatStore(deps: { readonly db: TrvDatabase; readonly clock: Clock }): ChatStore {
  const { db, clock } = deps;

  const write = (tx: Executor, tripId: string, entries: readonly NewChatEntry[]): ChatMessage[] => {
    const now = clock.now();
    let seq = tx.select({ last: max(chatMessages.seq) }).from(chatMessages).where(eq(chatMessages.tripId, tripId)).get()?.last ?? 0;
    return entries.map((entry) => {
      seq += 1;
      const row: Row = {
        id: randomUUID(),
        tripId,
        seq,
        role: entry.role,
        text: entry.text,
        proposalJson: entry.proposal
          ? JSON.stringify({ basePlanVersion: entry.proposal.basePlanVersion, days: entry.proposal.days, estimatedTotal: entry.proposal.estimatedTotal })
          : null,
        proposalStatus: entry.proposal ? 'pending' : null,
        createdAt: now,
      };
      tx.insert(chatMessages).values(row).run();
      return messageOf(row);
    });
  };

  const append: ChatStore['append'] = (tripId, entries, within) =>
    within ? write(within, tripId, entries) : db.transaction((tx) => write(tx, tripId, entries));

  return {
    append,

    appendExchange(tripId, message, reply, within) {
      const [first, second] = append(tripId, [message, reply], within);
      if (!first || !second) throw new Error('Saving a chat exchange did not save both messages.');
      return [first, second];
    },

    list(tripId) {
      return db.select().from(chatMessages).where(eq(chatMessages.tripId, tripId)).orderBy(asc(chatMessages.seq)).all().map(messageOf);
    },

    recent(tripId, count) {
      return db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.tripId, tripId))
        .orderBy(desc(chatMessages.seq))
        .limit(count)
        .all()
        .reverse()
        .map(messageOf);
    },

    find(tripId, messageId) {
      const row = db.select().from(chatMessages).where(and(eq(chatMessages.tripId, tripId), eq(chatMessages.id, messageId))).get();
      return row ? messageOf(row) : null;
    },

    setProposalStatus(tripId, messageId, status, within = db) {
      const where = and(eq(chatMessages.tripId, tripId), eq(chatMessages.id, messageId));
      within.update(chatMessages).set({ proposalStatus: status }).where(where).run();
      const row = within.select().from(chatMessages).where(where).get();
      return row && row.proposalJson !== null ? messageOf(row) : null;
    },
  };
}
