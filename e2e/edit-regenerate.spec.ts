import { expect, test, type Page } from '@playwright/test';
import { setDailyLimit } from './support/ai-limit-journeys';
import {
  aTripWithAPlan,
  changeStartTime,
  confirmation,
  daySection,
  EVENING,
  fillActivityForm,
  headlinesOf,
  LUNCH,
  MORNING,
  moveActivityToDay,
  openActivity,
  removeActivity,
} from './support/plan-edit-journeys';
import { expectDaysShown, generatePlan, setAiScript, TRIP_DAY_COUNT } from './support/plan-journeys';
import { aDestinationAddedByAdministrator, chooseDestination, daysFromToday, openTrip } from './support/trip-journeys';

const versionList = (page: Page) => page.getByRole('list', { name: 'Plan versions' });
const normalDay = [`09:00 ${MORNING}`, `12:30 ${LUNCH}`, `18:00 ${EVENING}`];

test.afterEach(async () => {
  await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT });
});

test.describe('changing an Activity by hand', () => {
  // @covers REQ-TRV-045@v1
  test('a Traveler changes an Activity from 09:00 to 11:00 and still sees it at 11:00 after reloading', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'edit-time');
    const item = await openActivity(page, 1, MORNING);

    await changeStartTime(page, item, '11:00');

    await expect(headlinesOf(page, 1)).toHaveText([`11:00 ${MORNING}`, `12:30 ${LUNCH}`, `18:00 ${EVENING}`]);
    await page.reload();
    await expect(headlinesOf(page, 1)).toHaveText([`11:00 ${MORNING}`, `12:30 ${LUNCH}`, `18:00 ${EVENING}`]);
    await expect(headlinesOf(page, 2)).toHaveText(normalDay);
  });

  // @covers REQ-TRV-045@v1
  test('a start time that is not a time is refused with a message, and nothing is saved', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'edit-bad-time');
    const item = await openActivity(page, 1, MORNING);
    await item.getByRole('button', { name: 'Edit', exact: true }).click();
    const form = item.getByRole('form', { name: 'Edit Activity' });

    await form.getByLabel('Start time').fill('');
    await form.getByLabel('Title').fill('   ');
    await form.getByRole('button', { name: 'Save Activity' }).click();

    await expect(page.getByRole('alert')).toContainText('Check the title.');
    await page.reload();
    await expect(headlinesOf(page, 1)).toHaveText(normalDay);
    await expect(versionList(page).getByRole('listitem')).toHaveCount(1);
  });
});

test.describe('removing an Activity', () => {
  // @covers REQ-TRV-046@v1
  test('a Traveler removes the lunch from Day 2, and it is gone after reloading', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'remove');
    const item = await openActivity(page, 2, LUNCH);

    await removeActivity(item);

    await expect(headlinesOf(page, 2)).toHaveText([`09:00 ${MORNING}`, `18:00 ${EVENING}`]);
    await page.reload();
    await expect(headlinesOf(page, 2)).toHaveText([`09:00 ${MORNING}`, `18:00 ${EVENING}`]);
    await expect(headlinesOf(page, 1)).toHaveText(normalDay);
  });
});

test.describe('moving an Activity to another Day', () => {
  // @covers REQ-TRV-048@v1
  test('a Traveler moves the evening walk from Day 2 to Day 4, and it is on Day 4 and not on Day 2, also after reloading', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'move');
    const item = await openActivity(page, 2, EVENING);

    await moveActivityToDay(item, 4);

    for (const reloaded of [false, true]) {
      if (reloaded) await page.reload();
      await expect(headlinesOf(page, 2)).toHaveText([`09:00 ${MORNING}`, `12:30 ${LUNCH}`]);
      await expect(headlinesOf(page, 4)).toHaveCount(4);
    }
  });

  // @covers REQ-TRV-048@v1
  test('a Day that receives three Activities holds six, in start-time order', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'move-order');

    await moveActivityToDay(await openActivity(page, 1, LUNCH), 4);
    await moveActivityToDay(await openActivity(page, 2, MORNING), 4);
    await moveActivityToDay(await openActivity(page, 3, EVENING), 4);

    await expect(headlinesOf(page, 4)).toHaveText([
      `09:00 ${MORNING}`,
      `09:00 ${MORNING}`,
      `12:30 ${LUNCH}`,
      `12:30 ${LUNCH}`,
      `18:00 ${EVENING}`,
      `18:00 ${EVENING}`,
    ]);
  });
});

