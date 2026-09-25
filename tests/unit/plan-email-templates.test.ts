import { describe, expect, test } from 'vitest';
import {
  itineraryUpdatedEmail,
  planEmail,
  sharedEmail,
  tripCreatedEmail,
  tripReminderEmail,
  type EmailTrip,
} from '../../src/server/email/plan-email-templates';
import { PLAN_RECOMMENDATION_NOTICE } from '../../src/shared/plan-notice';
import { aPlanCosting, COSTS_TOTALLING_3200 } from '../support/a-budget';

const BASE = 'https://trv.example.test';
const TRIP: EmailTrip = { id: 'trip-1', name: 'Tokyo Family Holiday', destination: 'Kyoto, Japan', startDate: '2026-10-10', endDate: '2026-10-17' };
const PLAN = aPlanCosting({ days: 8, nightly: 150, costs: COSTS_TOTALLING_3200 });
const TOKEN = 'T'.repeat(43);

const linesOf = (text: string) => text.split('\n');

describe('the email that carries a Plan to the Traveler', () => {
  const message = planEmail({ to: 'traveler@example.com', appBaseUrl: BASE, token: TOKEN, trip: TRIP, plan: PLAN });

  // @covers REQ-TRV-054@v1
  test('is addressed to the account address', () => {
    expect(message.to).toBe('traveler@example.com');
  });

  // @covers REQ-TRV-054@v1
  test('lists all 8 Days with their dates and Activities', () => {
    for (let day = 1; day <= 8; day += 1) expect(message.text).toContain(`Day ${day}, 2026-10-${String(9 + day).padStart(2, '0')}`);
    expect(message.text).toContain('Food 1');
    expect(message.text).toContain('Shopping 1');
  });

  // @covers REQ-TRV-054@v1
  test('gives the total estimate of 3200 USD, and calls it an estimate', () => {
    expect(message.text).toContain('Estimated total: 3200 USD');
    expect(message.text).toMatch(/estimate/i);
  });

  // @covers REQ-TRV-054@v1
  test('has a link to the read-only view on the public address, made from the token', () => {
    expect(message.text).toContain(`${BASE}/shared/${TOKEN}`);
  });

  // @covers REQ-TRV-032@v1
  test('states the Plan is a recommendation, not guaranteed availability, prices or bookings', () => {
    expect(message.text).toContain(PLAN_RECOMMENDATION_NOTICE);
  });
});

describe('the email that shares a Plan with someone else', () => {
  const message = sharedEmail({ to: 'friend@example.com', appBaseUrl: BASE, token: TOKEN, trip: TRIP, plan: PLAN, sharer: 'Jane Citizen' });

  // @covers REQ-TRV-058@v1
  test('is addressed to the friend and names Jane Citizen as the sharer', () => {
    expect(message.to).toBe('friend@example.com');
    expect(message.text).toContain('Jane Citizen');
    expect(message.subject).toContain('Tokyo Family Holiday');
  });

  // @covers REQ-TRV-058@v1
  test('lists every Day with its Activities, the total estimate and a link to the read-only view', () => {
    for (let day = 1; day <= 8; day += 1) expect(message.text).toContain(`Day ${day},`);
    expect(message.text).toContain('Estimated total: 3200 USD');
    expect(message.text).toContain(`${BASE}/shared/${TOKEN}`);
  });

  // @covers REQ-TRV-032@v1
  test('states the Plan is a recommendation, not guaranteed availability, prices or bookings', () => {
    expect(message.text).toContain(PLAN_RECOMMENDATION_NOTICE);
  });

  // @covers REQ-TRV-058@v1
  test('keeps a Trip name, an Activity title and a sharer name that contain line breaks on one line each', () => {
    const hostile = sharedEmail({
      to: 'friend@example.com',
      appBaseUrl: BASE,
      token: TOKEN,
      trip: { ...TRIP, name: 'Holiday\nBcc: spy@example.com' },
      plan: { ...PLAN, days: PLAN.days.map((day) => ({ ...day, activities: day.activities.map((a) => ({ ...a, title: `${a.title}\nInjected line` })) })) },
      sharer: 'Jane\nCc: spy@example.com',
    });

    expect(hostile.subject).not.toMatch(/[\r\n]/);
    expect(linesOf(hostile.text).some((line) => line.startsWith('Bcc:') || line.startsWith('Cc:') || line.startsWith('Injected line'))).toBe(false);
  });
});

describe('the Trip Created email', () => {
  const message = tripCreatedEmail({ to: 'traveler@example.com', appBaseUrl: BASE, trip: TRIP });

  // @covers REQ-TRV-055@v1
  test('has the Trip name, Destination, dates and a link to open the Trip', () => {
    expect(message.text).toContain('Tokyo Family Holiday');
    expect(message.text).toContain('Kyoto, Japan');
    expect(message.text).toContain('2026-10-10');
    expect(message.text).toContain('2026-10-17');
    expect(message.text).toContain(`${BASE}/trips/trip-1`);
  });

  // @covers REQ-TRV-055@v1
  test('has no Plan content: no Day, no Activity, no estimate', () => {
    expect(message.text).not.toMatch(/Day \d|estimate|recommendation/i);
  });
});

describe('the Itinerary Updated email', () => {
  // @covers REQ-TRV-056@v1
  test.each([
    ['dates', /dates/i],
    ['destination', /destination/i],
    ['plan', /plan/i],
  ] as const)('names the Trip and says what changed when it was the %s', (change, wording) => {
    const message = itineraryUpdatedEmail({ to: 'traveler@example.com', appBaseUrl: BASE, trip: TRIP, change });

    expect(message.to).toBe('traveler@example.com');
    expect(message.subject).toContain('Tokyo Family Holiday');
    expect(message.text).toMatch(wording);
    expect(message.text).toContain(`${BASE}/trips/trip-1`);
  });
});

describe('the Trip Reminder email', () => {
  // @covers REQ-TRV-057@v1
  test('names the Trip, gives its start date, and links to it on the public address it was given', () => {
    const message = tripReminderEmail({ to: 'traveler@example.com', appBaseUrl: BASE, trip: TRIP });

    expect(message.subject).toBe('Reminder: Tokyo Family Holiday starts on 2026-10-10');
    expect(message.text).toContain('Your Trip starts on 2026-10-10.');
    expect(message.text).not.toMatch(/in 3 days/);
    expect(message.text).toContain(`${BASE}/trips/trip-1`);
    expect(message.text).toContain('https://');
  });
});
