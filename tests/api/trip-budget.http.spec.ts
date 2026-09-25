import { describe, expect, test } from 'vitest';
import { requestTextOf } from '../../src/server/ai/ai-service';
import type { ChatMessage } from '../../src/shared/chat-schemas';
import type { SavedPlan } from '../../src/shared/plan-schemas';
import type { BudgetCategory, TripBudget } from '../../src/shared/trip-budget';
import { aPlanReplyCosting, COSTS_TOTALLING_5600, type CostsByCategory } from '../support/a-budget';
import { acceptChange, activitiesOnDay, aChatReplyText, changeFor, messagesOf, sendChat } from '../support/a-chat';
import { A_TYPED_ACTIVITY, planOf, removeActivityOf, replaceActivityOf } from '../support/a-plan-edits';
import { aTravelerWithATrip, generatePlan, type TravelerWithTrip } from '../support/a-saved-plan-journey';
import { aConfirmedTravelerSession } from '../support/a-trip';

type Ready = TravelerWithTrip & { readonly plan: SavedPlan };

async function aTravelerWithACostedPlan(
  costs: CostsByCategory,
  options: Parameters<typeof aTravelerWithATrip>[0] = {},
): Promise<Ready> {
  const ready = await aTravelerWithATrip(options);
  ready.testApp.ai.replyWith(aPlanReplyCosting({ days: 8, nightly: 150, costs }));
  const generated = await generatePlan(ready);
  if (generated.statusCode !== 201) throw new Error(`Generating the Plan failed with ${generated.statusCode}`);
  return { ...ready, plan: generated.json() as SavedPlan };
}

const budgetUrl = (ready: Pick<Ready, 'tripId'>) => `/api/trips/${ready.tripId}/budget`;
const readBudget = (ready: Pick<Ready, 'testApp' | 'tripId' | 'cookies'>, cookies = ready.cookies) => ready.testApp.app.inject({ method: 'GET', url: budgetUrl(ready), cookies });
const budgetJson = async (ready: Ready): Promise<TripBudget> => (await readBudget(ready)).json() as TripBudget;
const amountOf = (budget: TripBudget, category: BudgetCategory) => budget.estimates.find((estimate) => estimate.category === category)?.amount;

describe('the estimate for each category of a saved Plan', () => {
  // @covers REQ-TRV-049@v1
  test('answers 200 with an estimate for each of six categories, the amounts the AI double returned', async () => {
    const ready = await aTravelerWithACostedPlan(COSTS_TOTALLING_5600);

    const response = await readBudget(ready);

    expect(response.statusCode).toBe(200);
    const budget = response.json() as TripBudget;
    expect(budget.estimates.map((estimate) => [estimate.category, estimate.amount])).toEqual([
      ['Accommodation', 1050], ['Food', 1500], ['Transportation', 1000], ['Activities', 1300], ['Shopping', 500], ['Other', 250],
    ]);
    expect(budget).toMatchObject({ currency: 'USD', total: 5600 });
  });

  // @covers REQ-TRV-049@v1
  test('still gives the saved total of 5600 when the AI would now return other estimates, and asks the AI nothing', async () => {
    const ready = await aTravelerWithACostedPlan(COSTS_TOTALLING_5600);
    ready.testApp.ai.replyWith(aPlanReplyCosting({ costs: { Food: 10 } }));
    const asked = ready.testApp.ai.requests.length;

    const reopened = await budgetJson(ready);

    expect(reopened.total).toBe(5600);
    expect(ready.testApp.ai.requests).toHaveLength(asked);
  });

  // @covers REQ-TRV-049@v1
  test('asks the AI for JPY on a JPY Trip and shows every estimate in JPY, with only the AI double called', async () => {
    const ready = await aTravelerWithACostedPlan({ Food: 4000 }, { trip: { currency: 'JPY', budget: 900000 } });

    const budget = await budgetJson(ready);

    const request = requestTextOf(ready.testApp.ai.requests[0] ?? { system: '', user: '' });
    expect(request).toContain('give all costs in JPY');
    expect(budget).toMatchObject({ currency: 'JPY', budgetCurrency: 'JPY' });
    expect(amountOf(budget, 'Food')).toBe(4000);
    expect(ready.testApp.ai.requests).toHaveLength(1);
  });
});

describe('the total against the budget', () => {
  // @covers REQ-TRV-051@v1
  test('gives a total of 5600 and a budget of 5000, so 600 over budget', async () => {
    const ready = await aTravelerWithACostedPlan(COSTS_TOTALLING_5600);

    expect(await budgetJson(ready)).toMatchObject({ total: 5600, budget: 5000, budgetCurrency: 'USD', difference: 600 });
  });

  // @covers REQ-TRV-051@v1
  test('gives 1250 per person for a budget of 5000 and 2 adults and 2 children', async () => {
    const ready = await aTravelerWithACostedPlan(COSTS_TOTALLING_5600);

    expect(await budgetJson(ready)).toMatchObject({ perPerson: 1250, travelers: 4 });
  });
});

