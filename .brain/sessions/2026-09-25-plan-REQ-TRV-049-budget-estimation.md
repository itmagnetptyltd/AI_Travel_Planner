# Plan — Slice 10 Budget estimation

Covers REQ-TRV-049@v1, 050@v1, 051@v1, 052@v1 and 053@v1. All `agreed`, priority `should`.
Branch `feat/trv-budget` (from `.brain/slices.yaml`). Gate: slice 9 Done (2/2), so this slice may start.
Dependencies REQ-TRV-026 (the Plan), 046 (remove an Activity), 037 (a chat change) and 051's own chain are verified
or inside this slice.

`.brain/decisions/`, `rejected/` and `constraints/` are still empty, so nothing recorded governs this plan and no
rejected approach is being re-proposed. ANSWERS.md settles the two questions that shape it:
"Where cost estimates come from" — **from the AI alone**, every estimate labelled an estimate, **stored with the
Plan version** so it changes only when the Plan does, and no price tables; and "What the budget covers" — one
total for the whole group, Destination costs only, per-person figures for information only. "Currencies and
conversion" adds: no conversion, everything in the Trip's own currency.

**Status: proposal. Nothing is built. Five items under "Needs your decision" should be answered before
`/tdd`. The slice is smaller than the last three: most of it is one calculation over data the Plan already holds.**

---

## Needs your decision before /tdd

### 1. The estimates are worked out from the Plan, not asked for separately

Every Activity in a Plan already has a category (Food, Transportation, Activities, Shopping, Other) and an
estimated cost, and the stay summary has a nightly cost. I propose the six category estimates are **the sums of
those**, worked out when the budget is viewed, not a second set of numbers the AI writes. That makes REQ-TRV-049's
"the food estimate is 100 from Food Activities of 40 and 60" true by construction, the estimates always add up to
the Plan on show (an edit, a removal or an accepted chat change moves them at once, REQ-TRV-052), and they are
stored with the Plan version for free, because they are the Plan. The AI is still told to give costs in the Trip's
currency, which it already is (REQ-TRV-049 criterion 5). The alternative, asking the AI for six separate totals,
could disagree with the Activities beside them.

### 2. Accommodation is the nightly cost times the nights

A Trip of 8 Days is 7 nights (REQ-TRV-049 says "150 per night for 7 nights" is 1050). So nights are **Days minus
one**, and a 1-Day Trip has no accommodation cost. Say if the client counts a night for the last Day too.

### 3. Rounding

The per-person figure is the budget divided by everyone on the Trip (adults and children, ANSWERS.md), **rounded to
a whole unit**: 5000 for 4 people is 1250, and 5000 for 3 would show 1667. Every other figure is already a whole
number.

### 4. Where the numbers come from

One pure function, `budgetOf`, in `src/shared/`, and one route, `GET /api/trips/:id/budget`, that the page and any
other caller use. The page asks for it again whenever the Plan on show changes version. The alternative is
computing it in the browser as well, which puts the rules in two places.

### 5. What the chat shows for "reduce the cost"

REQ-TRV-053 says the changed Plan is presented "with estimated total 4800 alongside the previous 5600". I propose
each chat proposal carries **the estimated total before and after**, worked out when the proposal is made, and the
preview says "Estimated total 4800 (was 5600)". The chat is also told the current estimated total and the Trip's
budget, and told to choose cheaper Activities when asked to cut the cost. A proposal that changes no cost says
nothing about cost.

---

## What must be true

### REQ-TRV-049 — a cost estimate for each of six categories (A B C)
1. A Trip with a Plan shows an estimate, in the Trip's currency, for accommodation, food, transportation, activities, shopping and other.
2. With an AI double returning category estimates, the amounts shown are those, each labelled an estimate and not a guaranteed price.
3. A saved Plan with an estimated total of 3200 still shows 3200 when the Trip is reopened, whatever the AI would now return.
4. Food Activities of 40 and 60, and a stay of 150 a night for 7 nights, show food 100 and accommodation 1050.
5. A JPY Trip: the request asks for JPY, every estimate is in JPY, and no exchange-rate service is called.

### REQ-TRV-050 — the total is the sum of the six (A)
1. Estimates of 1000, 800, 400, 600, 300 and 100 give a total of 3200.

### REQ-TRV-051 — the total against the budget (A B C)
1. Budget 5000 USD and a total of 5600 shows 5600, 5000, and 600 over budget.
2. It states the budget is one total for the whole group, covering costs at the Destination only, excluding travel to and from it.
3. Budget 5000 USD, 2 adults and 2 children shows a per-person budget of 1250 USD, labelled for information only.

### REQ-TRV-052 — the activities estimate follows edits (A C)
1. An activities estimate of 600 with one Activity at 50: removing it shows 550.
2. The same, replacing it by typing one at 80: shows 630, and the AI double receives no request.

