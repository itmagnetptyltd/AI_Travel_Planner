import type { Currency } from './currencies';
import type { SharedPlanView } from './share-schemas';
import type { TripStatus } from './trip-schemas';

export const PLAN_NOT_AVAILABLE = 'PLAN_NOT_AVAILABLE';
export const PLAN_NOT_AVAILABLE_MESSAGE =
  'The full Plan of a Trip can be opened only when the Trip has feedback, so that the feedback can be understood.';

/**
 * A Traveler's Trip as an Administrator sees it: who owns it, where and when, for how many, at what budget, and its
 * feedback, and no Days or Activities (REQ-TRV-070, REQ-TRV-101).
 */
export interface AdminTripSummary {
  readonly id: string;
  readonly name: string;
  /** The owner's email address, which is how an Administrator knows them. No account identifier is given. */
  readonly owner: { readonly email: string };
  readonly destination: { readonly name: string; readonly country: string };
  readonly startDate: string;
  readonly endDate: string;
  readonly numberOfTravelers: number;
  readonly budget: number;
  readonly currency: Currency;
  readonly status: TripStatus;
  readonly feedback: { readonly rating: number; readonly comment: string | null } | null;
}

/** A Trip's Plan as an Administrator sees it: the same read-only view a shared link gives, with no expiry since there is no link. */
export type AdminPlanView = Omit<SharedPlanView, 'expiresAt'>;
