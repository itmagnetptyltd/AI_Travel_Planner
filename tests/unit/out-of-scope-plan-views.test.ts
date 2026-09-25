import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseActivityReply, parseDayReply, parsePlanReply, type PlanReplyTrip } from '../../src/server/plans/plan-reply';
import { PLAN_RECOMMENDATION_NOTICE } from '../../src/shared/plan-notice';
import type { PlanView } from '../../src/shared/plan-schemas';
import { activityDetailRows } from '../../src/web/pages/plan-view-state';
import { aPlanReplyText } from '../support/a-plan-reply';
import { A_FULL_PLAN, addressesIn, controlsIn, countOf, everyPlanningView, shownIn, shownWithoutNotice, type ViewName } from '../support/out-of-scope';
import { AVAILABILITY, BOOKING, CALENDAR, FLIGHT_INFORMATION, LIVE_INFORMATION, MAP, WEATHER } from '../support/out-of-scope-words';

/**
 * Nine features are not part of this build (BRD §28). These tests pin their absence in what the application shows and keeps, so
 * that adding one later is a decision that changes a requirement first, not something a change slips in.
 */
const views = everyPlanningView();
const EVERY_VIEW = Object.entries(views);
const PLAN_VIEWS: readonly ViewName[] = ['plan', 'shared or Administrator view of a Plan'];

const TRIP: PlanReplyTrip = { startDate: '2026-10-10', dayCount: 8, currency: 'USD', adults: 2, children: 2, budget: 5000 };

/** Anything that could put an image or a map on a page. An inline icon (`svg`) is not one. */
const EMBEDS = ['iframe', 'canvas', 'img', 'embed', 'object', 'video', 'audio', 'map', 'area', 'picture'] as const;

/** What the AI might add to a Plan that the application has no place for, on every level it could add it. */
const EXTRAS = {
  weather: 'sunny, 25°C',
  forecast: 'rain tomorrow',
  temperature: 25,
  flight: 'NH123 departs 09:40',
  flightNumber: 'NH123',
  hotel: 'Grand Kyoto Hotel',
  hotelName: 'Grand Kyoto Hotel',
  availability: '3 rooms left',
  availableRooms: 3,
  lat: 35.0116,
  lng: 135.7681,
  coordinates: [35.0116, 135.7681],
  mapUrl: 'https://maps.example.test/kyoto',
  bookingUrl: 'https://book.example.test/kyoto',
  ticketUrl: 'https://tickets.example.test/kyoto',
  price: 'from 99 USD, book now',
  provider: 'ExampleBookings',
  calendarEvent: 'BEGIN:VEVENT',
  language: 'fr',
} as const;

const EXTRA_KEYS = new RegExp(`"(${Object.keys(EXTRAS).join('|')})"`);
const EXTRA_VALUES = /Grand Kyoto|NH123|rooms left|35\.0116|135\.7681|maps\.example|book\.example|tickets\.example|ExampleBookings|book now|VEVENT|sunny|rain tomorrow/;

const planReplySchema = z.object({ days: z.array(z.object({ activities: z.array(z.object({}).loose()) }).loose()), stay: z.object({}).loose() }).loose();

/** A reply from the AI in which the Plan, every Day, every Activity and the stay carry all of `EXTRAS`. */
function replyCarryingExtras(): string {
  const base = planReplySchema.parse(JSON.parse(aPlanReplyText({ dayCount: 8 })));
  return JSON.stringify({
    ...base,
    ...EXTRAS,
    days: base.days.map((day) => ({ ...day, ...EXTRAS, activities: day.activities.map((activity) => ({ ...activity, ...EXTRAS })) })),
    stay: { ...base.stay, ...EXTRAS },
  });
}

function planFrom(reply: string): PlanView {
  const result = parsePlanReply(reply, TRIP);
  if (!result.ok) throw new Error(`The reply was refused: ${result.problem}`);
  return result.plan;
}