### REQ-TRV-053 — ask the chat to reduce the cost (A B C)
1. A total of 5600 and an AI reply that would make it 4800: the changed Plan is presented with 4800 alongside 5600.
2. Until it is accepted, the saved Trip's budget still shows 5600.
3. Once Accept is clicked, the saved Trip's total is 4800.

---

## Approach

**Shared — `src/shared/trip-budget.ts` (new).** `budgetOf(plan, trip)` returns the six category estimates in a fixed
order (Accommodation, Food, Transportation, Activities, Shopping, Other), the total (their sum), the Trip's budget, the
difference (total minus budget; positive is over budget), and the per-person budget (budget over adults plus children,
rounded). If the Plan's currency is not the Trip's now, there is no difference to state, because the two are not
comparable (nothing converts them). It also holds the fixed wording: what the budget covers, and that every figure is
an estimate.

**Server.**
- `GET /api/trips/:id/budget` (in `plan-routes.ts`): the owner's Trip and its current Plan, or 404 `PLAN_NOT_FOUND` for a
  Trip with no Plan, and the usual 404 for a Trip that is absent, deleted or someone else's.
- Chat: `chat-proposal.ts` gains the estimated total before and after a proposal; it is stored in the proposal and
  returned with it. `chat-prompt.ts` names the current estimated total and the budget, and the instructions say to
  choose cheaper Activities when asked to cut the cost.
- Nothing is stored and there is no migration: the estimates are the Plan's own numbers.

**Web.** A **Budget** section under the Plan, shown when there is a Plan: the six estimates, each labelled "estimate";
the total; the budget; the difference in words ("600 USD over budget", "450 USD under budget", "exactly on budget");
the per-person figure labelled "for information only"; and the coverage note. A chat preview that changes the cost adds
"Estimated total 4800 (was 5600)". A pure `budget-view-state.ts` turns the numbers into the words, so the wording is
tested without a browser.

**Files (new):** `src/shared/trip-budget.ts`, `src/web/components/BudgetPanel.tsx`,
`src/web/components/{budget-view-state.ts,use-budget.ts}`, and the tests below.
**Files (changed):** `src/server/plans/plan-routes.ts`, `src/server/chat/{chat-proposal,chat-prompt,chat-service}.ts`,
`src/shared/chat-schemas.ts`, `src/server/chat/chat-store.ts` (the stored proposal), `src/web/components/{PlanGenerator,ChatProposal}.tsx`.

---

## Test skeleton

Belts: A = `tests/unit`, C = `tests/api/*.http.spec.ts`, B = `e2e/`.

### `tests/unit/trip-budget.test.ts` (A)
- `@covers REQ-TRV-049@v1` — a Plan gives an estimate for each of six categories, in a fixed order, in the Trip's currency
- `@covers REQ-TRV-049@v1` — Food Activities at 40 and 60 give a food estimate of 100
- `@covers REQ-TRV-049@v1` — a stay of 150 a night for an 8-Day Trip gives accommodation of 1050
- `@covers REQ-TRV-049@v1` — a 1-Day Trip has no accommodation cost, and a category with no Activity is 0
- `@covers REQ-TRV-049@v1` — Activities are counted in the category they carry, and never in another
- `@covers REQ-TRV-049@v1` — the same saved Plan gives the same estimates every time, whatever else changes
- `@covers REQ-TRV-050@v1` — estimates of 1000, 800, 400, 600, 300 and 100 give a total of 3200
- `@covers REQ-TRV-050@v1` — the total is always the sum of the six shown
- `@covers REQ-TRV-051@v1` — a budget of 5000 and a total of 5600 give a difference of 600 over
- `@covers REQ-TRV-051@v1` — a total under the budget, and exactly on it, are told apart from over
- `@covers REQ-TRV-051@v1` — a budget of 5000 with 2 adults and 2 children gives 1250 per person, and it rounds to a whole unit
- `@covers REQ-TRV-051@v1` — when the Plan is in another currency than the Trip, no difference is given
- `@covers REQ-TRV-052@v1` — removing an Activity at 50 from an activities estimate of 600 gives 550
- `@covers REQ-TRV-052@v1` — replacing it with a typed Activity at 80 gives 630
- `@covers REQ-TRV-052@v1` — moving an Activity to another Day changes no estimate

### `tests/unit/budget-view-state.test.ts` (A)
- `@covers REQ-TRV-051@v1` — "600 USD over budget", "450 USD under budget" and "exactly on budget" are worded from the difference
- `@covers REQ-TRV-051@v1` — the per-person figure is labelled for information only
- `@covers REQ-TRV-051@v1` — the note says one total for the whole group, Destination only, excluding travel to and from it
- `@covers REQ-TRV-049@v1` — every estimate is labelled an estimate, not a price