test.describe('replacing an Activity', () => {
  const typed = { title: 'Sunrise swim', startTime: '09:00', duration: '45', cost: '0', location: 'Kamo river' };

  // @covers REQ-TRV-047@v1
  test('a Traveler replaces the morning visit with an Activity they type, and the visit is gone', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'replace-typed');
    const item = await openActivity(page, 1, MORNING);

    await item.getByRole('button', { name: 'Replace this Activity' }).click();
    await fillActivityForm(item.getByRole('form', { name: 'Type your own Activity' }), typed);
    await item.getByRole('button', { name: 'Use my Activity' }).click();

    await expect(headlinesOf(page, 1)).toHaveText([`09:00 Sunrise swim`, `12:30 ${LUNCH}`, `18:00 ${EVENING}`]);
    await page.reload();
    await expect(headlinesOf(page, 1)).toHaveText([`09:00 Sunrise swim`, `12:30 ${LUNCH}`, `18:00 ${EVENING}`]);
  });

  // @covers REQ-TRV-047@v1
  test('a Traveler asks the AI for a replacement, sees the suggestion, and accepts it in place of the visit', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'replace-ai');
    await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT, label: 'Suggested' });
    const item = await openActivity(page, 1, MORNING);

    await item.getByRole('button', { name: 'Replace this Activity' }).click();
    await item.getByRole('button', { name: 'Ask the AI for a suggestion' }).click();
    const suggestion = item.getByRole('group', { name: 'AI suggestion' });
    await expect(suggestion).toContainText('Suggested: Tea ceremony at a quiet garden');
    await expect(headlinesOf(page, 1)).toHaveText(normalDay);
    await suggestion.getByRole('button', { name: 'Use this suggestion' }).click();

    await expect(headlinesOf(page, 1)).toHaveText([`09:00 Suggested: Tea ceremony at a quiet garden`, `12:30 ${LUNCH}`, `18:00 ${EVENING}`]);
  });

  // @covers REQ-TRV-047@v1
  test('a Traveler who has reached the daily limit is refused an AI suggestion with the reset time, and can still type their own', async ({ browser }) => {
    const { page, admin } = await aTripWithAPlan(browser, 'replace-limit');
    await setDailyLimit(admin, 1);
    try {
      const item = await openActivity(page, 1, MORNING);
      await item.getByRole('button', { name: 'Replace this Activity' }).click();

      await item.getByRole('button', { name: 'Ask the AI for a suggestion' }).click();

      await expect(page.getByRole('alert')).toContainText("today's limit of 1 Plan generations");
      await expect(page.getByRole('alert')).toContainText(/resets at \d{4}-\d\d-\d\d 00:00 UTC/);
      await fillActivityForm(item.getByRole('form', { name: 'Type your own Activity' }), typed);
      await item.getByRole('button', { name: 'Use my Activity' }).click();
      await expect(headlinesOf(page, 1)).toHaveText([`09:00 Sunrise swim`, `12:30 ${LUNCH}`, `18:00 ${EVENING}`]);
    } finally {
      await setDailyLimit(admin, 20);
    }
  });
});

