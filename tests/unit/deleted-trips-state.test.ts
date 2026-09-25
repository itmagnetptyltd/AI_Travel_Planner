import { describe, expect, test } from 'vitest';
import { deletedTripLine, restoreProblem } from '../../src/web/pages/deleted-trips-state';
import type { DeletedTrip } from '../../src/shared/trip-schemas';

const TRIP: DeletedTrip = {
  id: 't1',
  name: 'Tokyo Family Holiday',
  destination: { id: 'd1', name: 'Tokyo', country: 'Japan' },
  deletedAt: '2026-09-15T04:30:00.000Z',
  purgesAt: '2026-10-15T04:30:00.000Z',
};

describe('listing a Trip that can still be restored', () => {
  // @covers REQ-TRV-099@v1
  test('gives its name and Destination, when it was deleted, and the date it is removed for good', () => {
    expect(deletedTripLine(TRIP)).toBe('Tokyo Family Holiday, Tokyo, Japan. Deleted 2026-09-15. Removed for good after 2026-10-15.');
  });

  // @covers REQ-TRV-099@v1
  test('tells the Traveler the Trip cannot be restored any more when the server says it is not found', () => {
    expect(restoreProblem({ code: 'TRIP_NOT_FOUND', message: 'Trip not found.' })).toMatch(/can no longer be restored/i);
  });

  // @covers REQ-TRV-099@v1
  test('gives a plain message for any other failure', () => {
    expect(restoreProblem({ code: 'NETWORK', message: 'Could not reach the server. Try again.' })).toBe('Could not reach the server. Try again.');
    expect(restoreProblem({ code: 'UNKNOWN' })).toMatch(/try again/i);
  });
});
