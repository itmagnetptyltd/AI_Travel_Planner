import { expect, test, type Browser, type Page } from '@playwright/test';
import { emailsTo, linkFromEmail, waitForEmail } from './support/journeys';
import { aTripWithAPlan } from './support/plan-edit-journeys';
import { setAiScript, TRIP_DAY_COUNT } from './support/plan-journeys';
import { uniqueEmail } from './support/journeys';

test.afterEach(async () => {
  await setAiScript({ mode: 'ok', dayCount: TRIP_DAY_COUNT });
});

const shareSection = (page: Page) => page.getByRole('region', { name: 'Share and email' });
const recipientField = (page: Page) => shareSection(page).getByLabel('Email address to share with');

async function share(page: Page, address: string): Promise<void> {
  await recipientField(page).fill(address);
  await shareSection(page).getByRole('button', { name: 'Share', exact: true }).click();
}

/** Opens a link the way the person it was sent to would: in a browser that has never logged in. */
async function openAsAGuest(browser: Browser, path: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(path);
  return page;
}

test.describe('emailing the Plan to oneself', () => {
  // @covers REQ-TRV-054@v1
  test('a Traveler clicks "Email me this Plan", is told it was sent, and the email holds the Days, the total and a link', async ({ browser }) => {
    const { page, email } = await aTripWithAPlan(browser, 'email-plan');

    await shareSection(page).getByRole('button', { name: 'Email me this Plan' }).click();

    await expect(page.getByText(`The Plan was emailed to ${email}.`)).toBeVisible();
    const message = await waitForEmail(email, /^Your Plan for/);
    expect(message.from).toBe('no-reply@example.test');
    for (let day = 1; day <= TRIP_DAY_COUNT; day += 1) expect(message.text).toContain(`Day ${day},`);
    expect(message.text).toContain('Estimated total: 550 USD');
    expect(message.text).toMatch(/\/shared\/[A-Za-z0-9_-]{43}/);
  });

  // @covers REQ-TRV-054@v1
  test('sends nothing when the Plan is generated: no email carries the Plan until it is asked for', async ({ browser }) => {
    const { page, email } = await aTripWithAPlan(browser, 'email-none');

    await expect(shareSection(page)).toBeVisible();

    expect((await emailsTo(email)).filter((message) => /Estimated total/.test(message.text))).toEqual([]);
  });
});

test.describe('sharing the Plan with another person', () => {
  // @covers REQ-TRV-058@v1
  test('a Traveler shares a Trip, the friend gets an email, and its link opens a read-only Plan with no login', async ({ browser }) => {
    const { page, tripName } = await aTripWithAPlan(browser, 'share-plan');
    const friend = uniqueEmail('friend');

    await share(page, friend);

    await expect(page.getByText(`The Plan was shared with ${friend}.`)).toBeVisible();
    await expect(page.getByRole('list', { name: 'Links to this Plan' })).toContainText(friend);
    const email = await waitForEmail(friend, /shared the Plan for/);
    expect(email.text).toContain('Estimated total: 550 USD');
    const guest = await openAsAGuest(browser, await linkFromEmail(friend, /shared the Plan for/));

    await expect(guest.getByRole('heading', { name: tripName })).toBeVisible();
    await expect(guest.getByText('These Activities, times and costs are recommendations, not guaranteed availability, prices or bookings.')).toBeVisible();
    await expect(guest.getByRole('heading', { name: /^Day 1,/ })).toBeVisible();
    await expect(guest.getByRole('term').filter({ hasText: 'Estimated total' })).toBeVisible();
    await expect(guest.getByRole('button')).toHaveCount(0);
    await expect(guest.getByRole('textbox')).toHaveCount(0);
  });

  // @covers REQ-TRV-058@v1
  test('a Traveler revokes the link and it is refused from then on, showing nothing of the Plan', async ({ browser }) => {
    const { page, tripName } = await aTripWithAPlan(browser, 'share-revoke');
    const friend = uniqueEmail('friend');
    await share(page, friend);
    const path = await linkFromEmail(friend, /shared the Plan for/);
    const guest = await openAsAGuest(browser, path);
    await expect(guest.getByRole('heading', { name: tripName })).toBeVisible();

    await shareSection(page).getByRole('button', { name: `Revoke link for ${friend}` }).click();

    await expect(page.getByRole('list', { name: 'Links to this Plan' })).toContainText('Revoked');
    await guest.reload();
    await expect(guest.getByRole('heading', { name: 'This link is not valid.' })).toBeVisible();
    await expect(guest.getByText(tripName)).toHaveCount(0);
    await expect(guest.getByText('Estimated total')).toHaveCount(0);
  });

  // @covers REQ-TRV-058@v1
  test('a link with one character of its token changed is refused', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'share-altered');
    const friend = uniqueEmail('friend');
    await share(page, friend);
    const path = await linkFromEmail(friend, /shared the Plan for/);
    const changed = `${path.slice(0, -1)}${path.endsWith('A') ? 'B' : 'A'}`;

    const guest = await openAsAGuest(browser, changed);

    await expect(guest.getByRole('heading', { name: 'This link is not valid.' })).toBeVisible();
    await expect(guest.getByText('Estimated total')).toHaveCount(0);
  });
});

test.describe('sharing with a malformed address', () => {
  // @covers REQ-TRV-059@v1
  test('is refused beside the recipient field, no email is written, and nothing is listed', async ({ browser }) => {
    const { page } = await aTripWithAPlan(browser, 'share-malformed');

    await share(page, 'friend-at-example');

    await expect(shareSection(page).locator('.field-error')).toHaveText('Enter a valid email address.');
    await expect(recipientField(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('list', { name: 'Links to this Plan' })).toHaveCount(0);
    expect(await emailsTo('friend-at-example')).toEqual([]);
  });
});
