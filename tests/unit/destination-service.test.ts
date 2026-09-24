import { describe, expect, test } from 'vitest';
import { createDestinationService, type DestinationService } from '../../src/server/destinations/destination-service';
import { destinationInputSchema } from '../../src/shared/destination-schemas';
import { aTestDatabase } from '../support/build-test-app';
import { aDestination } from '../support/a-destination';
import { aFixedClock } from '../support/fixed-clock';

function aDestinationService(): DestinationService {
  return createDestinationService({ db: aTestDatabase(), clock: aFixedClock() });
}

describe('adding a Destination', () => {
  // @covers REQ-TRV-072@v2
  test('an added Destination is listed with its description, activities, duration and travel information', () => {
    const service = aDestinationService();

    service.add(aDestination());

    expect(service.listForAdmin()).toEqual([
      expect.objectContaining({
        name: 'Kyoto',
        description: aDestination().description,
        popularActivities: aDestination().popularActivities,
        recommendedDurationDays: 3,
        travelInformation: aDestination().travelInformation,
      }),
    ]);
  });

  // @covers REQ-TRV-072@v2
  test('a Traveler reading an enabled Destination gets the four values', () => {
    const service = aDestinationService();
    const kyoto = service.add(aDestination());

    expect(service.getForTraveler(kyoto.id)).toMatchObject({
      description: aDestination().description,
      popularActivities: aDestination().popularActivities,
      recommendedDurationDays: 3,
      travelInformation: aDestination().travelInformation,
    });
  });

  // @covers REQ-TRV-072@v2
  test('a description over 2000 characters is refused by the Destination schema', () => {
    const result = destinationInputSchema.safeParse(aDestination({ description: 'x'.repeat(2001) }));

    expect(result.success).toBe(false);
  });
});

describe('editing a Destination', () => {
  // @covers REQ-TRV-073@v1
  test('changing the recommended duration from 3 to 4 days shows 4 days', () => {
    const service = aDestinationService();
    const kyoto = service.add(aDestination({ recommendedDurationDays: 3 }));

    service.edit(kyoto.id, { recommendedDurationDays: 4 });

    expect(service.listForAdmin()[0]?.recommendedDurationDays).toBe(4);
  });
});

describe('disabling a Destination', () => {
  // @covers REQ-TRV-074@v2
  test('a disabled Destination is not returned by Traveler search', () => {
    const service = aDestinationService();
    const kyoto = service.add(aDestination());

    service.setDisabled(kyoto.id, true);

    expect(service.search('Kyoto')).toEqual([]);
  });

  // @covers REQ-TRV-074@v2
  test('a disabled Destination is still listed for Administrators, marked disabled', () => {
    const service = aDestinationService();
    const kyoto = service.add(aDestination());

    service.setDisabled(kyoto.id, true);

    expect(service.listForAdmin()).toEqual([expect.objectContaining({ name: 'Kyoto', isDisabled: true })]);
  });
});

describe('removing a Destination', () => {
  // @covers REQ-TRV-075@v2
  test('removing an unused Destination takes it out of the list', () => {
    const service = aDestinationService();
    const kyoto = service.add(aDestination());

    const removed = service.remove(kyoto.id);

    expect(removed).toBe(true);
    expect(service.listForAdmin()).toEqual([]);
  });
});

describe('searching Destinations', () => {
  // @covers REQ-TRV-078@v2
  test('searching "Kyo" returns Kyoto and not Tokyo', () => {
    const service = aDestinationService();
    service.add(aDestination({ name: 'Kyoto' }));
    service.add(aDestination({ name: 'Tokyo' }));

    expect(service.search('Kyo').map((d) => d.name)).toEqual(['Kyoto']);
  });

  // @covers REQ-TRV-078@v2
  test('search treats % and _ as literal characters, not wildcards', () => {
    const service = aDestinationService();
    service.add(aDestination({ name: 'Kyoto' }));

    expect(service.search('%')).toEqual([]);
    expect(service.search('_')).toEqual([]);
  });
});
