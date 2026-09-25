import { describe, expect, it, vi } from 'vitest';
import type { EmailMessage } from '../../src/server/email/email-service';
import { confirmationEmail, passwordResetEmail } from '../../src/server/email/account-email-templates';
import { itineraryUpdatedEmail, planEmail, sharedEmail, tripCreatedEmail, tripReminderEmail, type EmailTrip } from '../../src/server/email/plan-email-templates';
import { notificationLog } from '../../src/server/db/schema';
import { ITINERARY_CHANGES, NOTIFICATION_EVENTS } from '../../src/shared/notification-schemas';
import { PLAN_RECOMMENDATION_NOTICE } from '../../src/shared/plan-notice';
import { aPlanCosting, COSTS_TOTALLING_3200 } from '../support/a-budget';
import { aPlanReplyText } from '../support/a-plan-reply';
import { logIn, sessionCookieFrom } from '../support/a-traveler';
import { aTripInput, anAddedDestination, createdTrip } from '../support/a-trip';
import { aConfirmedTraveler } from '../support/an-administrator';
import { buildTestApp } from '../support/build-test-app';
import { BOOKING, CALENDAR, RISK_OR_DISRUPTION } from '../support/out-of-scope-words';
import { sourceFilesUnder } from '../support/service-layer-boundaries';

const PUBLIC_ADDRESS = 'https://trv.example.test';
const FRIEND = 'friend@example.com';
const TRAVELER = 'traveler@example.com';
const REMINDER_POINT = new Date('2026-10-07T09:00:00Z');
const EMAIL_FIELDS = ['from', 'subject', 'text', 'to'];
/** How many times the flow below asks the AI: once for the Plan and once to write it again. Nothing else may. */
const PLANS_ASKED_FOR = 2;

const TRIP: EmailTrip = { id: 'trip-1', name: 'Kyoto Family Holiday', destination: 'Kyoto, Japan', startDate: '2026-10-10', endDate: '2026-10-17' };
const PLAN = aPlanCosting({ days: 8, nightly: 150, costs: COSTS_TOTALLING_3200 });
const TOKEN = 'T'.repeat(43);

const wordsOf = (message: EmailMessage): string => `${message.subject}\n${message.text}`;
const withoutNotice = (text: string): string => text.split(PLAN_RECOMMENDATION_NOTICE).join(' ');
const unknownFields = (message: EmailMessage): string[] => Object.keys(message).filter((field) => !EMAIL_FIELDS.includes(field));

/** Every email the application has a template for, each written for a Trip. */
function everyEmailTemplate(): [string, EmailMessage][] {
  const to = TRAVELER;
  return [
    ['confirm your address', confirmationEmail(to, PUBLIC_ADDRESS, TOKEN)],
    ['reset your password', passwordResetEmail(to, PUBLIC_ADDRESS, TOKEN)],
    ['Trip created', tripCreatedEmail({ to, appBaseUrl: PUBLIC_ADDRESS, trip: TRIP })],
    ...ITINERARY_CHANGES.map((change): [string, EmailMessage] => [`Itinerary updated (${change})`, itineraryUpdatedEmail({ to, appBaseUrl: PUBLIC_ADDRESS, trip: TRIP, change })]),
    ['Trip reminder', tripReminderEmail({ to, appBaseUrl: PUBLIC_ADDRESS, trip: TRIP })],
    ['a Plan sent to yourself', planEmail({ to, appBaseUrl: PUBLIC_ADDRESS, token: TOKEN, trip: TRIP, plan: PLAN })],
    ['a Plan shared with someone', sharedEmail({ to: FRIEND, appBaseUrl: PUBLIC_ADDRESS, token: TOKEN, trip: TRIP, plan: PLAN, sharer: 'Jane Citizen' })],
  ];
}

/** A Traveler's Trip taken through every email it can cause, by the running application, once: the emails it sent, and how often it asked the AI. */
async function aTripThroughEveryEmailItCauses(): Promise<{ readonly emails: readonly EmailMessage[]; readonly asked: number }> {
  const testApp = await buildTestApp({ appBaseUrl: PUBLIC_ADDRESS, reminderCheckEveryMs: 20 });
  const destinationId = await anAddedDestination(testApp, { name: 'Kyoto', country: 'Japan' });
  const traveler = await aConfirmedTraveler(testApp.app, testApp.email, { email: TRAVELER });
  const cookies = sessionCookieFrom(await logIn(testApp.app, traveler));
  const trip = await createdTrip(testApp.app, cookies, aTripInput(destinationId));
  testApp.ai.replyWith(aPlanReplyText({ dayCount: 8 }));
  const step = async (name: string, request: Promise<{ statusCode: number }>) => {
    const { statusCode } = await request;
    if (statusCode < 200 || statusCode >= 300) throw new Error(`The step "${name}" was not accepted: it answered ${statusCode}.`);
  };
  const post = (url: string, payload?: object) => testApp.app.inject({ method: 'POST', url, cookies, ...(payload ? { payload } : {}) });
  await step('generate the Plan', post(`/api/trips/${trip.id}/plan`));
  await step('write the Plan again', post(`/api/trips/${trip.id}/plan`));
  await step('email the Plan to yourself', post(`/api/trips/${trip.id}/plan/email`));
  await step('share the Plan', post(`/api/trips/${trip.id}/shares`, { recipient: FRIEND }));
  await step('ask for a password reset', testApp.app.inject({ method: 'POST', url: '/api/password-resets', payload: { email: TRAVELER } }));
  testApp.clock.advanceBy(REMINDER_POINT.getTime() - testApp.clock.now().getTime());
  await vi.waitFor(() => expect(testApp.email.sent.some((message) => /^Reminder: /.test(message.subject))).toBe(true), { timeout: 10_000, interval: 25 });
  return { emails: testApp.email.sent, asked: testApp.ai.requests.length };
}