describe('the way the screens are read, which the rest of these tests depend on', () => {
  const SAMPLE =
    '<section><p>Weather: sunny, 25℃</p><iframe title="a map" src="https://maps.example.test"></iframe><img alt="tile" src="/t.png"/>' +
    '<button type="button">Book now</button><a href="https://book.example.test">Get tickets</a><input type="submit" value="Pay"/>' +
    '<div role="button" aria-label="Reserve">x</div><a href="/trips">Trips</a></section>';

  // @covers REQ-TRV-084@v1
  it('counts the embedded content that is there', () => {
    expect(countOf(SAMPLE, ['iframe'])).toBe(1);
    expect(countOf(SAMPLE, ['iframe', 'img', 'canvas'])).toBe(2);
    expect(countOf(SAMPLE, ['canvas', 'video'])).toBe(0);
  });

  // @covers REQ-TRV-090@v1
  it('finds every kind of control, and the address a link goes to', () => {
    expect(controlsIn(SAMPLE).map((control) => control.name).sort()).toEqual(['Book now', 'Get tickets', 'Pay', 'Reserve', 'Trips']);
    expect(addressesIn(SAMPLE)).toEqual(['https://maps.example.test', '/t.png', 'https://book.example.test', '/trips']);
    expect(controlsIn(SAMPLE).filter((control) => BOOKING.test(control.name))).toHaveLength(4);
  });

  // @covers REQ-TRV-082@v1
  it('reads what a person is given, the words in labels and addresses as well as the text, and finds what the word lists are for', () => {
    expect(shownIn(SAMPLE)).toMatch(WEATHER);
    expect(shownIn(SAMPLE)).toMatch(MAP);
  });

  // @covers REQ-TRV-083@v1
  it('takes the sentence that disclaims availability and bookings out, and only that', () => {
    const page = `<p>${PLAN_RECOMMENDATION_NOTICE}</p><p>3 rooms left</p>`;

    expect(shownIn(page)).toContain(PLAN_RECOMMENDATION_NOTICE);
    expect(shownWithoutNotice(page)).not.toContain('bookings');
    expect(shownWithoutNotice(page)).toMatch(AVAILABILITY);
  });
});

