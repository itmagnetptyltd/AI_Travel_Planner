import { expect, test, type Page } from '@playwright/test';
import { PLAN_RECOMMENDATION_NOTICE } from '../src/shared/plan-notice';
import { AVAILABILITY, BOOKING, CALENDAR, FLIGHT_INFORMATION, LANGUAGE, LIVE_INFORMATION, MAP, VOICE, WEATHER } from '../tests/support/out-of-scope-words';
import { aTripWithAPlan } from './support/plan-edit-journeys';
import { setAiScript, TRIP_DAY_COUNT } from './support/plan-journeys';

test.afterEach(async () => {
  await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT });
});

/** Nine features are not part of this build (BRD §28). What follows is looked for on the real pages, in a real browser. */
const EMBEDS = 'iframe, canvas, img, video, audio, embed, object, map';

/** The page's text, with the one sentence that has to say "availability" and "bookings" in order to disclaim them taken out. */
const textOf = async (page: Page): Promise<string> => (await page.locator('body').innerText()).split(PLAN_RECOMMENDATION_NOTICE).join(' ');

const namesOfControls = async (page: Page): Promise<string[]> => [
  ...(await page.getByRole('button').allInnerTexts()),
  ...(await page.getByRole('link').allInnerTexts()),
];

test.describe('a Trip with a generated Plan, in a real browser', () => {
  // @covers REQ-TRV-082@v1
  // @covers REQ-TRV-083@v1
  // @covers REQ-TRV-084@v1
  // @covers REQ-TRV-085@v1
  test('shows no weather, flight or hotel availability, map, calendar or embedded content', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'out-of-scope-view');

    const text = await textOf(page);

    expect(text).not.toMatch(WEATHER);
    expect(text).not.toMatch(MAP);
    expect(text).not.toMatch(CALENDAR);
    expect(text).not.toMatch(AVAILABILITY);
    expect(text).not.toMatch(FLIGHT_INFORMATION);
    expect(text).not.toMatch(LIVE_INFORMATION);
    await expect(page.locator(EMBEDS)).toHaveCount(0);
    expect((await namesOfControls(page)).filter((name) => CALENDAR.test(name) || MAP.test(name))).toEqual([]);
  });

  // @covers REQ-TRV-090@v1
  test('offers no way to book or pay for anything, on the Plan or on an Activity opened to be read', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'out-of-scope-booking');

    await page.getByRole('button', { name: /Morning temple visit/ }).first().click();

    await expect(page.getByText('Why it was recommended').first()).toBeVisible();
    expect((await namesOfControls(page)).filter((name) => BOOKING.test(name))).toEqual([]);
    expect(await page.locator('a[href^="http"]').count()).toBe(0);
  });

  // @covers REQ-TRV-086@v1
  test('offers no choice of language when asking for a Plan or making a Trip', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'out-of-scope-language');

    await expect(page.getByLabel(LANGUAGE)).toHaveCount(0);
    await expect(page.getByRole('button', { name: LANGUAGE })).toHaveCount(0);
    await page.goto('/trips/new');
    await expect(page.getByLabel('Trip name')).toBeVisible();
    await expect(page.getByLabel(LANGUAGE)).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: LANGUAGE })).toHaveCount(0);
  });

  // @covers REQ-TRV-087@v1
  test('has a chat that takes only typed text: one text box, no microphone, recording or upload', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'out-of-scope-voice');
    const chat = page.getByRole('region', { name: 'Chat' });

    await expect(chat.getByRole('textbox')).toHaveCount(1);
    await expect(chat.locator('input, audio, video, [type="file"]')).toHaveCount(0);
    expect(await chat.innerText()).not.toMatch(VOICE);
    expect(await chat.getByRole('button').allInnerTexts()).toEqual(['Send']);
  });
});
