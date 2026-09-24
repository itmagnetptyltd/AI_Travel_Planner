import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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

/** Only ever added to; rows are never updated or deleted. */
export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  actorAccountId: text('actor_account_id').notNull(),
  action: text('action').notNull(),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
});