test.describe('regenerating the whole Plan', () => {
  // @covers REQ-TRV-041@v1
  test('a Traveler who changed nothing regenerates at once, and can restore the earlier Plan', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'regen-plain');
    await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT, label: 'Second idea' });

    await page.getByRole('button', { name: 'Regenerate Plan', exact: true }).click();

    await expect(headlinesOf(page, 1).first()).toHaveText(`09:00 Second idea: ${MORNING}`);
    await expect(versionList(page)).toContainText('Version 2');
    await page.getByRole('button', { name: 'Restore Version 1' }).click();
    await expect(headlinesOf(page, 1)).toHaveText(normalDay);
  });

  // @covers REQ-TRV-041@v1
  test('warns before asking the AI when an Activity was changed by hand, changes nothing on Cancel, and replaces it on confirming', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'regen-warn');
    await changeStartTime(page, await openActivity(page, 3, MORNING), '11:11');
    await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT, label: 'Second idea' });

    await page.getByRole('button', { name: 'Regenerate Plan', exact: true }).click();

    await expect(confirmation(page)).toContainText('Day 3');
    await expect(confirmation(page)).toContainText(/replace/i);
    await expect(headlinesOf(page, 1).first()).toHaveText(`09:00 ${MORNING}`);
    await confirmation(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmation(page)).toHaveCount(0);
    await expect(headlinesOf(page, 3).first()).toHaveText(`11:11 ${MORNING}`);

    await page.getByRole('button', { name: 'Regenerate Plan', exact: true }).click();
    await confirmation(page).getByRole('button', { name: 'Replace my changes and regenerate' }).click();

    await expect(headlinesOf(page, 3).first()).toHaveText(`09:00 Second idea: ${MORNING}`);
    await expect(headlinesOf(page, 1).first()).toHaveText(`09:00 Second idea: ${MORNING}`);
    await page.getByRole('button', { name: 'Restore Version 2' }).click();
    await expect(headlinesOf(page, 3).first()).toHaveText(`11:11 ${MORNING}`);
  });

  // @covers REQ-TRV-041@v1
  test('a Traveler at the daily limit is refused with the reset time, and the Plan on show is unchanged', async ({ browser }) => {
    const { page, admin } = await aTripWithAPlan(browser, 'regen-limit');
    await setDailyLimit(admin, 1);
    try {
      await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT, label: 'Second idea' });

      await page.getByRole('button', { name: 'Regenerate Plan', exact: true }).click();

      await expect(page.getByRole('alert')).toContainText("today's limit of 1 Plan generations");
      await expect(page.getByRole('alert')).toContainText(/resets at \d{4}-\d\d-\d\d 00:00 UTC/);
      await expectDaysShown(page);
      await expect(headlinesOf(page, 1)).toHaveText(normalDay);
      await expect(versionList(page).getByRole('listitem')).toHaveCount(1);
    } finally {
      await setDailyLimit(admin, 20);
    }
  });

  // @covers REQ-TRV-102@v1
  test('when the AI fails the Traveler sees the unavailable message and the earlier Plan stays on show', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'regen-fails');
    await setAiScript({ mode: 'error' });

    await page.getByRole('button', { name: 'Regenerate Plan', exact: true }).click();

    await expect(page.getByRole('alert')).toContainText('The AI planner is unavailable right now');
    await expectDaysShown(page);
    await expect(headlinesOf(page, 1)).toHaveText(normalDay);
    await expect(versionList(page).getByRole('listitem')).toHaveCount(1);
  });

  // @covers REQ-TRV-094@v1
  test('a Trip whose Destination an Administrator disabled still regenerates, and still shows that Destination', async ({ browser }) => {
    const { page, admin, destinationName } = await aTripWithAPlan(browser, 'regen-disabled');
    await admin.goto('/admin/destinations');
    await admin.getByRole('row', { name: new RegExp(destinationName) }).getByRole('button', { name: 'Disable' }).click();
    await expect(admin.getByRole('row', { name: new RegExp(destinationName) })).toContainText('Disabled');
    await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT, label: 'Second idea' });
    await page.reload();

    await page.getByRole('button', { name: 'Regenerate Plan', exact: true }).click();

    await expect(headlinesOf(page, 1).first()).toHaveText(`09:00 Second idea: ${MORNING}`);
    await expect(page.getByText(`${destinationName}, Japan`)).toBeVisible();
  });
});

test.describe('regenerating one Day', () => {
  // @covers REQ-TRV-042@v1
  test('offers regeneration for the whole Plan and for each Day, and not for a single Activity', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'regen-offers');

    await expect(page.getByRole('button', { name: 'Regenerate Plan', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Regenerate Day \d+$/ })).toHaveText([
      'Regenerate Day 1',
      'Regenerate Day 2',
      'Regenerate Day 3',
      'Regenerate Day 4',
    ]);
    const item = await openActivity(page, 2, LUNCH);
    await expect(item.getByRole('button', { name: /regenerate/i })).toHaveCount(0);
    await expect(item.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  });

  // @covers REQ-TRV-042@v1
  test('regenerating Day 2 replaces its Activities and leaves the other Days as they were', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'regen-day');
    await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT, label: 'Fresh' });

    await page.getByRole('button', { name: 'Regenerate Day 2', exact: true }).click();

    await expect(headlinesOf(page, 2)).toHaveText([`09:00 Fresh: ${MORNING}`, `12:30 Fresh: ${LUNCH}`, `18:00 Fresh: ${EVENING}`]);
    for (const other of [1, 3, 4]) await expect(headlinesOf(page, other)).toHaveText(normalDay);
    await page.reload();
    await expect(headlinesOf(page, 2).first()).toHaveText(`09:00 Fresh: ${MORNING}`);
    await expect(headlinesOf(page, 3)).toHaveText(normalDay);
  });

  // @covers REQ-TRV-042@v1
  test('warns before asking the AI when the Day holds a hand-changed Activity, and leaves the hand edits on another Day alone', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'regen-day-warn', 5);
    await changeStartTime(page, await openActivity(page, 4, MORNING), '11:11');
    await changeStartTime(page, await openActivity(page, 5, MORNING), '11:12');
    await setAiScript({ mode: 'ok', dayCount: 5, label: 'Fresh' });

    await page.getByRole('button', { name: 'Regenerate Day 4', exact: true }).click();

    await expect(confirmation(page)).toContainText('Day 4');
    await expect(headlinesOf(page, 4).first()).toHaveText(`11:11 ${MORNING}`);
    await confirmation(page).getByRole('button', { name: 'Replace my changes and regenerate' }).click();

    await expect(headlinesOf(page, 4).first()).toHaveText(`09:00 Fresh: ${MORNING}`);
    await expect(headlinesOf(page, 5).first()).toHaveText(`11:12 ${MORNING}`);
  });

  // @covers REQ-TRV-102@v1
  test('when the AI fails regenerating a Day, the Plan on show is unchanged', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'regen-day-fails');
    await setAiScript({ mode: 'error' });

    await page.getByRole('button', { name: 'Regenerate Day 2', exact: true }).click();

    await expect(page.getByRole('alert')).toContainText('The AI planner is unavailable right now');
    await expect(headlinesOf(page, 2)).toHaveText(normalDay);
  });
});