describe('a Plan, and every other planning screen', () => {
  // @covers REQ-TRV-082@v1
  it.each(EVERY_VIEW)('shows no weather in the %s', (_name, markup) => {
    expect(shownIn(markup)).not.toMatch(WEATHER);
  });

  // @covers REQ-TRV-083@v1
  it.each(EVERY_VIEW)('shows no live information, hotel or room availability in the %s, apart from the sentence that says there is none', (_name, markup) => {
    expect(shownWithoutNotice(markup)).not.toMatch(AVAILABILITY);
    expect(shownWithoutNotice(markup)).not.toMatch(LIVE_INFORMATION);
  });

  // @covers REQ-TRV-083@v1
  it.each(PLAN_VIEWS)('shows no flight information in the %s', (name) => {
    expect(shownWithoutNotice(views[name])).not.toMatch(FLIGHT_INFORMATION);
  });

  // @covers REQ-TRV-083@v1
  it.each(PLAN_VIEWS)('still says, in the %s, that Activities are not guaranteed availability, prices or bookings', (name) => {
    expect(shownIn(views[name])).toContain(PLAN_RECOMMENDATION_NOTICE);
  });

  // @covers REQ-TRV-084@v1
  it.each(EVERY_VIEW)('shows no map, image or other embedded content in the %s', (_name, markup) => {
    expect(countOf(markup, EMBEDS)).toBe(0);
    expect(shownIn(markup)).not.toMatch(MAP);
  });

  // @covers REQ-TRV-085@v1
  it.each(EVERY_VIEW)('offers no way to add a Trip to an external calendar in the %s', (_name, markup) => {
    expect(shownIn(markup)).not.toMatch(CALENDAR);
  });

  // @covers REQ-TRV-090@v1
  it.each(EVERY_VIEW)('offers no button, link or form to book or pay for anything in the %s', (_name, markup) => {
    expect(controlsIn(markup).filter((control) => BOOKING.test(control.name))).toEqual([]);
  });

  // @covers REQ-TRV-090@v1
  it.each(EVERY_VIEW)('sends the Traveler nowhere but inside the application from the %s', (_name, markup) => {
    expect(addressesIn(markup).filter((address) => !/^(\/|#)/.test(address))).toEqual([]);
  });
});

describe('an Activity opened to be read', () => {
  const rows = A_FULL_PLAN.days.flatMap((day) => day.activities).flatMap((activity) => activityDetailRows(activity, 'USD'));

  // @covers REQ-TRV-090@v1
  it('gives its time, duration, estimated cost, location and reason', () => {
    expect([...new Set(rows.map((row) => row.label))]).toEqual(expect.arrayContaining(['Time', 'Duration', 'Estimated cost', 'Location', 'Why it was recommended']));
  });

  // @covers REQ-TRV-090@v1
  it('gives no way to book or pay', () => {
    for (const row of rows) expect(`${row.label} ${row.value}`).not.toMatch(BOOKING);
  });

  // @covers REQ-TRV-082@v1
  it('gives no weather', () => {
    for (const row of rows) expect(`${row.label} ${row.value}`).not.toMatch(WEATHER);
  });

  // @covers REQ-TRV-084@v1
  it('gives no place on a map, only where it is in words', () => {
    for (const row of rows) expect(`${row.label} ${row.value}`).not.toMatch(MAP);
    expect(rows.some((row) => row.label === 'Location')).toBe(true);
  });
});

describe('what the AI may add to a Plan', () => {
  let plan: PlanView;
  let withoutExtras: PlanView;
  beforeAll(() => {
    plan = planFrom(replyCarryingExtras());
    withoutExtras = planFrom(aPlanReplyText({ dayCount: 8 }));
  });

  // @covers REQ-TRV-082@v1
  it('is kept without any weather or forecast', () => {
    expect(JSON.stringify(plan)).not.toMatch(EXTRA_KEYS);
    expect(JSON.stringify(plan)).not.toMatch(WEATHER);
  });

  // @covers REQ-TRV-083@v1
  it('is kept without any flight, hotel or availability', () => {
    expect(JSON.stringify(plan)).not.toMatch(/Grand Kyoto|NH123|rooms left/);
  });

  // @covers REQ-TRV-084@v1
  it('is kept without coordinates or a map address, so an Activity is only where it is in words', () => {
    expect(JSON.stringify(plan)).not.toMatch(/35\.0116|135\.7681|maps\.example/);
  });

  // @covers REQ-TRV-085@v1
  it('is kept without a calendar event', () => {
    expect(JSON.stringify(plan)).not.toMatch(/VEVENT|calendarEvent/);
  });

  // @covers REQ-TRV-090@v1
  it('is kept without a booking address, a ticket address, a provider or a price to pay', () => {
    expect(JSON.stringify(plan)).not.toMatch(/book\.example|tickets\.example|ExampleBookings|book now/);
  });

  // @covers REQ-TRV-082@v1
  it('leaves the Plan, every Day and every Activity with exactly the fields they have when the AI adds nothing', () => {
    const fieldsOf = (saved: PlanView) => saved.days.flatMap((day) => day.activities).map((activity) => Object.keys(activity).sort());
    expect(fieldsOf(plan)).toEqual(fieldsOf(withoutExtras));
    expect(Object.keys(plan).sort()).toEqual(Object.keys(withoutExtras).sort());
    expect(plan.days.map((day) => Object.keys(day).sort())).toEqual(withoutExtras.days.map((day) => Object.keys(day).sort()));
    expect(Object.keys(plan.stay).sort()).toEqual(Object.keys(withoutExtras.stay).sort());
  });

  // @covers REQ-TRV-083@v1
  it('is kept out of one regenerated Day as well', () => {
    const activities = planReplySchema.parse(JSON.parse(aPlanReplyText({ dayCount: 1 }))).days[0]?.activities ?? [];
    const reply = JSON.stringify({ dayNumber: 1, ...EXTRAS, activities: activities.map((activity) => ({ ...activity, ...EXTRAS })) });

    const result = parseDayReply(reply, 1);

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.ok ? result.activities : null)).not.toMatch(EXTRA_KEYS);
    expect(JSON.stringify(result.ok ? result.activities : null)).not.toMatch(EXTRA_VALUES);
  });

  // @covers REQ-TRV-090@v1
  it('is kept out of a suggested replacement Activity as well', () => {
    const [activity] = planReplySchema.parse(JSON.parse(aPlanReplyText({ dayCount: 1 }))).days[0]?.activities ?? [];
    const reply = JSON.stringify({ activity: { ...activity, ...EXTRAS }, ...EXTRAS });

    const result = parseActivityReply(reply);

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.ok ? result.activity : null)).not.toMatch(EXTRA_KEYS);
    expect(JSON.stringify(result.ok ? result.activity : null)).not.toMatch(EXTRA_VALUES);
  });
});
