import { describe, expect, test } from 'vitest';
import { ADMIN_FEEDBACK_ACTIONS } from '../../src/shared/feedback-schemas';
import { aFeedbackSetup } from '../support/a-feedback-setup';

const ratingsOf = (list: readonly { rating: number }[]) => list.map((entry) => entry.rating);

describe('the Administrator reviewing all feedback', () => {
  // @covers REQ-TRV-064@v1
  test('lists both Travelers\' feedback, each with its rating, comment and Trip', () => {
    const { adminFeedback, giveFeedback } = aFeedbackSetup();
    giveFeedback({ rating: 4, comment: 'Day 2 too busy' });
    giveFeedback({ rating: 2, comment: 'Hotel was far away' });

    const list = adminFeedback.list({});

    expect(list.map((entry) => [entry.rating, entry.comment, entry.tripName])).toEqual(
      expect.arrayContaining([
        [4, 'Day 2 too busy', 'Feedback trip'],
        [2, 'Hotel was far away', 'Feedback trip'],
      ]),
    );
    expect(list).toHaveLength(2);
  });

  // @covers REQ-TRV-064@v1
  test('lists none when there is none', () => {
    expect(aFeedbackSetup().adminFeedback.list({})).toEqual([]);
  });

  // @covers REQ-TRV-064@v1
  test('names no Traveler: an entry carries nothing but the feedback, its Trip\'s name, its Destination and its date', () => {
    const { adminFeedback, giveFeedback } = aFeedbackSetup();
    giveFeedback({ rating: 4, comment: 'Lovely' });

    const [entry] = adminFeedback.list({});

    expect(Object.keys(entry ?? {}).sort()).toEqual(['comment', 'date', 'destination', 'id', 'planVersion', 'rating', 'tripName']);
  });
});

describe('finding what recurs in feedback', () => {
  // @covers REQ-TRV-065@v1
  test('lists exactly the three entries whose comments contain "busy" when the keyword is "busy"', () => {
    const { adminFeedback, giveFeedback } = aFeedbackSetup();
    giveFeedback({ rating: 3, comment: 'Day 2 too busy' });
    giveFeedback({ rating: 3, comment: 'A BUSY airport' });
    giveFeedback({ rating: 2, comment: 'Busyness everywhere' });
    giveFeedback({ rating: 5, comment: 'Wonderful' });
    giveFeedback({ rating: 4, comment: null });

    const list = adminFeedback.list({ keyword: 'busy' });

    expect(list.map((entry) => entry.comment).sort()).toEqual(['A BUSY airport', 'Busyness everywhere', 'Day 2 too busy']);
  });

  // @covers REQ-TRV-065@v1
  test('matches a keyword as plain text, so % and _ mean themselves', () => {
    const { adminFeedback, giveFeedback } = aFeedbackSetup();
    giveFeedback({ rating: 5, comment: '100% fun' });
    giveFeedback({ rating: 5, comment: 'snake_case' });
    giveFeedback({ rating: 5, comment: 'plain words' });

    expect(adminFeedback.list({ keyword: '%' }).map((entry) => entry.comment)).toEqual(['100% fun']);
    expect(adminFeedback.list({ keyword: '_' }).map((entry) => entry.comment)).toEqual(['snake_case']);
    expect(adminFeedback.list({ keyword: "'; drop table feedback; --" })).toEqual([]);
  });

  // @covers REQ-TRV-065@v1
  test('lists only the entry rated 2 when the rating is 2', () => {
    const { adminFeedback, giveFeedback } = aFeedbackSetup();
    for (const rating of [2, 4, 5]) giveFeedback({ rating });

    expect(ratingsOf(adminFeedback.list({ rating: 2 }))).toEqual([2]);
  });

  // @covers REQ-TRV-065@v1
  test('lists only the Tokyo feedback when the Destination is Tokyo, whatever the case', () => {
    const { adminFeedback, giveFeedback } = aFeedbackSetup();
    giveFeedback({ rating: 4, destination: 'Tokyo' });
    giveFeedback({ rating: 3, destination: 'Paris' });

    expect(adminFeedback.list({ destination: 'Tokyo' }).map((entry) => entry.destination.name)).toEqual(['Tokyo']);
    expect(adminFeedback.list({ destination: 'tokyo' })).toHaveLength(1);
  });

  // @covers REQ-TRV-065@v1
  test('lists only the feedback of 2026-10-01 for the range 2026-09-15 to 2026-10-15', () => {
    const { adminFeedback, giveFeedback } = aFeedbackSetup();
    giveFeedback({ rating: 3, on: '2026-09-24' });
    giveFeedback({ rating: 4, on: '2026-10-01' });
    giveFeedback({ rating: 5, on: '2026-10-20' });

    expect(adminFeedback.list({ from: '2026-09-25', to: '2026-10-15' }).map((entry) => entry.date)).toEqual(['2026-10-01']);
  });

  // @covers REQ-TRV-065@v1
  test('includes both end dates of a range', () => {
    const { adminFeedback, giveFeedback } = aFeedbackSetup();
    giveFeedback({ rating: 3, on: '2026-09-25' });
    giveFeedback({ rating: 4, on: '2026-10-15' });
    giveFeedback({ rating: 5, on: '2026-10-16' });

    expect(ratingsOf(adminFeedback.list({ from: '2026-09-25', to: '2026-10-15', sort: 'rating', order: 'asc' }))).toEqual([3, 4]);
  });

  // @covers REQ-TRV-065@v1
  test('lists rated 2, 4, 5 when sorted by rating, lowest first, and 5, 4, 2 highest first', () => {
    const { adminFeedback, giveFeedback } = aFeedbackSetup();
    for (const rating of [5, 2, 4]) giveFeedback({ rating });

    expect(ratingsOf(adminFeedback.list({ sort: 'rating', order: 'asc' }))).toEqual([2, 4, 5]);
    expect(ratingsOf(adminFeedback.list({ sort: 'rating', order: 'desc' }))).toEqual([5, 4, 2]);
  });

  // @covers REQ-TRV-065@v1
  test('lists the newest first when sorted by date, or not sorted at all', () => {
    const { adminFeedback, giveFeedback } = aFeedbackSetup();
    giveFeedback({ rating: 1, on: '2026-09-25' });
    giveFeedback({ rating: 2, on: '2026-10-05' });
    giveFeedback({ rating: 3, on: '2026-10-10' });

    expect(ratingsOf(adminFeedback.list({}))).toEqual([3, 2, 1]);
    expect(ratingsOf(adminFeedback.list({ sort: 'date', order: 'asc' }))).toEqual([1, 2, 3]);
  });

  // @covers REQ-TRV-065@v1
  test('applies every filter given together, and none left out', () => {
    const { adminFeedback, giveFeedback } = aFeedbackSetup();
    giveFeedback({ rating: 2, comment: 'Too busy', destination: 'Tokyo', on: '2026-10-01' });
    giveFeedback({ rating: 2, comment: 'Too busy', destination: 'Paris', on: '2026-10-01' });
    giveFeedback({ rating: 4, comment: 'Too busy', destination: 'Tokyo', on: '2026-10-01' });

    expect(adminFeedback.list({ keyword: 'busy', rating: 2, destination: 'Tokyo', from: '2026-10-01', to: '2026-10-01' })).toHaveLength(1);
  });

  // @covers REQ-TRV-065@v1
  test('offers no way to tag feedback with a theme: filtering, sorting and exporting are the only actions', () => {
    expect([...ADMIN_FEEDBACK_ACTIONS]).toEqual(['filter', 'sort', 'export']);
    expect(ADMIN_FEEDBACK_ACTIONS.some((action) => /tag|theme|label/i.test(action))).toBe(false);
  });

  // @covers REQ-TRV-065@v1
  test('exports exactly the entries a filter leaves, as CSV', () => {
    const { adminFeedback, giveFeedback } = aFeedbackSetup();
    giveFeedback({ rating: 2, comment: 'Too busy', destination: 'Tokyo', on: '2026-10-01' });
    giveFeedback({ rating: 3, comment: 'Busy again', destination: 'Tokyo', on: '2026-10-02' });
    giveFeedback({ rating: 5, comment: 'Wonderful', destination: 'Paris', on: '2026-10-03' });

    const lines = adminFeedback.exportCsv({ keyword: 'busy', sort: 'rating', order: 'asc' }).trimEnd().split('\r\n');

    expect(lines).toEqual(['Rating,Comment,Destination,Date', '2,Too busy,Tokyo,2026-10-01', '3,Busy again,Tokyo,2026-10-02']);
  });
});

