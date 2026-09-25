import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { AI_REQUEST_KINDS, AI_REQUEST_STATUSES } from '../../shared/ai-limits';
import { CURRENCIES } from '../../shared/currencies';
import { PLAN_VERSION_SOURCES } from '../../shared/plan-schemas';
import type { TravelStyle } from '../../shared/travel-styles';
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
    status: text('status', { enum: TRIP_STATUSES }).notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
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
    tripId: text('trip_id').notNull(),
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