### `tests/unit/chat-service.test.ts` and `chat-proposal.test.ts` additions (A)
- `@covers REQ-TRV-053@v1` — a proposal that lowers the total from 5600 to 4800 carries both figures
- `@covers REQ-TRV-053@v1` — the saved Plan's total is still 5600 until the proposal is accepted, and 4800 after
- `@covers REQ-TRV-053@v1` — a proposal that changes no cost carries the same figure twice
- `@covers REQ-TRV-053@v1` — the chat request names the current estimated total and the budget, and says to choose cheaper Activities when asked to cut the cost

### `tests/api/trip-budget.http.spec.ts` (C)
- `@covers REQ-TRV-049@v1` — GET budget gives six estimates, in the Trip's currency, that are the amounts the AI double returned
- `@covers REQ-TRV-049@v1` — after the AI double is changed to answer differently, reopening the Trip still gives the saved total
- `@covers REQ-TRV-049@v1` — a JPY Trip: the AI request asks for JPY, every estimate is JPY, and nothing but the AI double is called
- `@covers REQ-TRV-051@v1` — a budget of 5000 USD and a total of 5600 gives the difference of 600 over budget
- `@covers REQ-TRV-051@v1` — the response says the budget covers the whole group at the Destination only, and gives 1250 per person for 2 adults and 2 children
- `@covers REQ-TRV-052@v1` — removing an Activity at 50 takes the activities estimate from 600 to 550
- `@covers REQ-TRV-052@v1` — replacing it by typing one at 80 gives 630, and the AI double receives no request
- `@covers REQ-TRV-053@v1` — asking the chat to cut the cost gives a proposal with 5600 and 4800; the budget still says 5600 until Accept, then 4800
- 404 `PLAN_NOT_FOUND` for a Trip with no Plan, the same 404 as any Trip route for another Traveler's Trip, 401 when not logged in (supplementary)

### `e2e/trip-budget.spec.ts` (B)
- `@covers REQ-TRV-049@v1` — a Trip with a Plan shows a Budget section with six labelled estimates in the Trip's currency, and they are still there after reloading
- `@covers REQ-TRV-051@v1` — the total, the budget and the difference are shown, in words, for a Trip under budget and for one over it
- `@covers REQ-TRV-051@v1` — the section says the budget is one total for the whole group covering the Destination only, and shows the per-person figure as for information only
- `@covers REQ-TRV-053@v1` — asking the chat to reduce the cost shows "Estimated total N (was M)" in the preview, the Budget section still says M until Accept, and N after

### Existing tests that must stay green
Everything in slices 1 to 9. The chat proposal and its stored form change, so the chat and proposal tests are the ones to watch.

---

## Decisions this forces

Each becomes an ADR once chosen. I recommend all three.

1. **The estimates are the sums of the Plan's own numbers,** so they cannot disagree with it and are stored with each version.
2. **One shared calculation behind one route.** The page and any later use (an emailed Plan) say the same thing.
3. **Nights are Days minus one.**

## What I am unsure about

- **A Plan whose currency is not the Trip's.** Changing a Trip's currency after a Plan exists has no rule yet (raised in slice 7). I show the Plan's estimates in the Plan's currency with no comparison, and say so. A rule for it is a new requirement.
- **An empty Day.** A Trip made longer has empty Days (slice 7); they cost nothing, but the nights still count, so the accommodation estimate grows with the Trip. That seems right and no criterion says.
- **The "budget" travel style.** A travel style is literally called "Budget". Nothing links it to this slice, and the label "Budget" in the Trip's details is already the money. I would not change either.
- **Hand-typed costs.** The Traveler can type any whole-number cost, and it counts. Nothing checks it against a category norm.
- **"Should", not "must".** All five are "should". The slice is small enough that I would build all five.
- **The AI's own total.** REQ-TRV-053 speaks of the AI "returning a Plan with estimated total 4800". Under decision 5 the AI returns Activities and the server works the total out, so a reply that says one total in words and lists Activities that add to another is judged by the Activities.
- **Rounding of a large group.** Per-person rounds half up to a whole unit; a budget of 0 gives 0.

## Review triggers

No new stored data, one new owner-only route, and one addition to what the AI is told (numbers only). A short
**security-reviewer** pass (ownership of the new route), then **typescript-reviewer** and **react-reviewer** after `/tdd`.

## Then

Waiting for you. Answer the five items at the top, or say "I approve" to take my recommendations, then run
`/tdd REQ-TRV-049 REQ-TRV-050 REQ-TRV-051 REQ-TRV-052 REQ-TRV-053`. You are already on `feat/trv-budget`.
