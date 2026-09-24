import type { DestinationInput } from '../../src/shared/destination-schemas';

export function aDestination(overrides: Partial<DestinationInput> = {}): DestinationInput {
  return {
    name: 'Kyoto',
    country: 'Japan',
    description: 'Former imperial capital, known for its temples and gardens.',
    popularActivities: 'Fushimi Inari shrine, Arashiyama bamboo grove, Gion evening walk',
    recommendedDurationDays: 3,
    travelInformation: 'Kyoto Station is 15 minutes from Osaka by Shinkansen.',
    ...overrides,
  };
}
