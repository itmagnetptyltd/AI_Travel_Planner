/** BRD v1.0 §7. "Dietary preference" (§17) means the same thing. */
export const FOOD_PREFERENCES = [
  'No Preference',
  'Vegetarian',
  'Vegan',
  'Halal',
  'Gluten-Free',
  'Other',
] as const;

export type FoodPreference = (typeof FOOD_PREFERENCES)[number];
