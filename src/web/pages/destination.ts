import type { DestinationInput } from '../../shared/destination-schemas';

export interface Destination extends DestinationInput {
  readonly id: string;
  readonly isDisabled: boolean;
}

export interface DestinationSummary {
  readonly id: string;
  readonly name: string;
  readonly country: string;
}

export const durationLabel = (days: number): string => (days === 1 ? '1 day' : `${days} days`);