describe('feedback with text that is not plain ASCII', () => {
  // @covers REQ-TRV-065@v1
  test('is found by a Destination typed in any capitals, such as "île-de-france" for "Île-de-France"', () => {
    const { adminFeedback, giveFeedback } = aFeedbackSetup();
    giveFeedback({ rating: 4, destination: 'Île-de-France' });
    giveFeedback({ rating: 3, destination: 'Zürich' });

    expect(adminFeedback.list({ destination: 'île-de-france' }).map((entry) => entry.destination.name)).toEqual(['Île-de-France']);
    expect(adminFeedback.list({ destination: 'ZÜRICH' }).map((entry) => entry.destination.name)).toEqual(['Zürich']);
  });

  // @covers REQ-TRV-065@v1
  test('is found by a keyword typed in other capitals, such as "élan" for "Élan"', () => {
    const { adminFeedback, giveFeedback } = aFeedbackSetup();
    giveFeedback({ rating: 5, comment: 'Quel Élan à Kyōto' });
    giveFeedback({ rating: 5, comment: 'Plain words' });

    expect(adminFeedback.list({ keyword: 'élan' }).map((entry) => entry.comment)).toEqual(['Quel Élan à Kyōto']);
    expect(adminFeedback.list({ keyword: 'KYŌTO' })).toHaveLength(1);
  });
});

describe('the Trip named beside feedback', () => {
  // @covers REQ-TRV-064@v1
  test('is not named once its owner has deleted it, though the feedback stays for the 30 days it can be restored', () => {
    const { adminFeedback, aTripWithAPlan, feedback, trips } = aFeedbackSetup();
    const { tripId, ownerId } = aTripWithAPlan({ name: 'Sarah\'s 40th' });
    feedback.save(ownerId, tripId, { rating: 4, comment: 'Lovely' });
    expect(adminFeedback.list({})[0]?.tripName).toBe('Sarah\'s 40th');

    trips.softDelete(ownerId, tripId);

    expect(adminFeedback.list({})).toHaveLength(1);
    expect(adminFeedback.list({})[0]?.tripName).toBeNull();
  });
});