describe('the activities estimate after an edit', () => {
  const costs = { Activities: [550, 50] };
  const idOfTheActivityAt50 = (plan: SavedPlan) => activitiesOnDay(plan, 1).find((activity) => activity.estimatedCost === 50)?.id ?? '';

  // @covers REQ-TRV-052@v1
  test('goes from 600 to 550 when the Activity of 50 is removed, and stays there on reopening', async () => {
    const ready = await aTravelerWithACostedPlan(costs);
    expect(amountOf(await budgetJson(ready), 'Activities')).toBe(600);

    const removed = await removeActivityOf(ready, idOfTheActivityAt50(ready.plan));

    expect(removed.statusCode).toBe(200);
    expect(amountOf(await budgetJson(ready), 'Activities')).toBe(550);
  });

  // @covers REQ-TRV-052@v1
  test('goes to 630 when the Activity is replaced by a typed one estimated at 80, and the AI receives no request', async () => {
    const ready = await aTravelerWithACostedPlan(costs);
    const asked = ready.testApp.ai.requests.length;

    const replaced = await replaceActivityOf(ready, idOfTheActivityAt50(ready.plan), { ...A_TYPED_ACTIVITY, estimatedCost: 80 });

    expect(replaced.statusCode).toBe(200);
    expect(amountOf(await budgetJson(ready), 'Activities')).toBe(630);
    expect(ready.testApp.ai.requests).toHaveLength(asked);
  });
});

describe('asking the chat to reduce the cost', () => {
  const cheaper = (plan: SavedPlan) =>
    aChatReplyText(
      'I made Day 1 cheaper.',
      [changeFor(1, activitiesOnDay(plan, 1).map((activity) => (
        activity.category === 'Food' ? { ...activity, estimatedCost: 1000 } : activity.category === 'Shopping' ? { ...activity, estimatedCost: 200 } : activity
      )))],
    );
  const proposalOf = (messages: readonly ChatMessage[]) => messages.find((message) => message.proposal)?.proposal;

  // @covers REQ-TRV-053@v1
  test('presents the changed Plan with an estimated total of 4800 alongside the previous 5600', async () => {
    const ready = await aTravelerWithACostedPlan(COSTS_TOTALLING_5600);
    ready.testApp.ai.replyWith(cheaper(ready.plan));

    const sent = await sendChat(ready, 'Reduce the cost');

    expect(sent.statusCode).toBe(201);
    expect(proposalOf(messagesOf(sent))?.estimatedTotal).toEqual({ before: 5600, after: 4800 });
  });

  // @covers REQ-TRV-053@v1
  test('leaves the saved total at 5600 until the change is accepted, and makes it 4800 once it is', async () => {
    const ready = await aTravelerWithACostedPlan(COSTS_TOTALLING_5600);
    ready.testApp.ai.replyWith(cheaper(ready.plan));
    const sent = await sendChat(ready, 'Reduce the cost');
    const proposed = messagesOf(sent).find((message) => message.proposal);
    expect((await budgetJson(ready)).total).toBe(5600);

    const accepted = await acceptChange(ready, proposed?.id ?? '');

    expect(accepted.statusCode).toBe(200);
    expect((await budgetJson(ready)).total).toBe(4800);
    expect((await planOf(ready)).version).toBe(2);
  });

  // @covers REQ-TRV-053@v1
  test('names the current estimated total to the AI, so it can choose cheaper Activities', async () => {
    const ready = await aTravelerWithACostedPlan(COSTS_TOTALLING_5600);
    ready.testApp.ai.replyWith(aChatReplyText('OK.'));

    await sendChat(ready, 'Reduce the cost');

    const request = requestTextOf(ready.testApp.ai.requests.at(-1) ?? { system: '', user: '' });
    expect(request).toContain('Estimated total of the current plan: 5600 USD');
  });
});

describe('who may read the budget', () => {
  // @covers REQ-TRV-049@v1
  test('answers 404 PLAN_NOT_FOUND for a Trip that has no Plan yet', async () => {
    const ready = await aTravelerWithATrip();

    const response = await readBudget(ready);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'PLAN_NOT_FOUND' });
  });

  // @covers REQ-TRV-049@v1
  test('answers 401 to a caller who is not logged in', async () => {
    const ready = await aTravelerWithACostedPlan(COSTS_TOTALLING_5600);

    expect((await readBudget(ready, {})).statusCode).toBe(401);
  });

  // @covers REQ-TRV-049@v1
  test('answers the same 404 for a Trip that has been deleted', async () => {
    const ready = await aTravelerWithACostedPlan(COSTS_TOTALLING_5600);
    await ready.testApp.app.inject({ method: 'DELETE', url: `/api/trips/${ready.tripId}`, cookies: ready.cookies });

    const response = await readBudget(ready);
    const missing = await ready.testApp.app.inject({ method: 'GET', url: '/api/trips/no-such-trip/budget', cookies: ready.cookies });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual(missing.json());
  });

  // @covers REQ-TRV-049@v1
  test('answers another Traveler the same 404 as for a Trip that does not exist', async () => {
    const ready = await aTravelerWithACostedPlan(COSTS_TOTALLING_5600);
    const other = await aConfirmedTravelerSession(ready.testApp, 'other@example.com');

    const theirs = await readBudget(ready, other);
    const missing = await ready.testApp.app.inject({ method: 'GET', url: '/api/trips/no-such-trip/budget', cookies: other });

    expect(theirs.statusCode).toBe(404);
    expect(theirs.json()).toEqual(missing.json());
  });
});
