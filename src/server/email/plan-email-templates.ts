import type { ItineraryChange } from '../../shared/notification-schemas';
import { PLAN_RECOMMENDATION_NOTICE } from '../../shared/plan-notice';
import type { PlanView } from '../../shared/plan-schemas';
import { toOneLine } from '../../shared/trip-preferences';
import { SHARE_LINK_DAYS } from '../../shared/share-schemas';
import type { TripView } from '../../shared/trip-schemas';
import { estimatesOf } from '../../shared/trip-budget';
import type { EmailMessage } from './email-service';

/** What an email needs to say about a Trip. */
export interface EmailTrip {
  readonly id: string;
  readonly name: string;
  readonly destination: string;
  readonly startDate: string;
  readonly endDate: string;
}

export const emailTripOf = (trip: TripView): EmailTrip => ({
  id: trip.id,
  name: trip.name,
  destination: `${trip.destination.name}, ${trip.destination.country}`,
  startDate: trip.startDate,
  endDate: trip.endDate,
});

interface Addressed {
  readonly to: string;
  readonly appBaseUrl: string;
}

const linkTo = (appBaseUrl: string, path: string): string => new URL(path, appBaseUrl).toString();
const tripLink = (appBaseUrl: string, trip: EmailTrip): string => linkTo(appBaseUrl, `/trips/${encodeURIComponent(trip.id)}`);
const planLink = (appBaseUrl: string, token: string): string => linkTo(appBaseUrl, `/shared/${token}`);

/**
 * Everything a Traveler typed (a Trip name, an Activity title, a name) is put on one line before it goes in an email,
 * so it can never begin a line, a header or a paragraph of its own. Emails are plain text, so nothing is markup.
 */
const oneLine = (text: string): string => toOneLine(text);

/** A readable summary of the whole Plan: every Day with its Activities, where to stay, and the estimated total (REQ-TRV-054). */
function planLines(plan: PlanView): string[] {
  const { total, currency } = estimatesOf(plan);
  const days = plan.days.flatMap((day) => [
    '',
    `Day ${day.dayNumber}, ${day.date}`,
    ...(day.activities.length === 0
      ? ['  Nothing planned yet.']
      : day.activities.map(
          (activity) =>
            `  ${activity.startTime} ${oneLine(activity.title)}, ${oneLine(activity.location)} (${activity.durationMinutes} min, about ${activity.estimatedCost} ${plan.currency})`,
        )),
  ]);
  return [
    ...days,
    '',
    `Where to stay: ${oneLine(plan.stay.accommodationType)} in ${oneLine(plan.stay.suggestedArea)}, about ${plan.stay.nightlyCostEstimate} ${plan.currency} per night`,
    `Estimated total: ${total} ${currency} (an estimate, not a price)`,
  ];
}

const tripLine = (trip: EmailTrip): string =>
  `${oneLine(trip.name)}, ${oneLine(trip.destination)}, ${trip.startDate} to ${trip.endDate}`;

/** The Plan the Traveler asked to have emailed to themselves (REQ-TRV-054, REQ-TRV-032). */
export function planEmail(input: Addressed & { readonly token: string; readonly trip: EmailTrip; readonly plan: PlanView }): EmailMessage {
  return {
    to: input.to,
    subject: `Your Plan for ${oneLine(input.trip.name)}`,
    text: [
      `Here is your Plan for ${tripLine(input.trip)}.`,
      '',
      PLAN_RECOMMENDATION_NOTICE,
      ...planLines(input.plan),
      '',
      `Open this Plan in your browser, with no login needed (the link works for ${SHARE_LINK_DAYS} days):`,
      planLink(input.appBaseUrl, input.token),
    ].join('\n'),
  };
}

/** A Plan shared by a Traveler with someone else (REQ-TRV-058, REQ-TRV-032). It names who shared it. */
export function sharedEmail(
  input: Addressed & { readonly token: string; readonly trip: EmailTrip; readonly plan: PlanView; readonly sharer: string },
): EmailMessage {
  const sharer = oneLine(input.sharer);
  return {
    to: input.to,
    subject: `${sharer} shared the Plan for ${oneLine(input.trip.name)} with you`,
    text: [
      `${sharer} shared this Plan with you: ${tripLine(input.trip)}.`,
      '',
      PLAN_RECOMMENDATION_NOTICE,
      ...planLines(input.plan),
      '',
      `Open this Plan in your browser, with no login needed (the link works for ${SHARE_LINK_DAYS} days):`,
      planLink(input.appBaseUrl, input.token),
    ].join('\n'),
  };
}

/** A short confirmation, sent once when a Trip's details are first saved. It holds no Plan (REQ-TRV-055). */
export function tripCreatedEmail(input: Addressed & { readonly trip: EmailTrip }): EmailMessage {
  return {
    to: input.to,
    subject: `Your Trip ${oneLine(input.trip.name)} was created`,
    text: ['Your Trip was created.', '', tripLine(input.trip), '', 'Open your Trip:', tripLink(input.appBaseUrl, input.trip)].join('\n'),
  };
}

const CHANGES: Readonly<Record<ItineraryChange, string>> = {
  dates: 'The dates of your Trip changed, and its Plan moved with them.',
  destination: 'The Destination of your Trip changed, and its Plan was written again for the new Destination.',
  plan: 'Your whole Plan was written again.',
};

/** Sent when the Trip's dates or Destination change, or its whole Plan is regenerated (REQ-TRV-056). */
export function itineraryUpdatedEmail(input: Addressed & { readonly trip: EmailTrip; readonly change: ItineraryChange }): EmailMessage {
  return {
    to: input.to,
    subject: `Your itinerary for ${oneLine(input.trip.name)} was updated`,
    text: [CHANGES[input.change], '', tripLine(input.trip), '', 'Open your Trip:', tripLink(input.appBaseUrl, input.trip)].join('\n'),
  };
}

/**
 * The one reminder, sent three days before the Trip starts (REQ-TRV-057). It says the date, not "in 3 days": a check that
 * ran late, because the application was down at 09:00, still tells the truth.
 */
export function tripReminderEmail(input: Addressed & { readonly trip: EmailTrip }): EmailMessage {
  return {
    to: input.to,
    subject: `Reminder: ${oneLine(input.trip.name)} starts on ${input.trip.startDate}`,
    text: [
      `Your Trip starts on ${input.trip.startDate}.`,
      '',
      tripLine(input.trip),
      '',
      'Open your Trip:',
      tripLink(input.appBaseUrl, input.trip),
    ].join('\n'),
  };
}
