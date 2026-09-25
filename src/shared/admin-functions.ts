import { z } from 'zod';
/**
 * The admin functions offered to an Administrator, and nothing else (REQ-TRV-068).
 * Site text and email templates are fixed in code and are deliberately absent.
 * Each has a page of its own.
 * Stored AI requests are not a sixth function: they are reached from the AI usage limits page.
 */
export const ADMIN_FUNCTIONS = Object.freeze([
  { key: 'users', label: 'Users', path: '/admin/users' },
  { key: 'destinations', label: 'Destinations', path: '/admin/destinations' },
  { key: 'feedback', label: 'Feedback', path: '/admin/feedback' },
  { key: 'notification-settings', label: 'Notification settings', path: '/admin/notification-settings' },
  { key: 'ai-usage-limits', label: 'AI usage limits', path: '/admin/ai-usage-limits' },
] as const);

export type AdminFunction = (typeof ADMIN_FUNCTIONS)[number];

/** What an Administrator may do to a user account (REQ-TRV-071). No profile edit, no delete. */
export const ACCOUNT_ACTIONS = ['view', 'disable', 'enable', 'change-role'] as const;
export type AccountAction = (typeof ACCOUNT_ACTIONS)[number];

export const ROLES = ['traveler', 'administrator'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Readonly<Record<Role, string>> = { traveler: 'Traveler', administrator: 'Administrator' };

/** A role that can be held. A Travel Consultant is a future enhancement, so there is no such role to give (REQ-TRV-079). */
export const roleSchema = z.enum(ROLES);