/** The flow runs once, whichever test asks first; what it found is kept, so the others read it rather than build the application again. */
let flow: Promise<Awaited<ReturnType<typeof aTripThroughEveryEmailItCauses>>> | undefined;
const theFlow = () => (flow ??= aTripThroughEveryEmailItCauses());

describe('the notifications the application can send', () => {
  // @covers REQ-TRV-089@v1
  it('are exactly Trip created, Itinerary updated and Trip reminder, with nothing else to switch on or off', () => {
    expect([...NOTIFICATION_EVENTS]).toEqual(['tripCreated', 'itineraryUpdated', 'tripReminder']);
  });

  // @covers REQ-TRV-089@v1
  it('are the only kinds the log of notifications can hold', () => {
    expect([...notificationLog.kind.enumValues]).toEqual([...NOTIFICATION_EVENTS]);
  });

  // @covers REQ-TRV-089@v1
  it('say only that the Traveler changed the dates, the Destination or the Plan, and nothing that happened in the world', () => {
    expect([...ITINERARY_CHANGES]).toEqual(['dates', 'destination', 'plan']);
  });

  // @covers REQ-TRV-089@v1
  it('are written by code that never asks the AI anything, and never could', () => {
    const files = [...sourceFilesUnder('.', 'src/server/notifications'), ...sourceFilesUnder('.', 'src/server/email')];

    expect(files.length).toBeGreaterThan(5);
    expect(files.filter((file) => /from '(\.\.\/)+ai\/|\bAiService\b|\bAiCaller\b/.test(file.content)).map((file) => file.path)).toEqual([]);
  });
});

describe.each(everyEmailTemplate())('the email: %s', (_name, message) => {
  // @covers REQ-TRV-089@v1
  it('is no warning about a risk, a disruption, a delay, a cancellation, the weather or anything happening to the Trip', () => {
    expect(wordsOf(message)).not.toMatch(RISK_OR_DISRUPTION);
  });

  // @covers REQ-TRV-085@v1
  it('is plain text with no attachment', () => {
    expect(unknownFields(message)).toEqual([]);
  });

  // @covers REQ-TRV-085@v1
  it('has no calendar invitation, event or link', () => {
    expect(wordsOf(message)).not.toMatch(CALENDAR);
  });

  // @covers REQ-TRV-090@v1
  it('offers no way to book or pay, apart from the sentence that says nothing is being booked', () => {
    expect(withoutNotice(wordsOf(message))).not.toMatch(BOOKING);
  });
});

describe('a Trip taken through every email it can cause', () => {
  // @covers REQ-TRV-089@v1
  it('does send the emails, all of them: Trip created, the Plan written again, the Plan sent and shared, the reset and the reminder', async () => {
    const { emails } = await theFlow();

    expect(emails.map((message) => message.subject).filter((subject) => /^Reminder: /.test(subject))).toHaveLength(1);
    expect(emails.length).toBeGreaterThanOrEqual(6);
  });

  // @covers REQ-TRV-089@v1
  it('sends no risk or disruption notification', async () => {
    const { emails } = await theFlow();

    expect(emails.filter((message) => RISK_OR_DISRUPTION.test(wordsOf(message))).map((message) => message.subject)).toEqual([]);
  });

  // @covers REQ-TRV-089@v1
  it('asks the AI nothing for any of them: it was asked only for the Plans', async () => {
    const { asked } = await theFlow();

    expect(asked).toBe(PLANS_ASKED_FOR);
  });

  // @covers REQ-TRV-085@v1
  it('sends every email as plain text with no attachment', async () => {
    const { emails } = await theFlow();

    expect(emails.flatMap((message) => unknownFields(message))).toEqual([]);
  });

  // @covers REQ-TRV-085@v1
  it('sends no calendar invitation, event or link', async () => {
    const { emails } = await theFlow();

    expect(emails.filter((message) => CALENDAR.test(wordsOf(message))).map((message) => message.subject)).toEqual([]);
  });

  // @covers REQ-TRV-085@v1
  // @covers REQ-TRV-090@v1
  it('links only to the application, never to a calendar, booking or other outside service', async () => {
    const { emails } = await theFlow();

    const links = emails.flatMap((message) => message.text.match(/https?:\/\/[^\s]+/g) ?? []);
    expect(links.length).toBeGreaterThan(3);
    expect(links.filter((link) => !link.startsWith(`${PUBLIC_ADDRESS}/`))).toEqual([]);
  });

  // @covers REQ-TRV-090@v1
  it('offers no way to book or pay in any of them', async () => {
    const { emails } = await theFlow();

    expect(emails.filter((message) => BOOKING.test(withoutNotice(wordsOf(message)))).map((message) => message.subject)).toEqual([]);
  });
});
