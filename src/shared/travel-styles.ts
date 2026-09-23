/** BRD v1.0 §7. */
export const TRAVEL_STYLES = [
  'Relaxed',
  'Balanced',
  'Adventure',
  'Luxury',
  'Budget',
  'Family',
  'Business',
  'Cultural',
] as const;

export type TravelStyle = (typeof TRAVEL_STYLES)[number];
