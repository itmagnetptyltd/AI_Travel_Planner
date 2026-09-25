import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { AI_REQUEST_KINDS, AI_REQUEST_STATUSES } from '../../shared/ai-limits';
import { CHAT_ROLES, PROPOSAL_STATUSES } from '../../shared/chat-schemas';
import { CURRENCIES } from '../../shared/currencies';
import { NOTIFICATION_EVENTS } from '../../shared/notification-schemas';
import { PLAN_VERSION_SOURCES } from '../../shared/plan-schemas';
import type { FoodPreference } from '../../shared/food-preferences';
import type { TravelStyle } from '../../shared/travel-styles';
import type { AccommodationPreferences, Interest, Transportation } from '../../shared/trip-preferences';
import { TRIP_STATUSES } from '../../shared/trip-schemas';

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['traveler', 'administrator'] }).notNull(),
  emailConfirmedAt: integer('email_confirmed_at', { mode: 'timestamp_ms' }),
  displayName: text('display_name'),
  preferredCurrency: text('preferred_currency'),
  defaultTravelStyle: text('default_travel_style'),
  foodPreference: text('food_preference'),
  disabledAt: integer('disabled_at', { mode: 'timestamp_ms' }),
  /** The Traveler's own switches for the emails they may turn off (REQ-TRV-060). All start on. */
  notifyTripCreated: integer('notify_trip_created', { mode: 'boolean' }).notNull().default(true),
  notifyItineraryUpdated: integer('notify_itinerary_updated', { mode: 'boolean' }).notNull().default(true),
  notifyTripReminder: integer('notify_trip_reminder', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const sessions = sqliteTable('sessions', {
  idHash: text('id_hash').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
});

export const emailTokens = sqliteTable('email_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  purpose: text('purpose', { enum: ['email-confirmation', 'password-reset'] }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  usedAt: integer('used_at', { mode: 'timestamp_ms' }),
});

export const destinations = sqliteTable('destinations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  description: text('description').notNull(),
  popularActivities: text('popular_activities').notNull(),
  recommendedDurationDays: integer('recommended_duration_days').notNull(),
  travelInformation: text('travel_information').notNull(),
  disabledAt: integer('disabled_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * Dates are calendar dates (`YYYY-MM-DD`), not instants. The number of travelers is
 * never stored: it is always adults plus children. A deleted Trip keeps its row, with
 * `deleted_at` set, so it still holds its Destination (REQ-TRV-095).
 */
export const trips = sqliteTable(
  'trips',
  {
    id: text('id').primaryKey(),
    ownerAccountId: text('owner_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    destinationId: text('destination_id')
      .notNull()
      .references(() => destinations.id, { onDelete: 'restrict' }),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    adults: integer('adults').notNull(),
    children: integer('children').notNull(),
    budget: integer('budget').notNull(),
    currency: text('currency', { enum: CURRENCIES }).notNull(),
    travelStyles: text('travel_styles', { mode: 'json' }).$type<TravelStyle[]>().notNull(),
    interests: text('interests', { mode: 'json' }).$type<Interest[]>().notNull().default([]),
    foodPreferences: text('food_preferences', { mode: 'json' }).$type<FoodPreference[]>().notNull().default([]),
    transportation: text('transportation', { mode: 'json' }).$type<Transportation[]>().notNull().default([]),
    accommodation: text('accommodation', { mode: 'json' }).$type<AccommodationPreferences | null>(),
    status: text('status', { enum: TRIP_STATUSES }).notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    /** Set when the Trip's one reminder is claimed, so it is never sent twice (REQ-TRV-057). */
    reminderSentAt: integer('reminder_sent_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('trips_owner_deleted_idx').on(table.ownerAccountId, table.deletedAt)],
);

/**
 * One row per saved version of a Trip's Plan. `plan_json` is a snapshot of the whole Plan, so every
 * version stands on its own and restoring one is a copy. Version numbers only go up and are never
 * reused; at most ten versions of a Trip are kept.
 */
export const planVersions = sqliteTable(
  'plan_versions',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    source: text('source', { enum: PLAN_VERSION_SOURCES }).notNull(),
    planJson: text('plan_json').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('plan_versions_trip_version_idx').on(table.tripId, table.versionNumber)],
);

/** Only ever added to; rows are never updated or deleted. */
export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  actorAccountId: text('actor_account_id').notNull(),
  action: text('action').notNull(),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * One row per request sent to the AI. The text columns are cleared after 30 days (REQ-TRV-034);
 * the counts and cost stay, so the daily limit and the usage figures survive. There is no foreign
 * key to the account or Trip, so deleting either never deletes the usage record.
 */
export const aiRequests = sqliteTable(
  'ai_requests',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    /** Null for a request that belongs to no Trip: an Administrator's analysis of feedback. */
    tripId: text('trip_id'),
    kind: text('kind', { enum: AI_REQUEST_KINDS }).notNull(),
    status: text('status', { enum: AI_REQUEST_STATUSES }).notNull(),
    requestText: text('request_text'),
    replyText: text('reply_text'),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    costMicroUsd: integer('cost_micro_usd').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('ai_requests_account_kind_created_idx').on(table.accountId, table.kind, table.createdAt)],
);

/** Settings an Administrator changes while the application runs. Values are JSON text. */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * A Trip's chat: what the Traveler said and what the AI answered, oldest first (`seq` orders them within a
 * Trip). An AI message may carry a proposed change to the Plan, and whether it is still waiting. The rows go
 * with the Trip, whether it is deleted for good by the purge or by the account's removal.
 */
export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    role: text('role', { enum: CHAT_ROLES }).notNull(),
    text: text('text').notNull(),
    proposalJson: text('proposal_json'),
    proposalStatus: text('proposal_status', { enum: PROPOSAL_STATUSES }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('chat_messages_trip_seq_idx').on(table.tripId, table.seq)],
);

/**
 * A link to the read-only view of a Trip's Plan (REQ-TRV-058). Only a hash of the token is kept, so a copy of the
 * database yields no working link. `recipient_email` is null for the link in a Traveler's own Plan email.
 */
export const planShares = sqliteTable(
  'plan_shares',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    recipientEmail: text('recipient_email'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('plan_shares_trip_created_idx').on(table.tripId, table.createdAt)],
);

/** When each kind of notification email was last sent for a Trip, so "at most one an hour" can be kept (REQ-TRV-056). */
export const notificationLog = sqliteTable(
  'notification_log',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: NOTIFICATION_EVENTS }).notNull(),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('notification_log_trip_kind_idx').on(table.tripId, table.kind, table.sentAt)],
);

/**
 * A Traveler's feedback on a Trip's Plan: one per Trip, the latest replacing the earlier (REQ-TRV-062). It holds a copy of
 * the Destination and deliberately no account, so the Traveler is reachable only through the Trip. When the Trip is
 * permanently deleted `trip_id` is cleared, and what is left (rating, comment, Destination, date) links to nobody
 * (REQ-TRV-100). `updated_at` is the date the feedback carries.
 */
export const feedback = sqliteTable(
  'feedback',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id').references(() => trips.id, { onDelete: 'set null' }),
    planVersion: integer('plan_version').notNull(),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    destinationName: text('destination_name').notNull(),
    destinationCountry: text('destination_country').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('feedback_trip_idx').on(table.tripId), check('feedback_rating_range', sql`${table.rating} between 1 and 5`)],
);
