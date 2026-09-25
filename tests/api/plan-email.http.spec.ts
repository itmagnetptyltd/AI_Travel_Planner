import { describe, expect, test } from 'vitest';
import { PLAN_RECOMMENDATION_NOTICE } from '../../src/shared/plan-notice';
import { aPlanReplyCosting, COSTS_TOTALLING_3200 } from '../support/a-budget';
import { aTravelerWithACostedPlan } from '../support/a-costed-journey';
import { aTravelerWithATrip, TRAVELER_EMAIL } from '../support/a-saved-plan-journey';
import { emailPlan, listShares, openSharedLink, sharedViewOf, sharesOf, tokenSentTo } from '../support/a-share-api';
import { aConfirmedTravelerSession } from '../support/a-trip';
import { EMAIL_FROM } from '../support/build-test-app';
import { regeneratePlanOf } from '../support/a-plan-edits';

const planEmailsTo = (ready: Awaited<ReturnType<typeof aTravelerWithACostedPlan>>) =>
  ready.testApp.email.sentTo(TRAVELER_EMAIL).filter((message) => message.subject.startsWith('Your Plan for'));

describe('asking for the Plan by email', () => {
  // @covers REQ-TRV-054@v1
  test('sends one email to the account address from the configured sender, and says it was sent', async () => {
    const ready = await aTravelerWithACostedPlan();

    const response = await emailPlan(ready);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sentTo: TRAVELER_EMAIL });
    expect(planEmailsTo(ready)).toHaveLength(1);
    expect(planEmailsTo(ready)[0]).toMatchObject({ to: TRAVELER_EMAIL, from: EMAIL_FROM });
    expect(EMAIL_FROM).toBe('no-reply@itmagnet.com.au');
  });

  // @covers REQ-TRV-054@v1
  test('lists all 8 Days and the total estimate of 3200 USD, with a link that opens the read-only view', async () => {
    const ready = await aTravelerWithACostedPlan();

    await emailPlan(ready);

    const text = planEmailsTo(ready)[0]?.text ?? '';
    for (let day = 1; day <= 8; day += 1) expect(text).toContain(`Day ${day},`);
    expect(text).toContain('Estimated total: 3200 USD');
    const opened = await openSharedLink(ready, tokenSentTo(ready, TRAVELER_EMAIL));
    expect(opened.statusCode).toBe(200);
    expect(sharedViewOf(opened).estimates.total).toBe(3200);
  });

  // @covers REQ-TRV-054@v1
  test('is not sent when a Plan is generated or regenerated and the Traveler has not asked for it', async () => {
    const ready = await aTravelerWithACostedPlan();
    ready.testApp.ai.replyWith(aPlanReplyCosting({ costs: COSTS_TOTALLING_3200 }));

    const again = await regeneratePlanOf(ready);

    expect(again.statusCode).toBe(201);
    const carrying = ready.testApp.email.sent.filter((message) => /Estimated total|Day 1,/.test(message.text));
    expect(carrying).toEqual([]);
  });

  // @covers REQ-TRV-054@v1
  test('tells the Traveler and keeps nothing when the mail service is down', async () => {
    const ready = await aTravelerWithACostedPlan();
    ready.testApp.email.setDown(true);

    const response = await emailPlan(ready);

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ code: 'EMAIL_FAILED' });
    expect(sharesOf(await listShares(ready))).toEqual([]);
  });

  // @covers REQ-TRV-054@v1
  test('answers 401 without a login, 404 PLAN_NOT_FOUND for a Trip with no Plan, and the same 404 for another Traveler', async () => {
    const ready = await aTravelerWithACostedPlan();
    const bare = await aTravelerWithATrip();
    const other = await aConfirmedTravelerSession(ready.testApp, 'other@example.com');

    expect((await emailPlan(ready, {})).statusCode).toBe(401);
    const noPlan = await emailPlan(bare);
    expect(noPlan.statusCode).toBe(404);
    expect(noPlan.json()).toMatchObject({ code: 'PLAN_NOT_FOUND' });
    const theirs = await emailPlan(ready, other);
    expect(theirs.statusCode).toBe(404);
    expect(theirs.json()).toMatchObject({ code: 'TRIP_NOT_FOUND' });
    expect(planEmailsTo(ready)).toEqual([]);
  });
});

describe('a Plan email says it is a recommendation', () => {
  // @covers REQ-TRV-032@v1
  test('in the email, in the same words as the Plan on screen', async () => {
    const ready = await aTravelerWithACostedPlan();

    await emailPlan(ready);

    expect(planEmailsTo(ready)[0]?.text).toContain(PLAN_RECOMMENDATION_NOTICE);
    expect(PLAN_RECOMMENDATION_NOTICE).toMatch(/recommendations, not guaranteed availability, prices or bookings/);
  });

  // @covers REQ-TRV-032@v1
  test('in the read-only view the email links to', async () => {
    const ready = await aTravelerWithACostedPlan();
    await emailPlan(ready);

    const opened = await openSharedLink(ready, tokenSentTo(ready, TRAVELER_EMAIL));

    expect(sharedViewOf(opened).notice).toBe(PLAN_RECOMMENDATION_NOTICE);
  });
});