test.describe('changing a Plan while the AI is not responding', () => {
  // @covers REQ-TRV-103@v1
  test('edits, removals and moves are all saved and shown after reloading, with the AI hanging', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'ai-down');
    await setAiScript({ mode: 'hang' });

    await changeStartTime(page, await openActivity(page, 1, MORNING), '10:15');
    await removeActivity(await openActivity(page, 2, LUNCH));
    await moveActivityToDay(await openActivity(page, 3, EVENING), 4);

    await page.reload();
    await expect(headlinesOf(page, 1).first()).toHaveText(`10:15 ${MORNING}`);
    await expect(headlinesOf(page, 2)).toHaveText([`09:00 ${MORNING}`, `18:00 ${EVENING}`]);
    await expect(headlinesOf(page, 3)).toHaveText([`09:00 ${MORNING}`, `12:30 ${LUNCH}`]);
    await expect(headlinesOf(page, 4)).toHaveCount(4);
  });
});

test.describe('changing the Trip when it has a Plan', () => {
  const editTrip = async (page: Page) => {
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edit Trip' })).toBeVisible();
  };

  // @covers REQ-TRV-098@v1
  test('changing the Destination warns first, changes nothing until confirmed, then shows a Plan for the new Destination', async ({ browser }) => {
    const { page, tripName, destinationName } = await aTripWithAPlan(browser, 'change-destination');
    const { name: newName } = await aDestinationAddedByAdministrator(browser, 'Osaka');
    await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT, label: 'Osaka idea' });

    await editTrip(page);
    await chooseDestination(page, newName, newName);
    await page.getByRole('button', { name: 'Save changes' }).click();

    const warning = page.getByRole('group', { name: 'Confirm change to the Plan' });
    await expect(warning).toContainText('Changing the Destination');
    await expect(warning).toContainText(/regenerat|new one/i);
    await openTrip(page, tripName);
    await expect(page.getByText(`${destinationName}, Japan`)).toBeVisible();
    await expect(headlinesOf(page, 1)).toHaveText(normalDay);

    await editTrip(page);
    await chooseDestination(page, newName, newName);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.getByRole('group', { name: 'Confirm change to the Plan' }).getByRole('button', { name: 'Change the Trip and its Plan' }).click();
    await expect(page.getByRole('status')).toHaveText('Trip saved.');
    await openTrip(page, tripName);

    await expect(page.getByText(`${newName}, Japan`)).toBeVisible();
    await expect(headlinesOf(page, 1).first()).toHaveText(`09:00 Osaka idea: ${MORNING}`);
  });

  // @covers REQ-TRV-098@v1
  test('shortening an 8-Day Trip to 5 Days warns that Days 6 to 8 will be dropped, and keeps the first 5 Days once confirmed', async ({ browser }) => {
    const { page, tripName } = await aTripWithAPlan(browser, 'change-shorter', 8);

    await editTrip(page);
    await page.getByLabel('End date').fill(daysFromToday(7 + 4));
    await page.getByRole('button', { name: 'Save changes' }).click();

    const warning = page.getByRole('group', { name: 'Confirm change to the Plan' });
    await expect(warning).toContainText('Days 6 to 8 will be dropped');
    await openTrip(page, tripName);
    await expectDaysShown(page, 8);

    await editTrip(page);
    await page.getByLabel('End date').fill(daysFromToday(7 + 4));
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.getByRole('group', { name: 'Confirm change to the Plan' }).getByRole('button', { name: 'Change the Trip and its Plan' }).click();
    await expect(page.getByRole('status')).toHaveText('Trip saved.');
    await openTrip(page, tripName);

    await expectDaysShown(page, 5);
    await expect(daySection(page, 6)).toHaveCount(0);
    await expect(headlinesOf(page, 5)).toHaveText(normalDay);
  });

  // @covers REQ-TRV-098@v1
  test('lengthening the Trip to 10 Days keeps Days 1 to 8, adds Days 9 and 10 empty, and offers to generate them', async ({ browser }) => {
    const { page, tripName } = await aTripWithAPlan(browser, 'change-longer', 8);

    await editTrip(page);
    await page.getByLabel('End date').fill(daysFromToday(7 + 9));
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status')).toHaveText('Trip saved.');
    await openTrip(page, tripName);

    await expectDaysShown(page, 10);
    await expect(headlinesOf(page, 8)).toHaveText(normalDay);
    await expect(headlinesOf(page, 9)).toHaveCount(0);
    await expect(daySection(page, 9)).toContainText('No Activities');
    await expect(page.getByRole('button', { name: 'Generate Day 10', exact: true })).toBeVisible();
    await setAiScript({ mode: 'ok', dayCount: 10, label: 'Late' });

    await page.getByRole('button', { name: 'Generate Day 9', exact: true }).click();

    await expect(headlinesOf(page, 9).first()).toHaveText(`09:00 Late: ${MORNING}`);
    await expect(headlinesOf(page, 10)).toHaveCount(0);
  });

  // @covers REQ-TRV-098@v1
  test('moving the Trip two days later dates Day 1 two days later, with the same Activities', async ({ browser }) => {
    const { page, tripName } = await aTripWithAPlan(browser, 'change-moved');

    await editTrip(page);
    await page.getByLabel('Start date').fill(daysFromToday(9));
    await page.getByLabel('End date').fill(daysFromToday(12));
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status')).toHaveText('Trip saved.');
    await openTrip(page, tripName);

    await expect(page.getByRole('heading', { name: `Day 1, ${daysFromToday(9)}` })).toBeVisible();
    await expect(page.getByRole('heading', { name: `Day 4, ${daysFromToday(12)}` })).toBeVisible();
    await expect(headlinesOf(page, 1)).toHaveText(normalDay);
  });

  // @covers REQ-TRV-098@v1
  test('changing the adults leaves the Plan as it was and shows a banner suggesting regenerating or re-estimating', async ({ browser }) => {
    const { page, tripName } = await aTripWithAPlan(browser, 'change-adults');
    await expect(page.getByRole('note')).toHaveCount(0);

    await editTrip(page);
    await page.getByLabel('Adults').fill('3');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status')).toHaveText('Trip saved.');
    await openTrip(page, tripName);

    await expect(page.getByRole('note')).toContainText(/regenerate the Plan or re-estimate/i);
    await expect(headlinesOf(page, 1)).toHaveText(normalDay);
    await expect(versionList(page).getByRole('listitem')).toHaveCount(1);
    await generatePlan(page);
    await expect(page.getByRole('note')).toHaveCount(0);
  });

  // @covers REQ-TRV-098@v1
  test('when the AI fails the Destination change is refused with the unavailable message, and the Trip keeps its Destination and Plan', async ({ browser }) => {
    const { page, tripName, destinationName } = await aTripWithAPlan(browser, 'change-fails');
    const { name: newName } = await aDestinationAddedByAdministrator(browser, 'Nara');
    await setAiScript({ mode: 'error' });

    await editTrip(page);
    await chooseDestination(page, newName, newName);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.getByRole('group', { name: 'Confirm change to the Plan' }).getByRole('button', { name: 'Change the Trip and its Plan' }).click();

    await expect(page.getByRole('alert')).toContainText('The AI planner is unavailable right now');
    await openTrip(page, tripName);
    await expect(page.getByText(`${destinationName}, Japan`)).toBeVisible();
    await expect(headlinesOf(page, 1)).toHaveText(normalDay);
  });
});
