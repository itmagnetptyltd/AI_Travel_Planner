# Plan — Slice 9 Search and filter Trips

Covers REQ-TRV-076@v1 and REQ-TRV-077@v1. Both `agreed`, priority `should`.
Branch `feat/trv-search` (from `.brain/slices.yaml`). Gate: slice 8 Done (9/9), so this slice may start.
Dependencies REQ-TRV-016 (the list of Trips) and REQ-TRV-020 (travel style) are verified.

`.brain/decisions/`, `rejected/` and `constraints/` are still empty, so nothing recorded governs this plan
and no rejected approach is being re-proposed. ANSWERS.md has nothing that names search or filtering, but
two of its answers bear on it: "Currencies and conversion" (a fixed list of eight currencies, **no
conversion**) decides how a budget filter can work, and "One travel style ... per Trip, or several?" (a
Trip holds up to three styles) decides what "filter by travel style" means.

**Status: proposal. Nothing is built. Four items under "Needs your decision" should be answered before
`/tdd`. This is a small slice: one query on the Trips list, and the controls to drive it.**

---

## Needs your decision before /tdd

### 1. What a search looks at

The criterion searches for "Tokyo" and expects "Tokyo Family Holiday", found by its name. I propose search
matches the **Trip name or its Destination's name or country**, ignoring capitals, anywhere in the text. A
Trip named "Family Holiday" to Tokyo is then found by "Tokyo", which is what a Traveler expects. The
criterion still holds, because "Paris Weekend" goes to Paris. The narrower reading, name only, is safer
against surprises but misses that Trip. Your call.

### 2. What a budget filter means when currencies are not converted

There is no conversion (ANSWERS.md), so "budget under 3000" is meaningless across a Trip in USD and one in
JPY. I propose the budget filter is a **minimum and a maximum in one chosen currency**, and it returns only
Trips in that currency. Asking for a range without a currency is refused, naming the currency, rather than
comparing numbers in different currencies. The alternative, comparing the bare numbers, is simpler and wrong.

### 3. What "duration" and "travel style" mean at the edges

- **Duration** is a minimum and a maximum number of Days, both **inclusive**. "More than 5 Days" is entered as
  a minimum of 6. Both criteria and the boundary read cleanly with the 3-Day and 8-Day Trips. A 5-Day Trip is
  not "more than 5", so it would need the minimum set to 6, and the label says "At least".
- **Travel style** is one choice. A Trip matches if that style is **among** its (up to three) styles, so a
  Family and Cultural Trip matches a filter of Family.

### 4. Where the filters live

I propose they are in the **address of the page** (`/trips?search=Tokyo&style=Family`), so the Back button and a
reload keep them, and a filtered list can be bookmarked. The alternative is state that is lost on reload.

---

## What must be true

### REQ-TRV-076 — search their own Trips (A B C)
1. A Traveler with Trips "Tokyo Family Holiday" and "Paris Weekend" who searches "Tokyo" gets only "Tokyo Family Holiday".

### REQ-TRV-077 — filter by Destination, budget, travel style and duration (A B C)
1. A Family Trip and a Business Trip, filtered by travel style Family, gives only the Family Trip.
2. A 3-Day Trip and an 8-Day Trip, filtered by duration of more than 5 Days, gives only the 8-Day Trip.
3. A Trip to Kyoto (Japan) and a Trip to Paris (France), filtered by country Japan, gives only the Kyoto Trip.

Under the title but with no example in the criteria: filtering by a Destination and by a budget range. The
plan builds and tests them, because the title asks for them.

---

## Approach

Filtering is one pure function over the Traveler's own Trips, so it is tested without a database or a browser,
and the server and the page describe the filters with the same words.

**Shared** — `src/shared/trip-filter.ts` (new): `tripFilterSchema` (zod, strict), the query string as a Traveler
sends it: `search`, `destination` (a Destination id), `country`, `style`, `currency` with `minBudget` and
`maxBudget`, and `minDays` and `maxDays`. Numbers arrive as text and are read as whole numbers; anything else
is refused naming the field (`parseQuery` already does that). And `matchesTripFilter(trip, filter)` and
`filterTrips(trips, filter)`: every filter that is given must match (AND), a filter left out matches
everything.

**Server** — `TripService.listForOwner(ownerId, filter?)` filters the owner's own Trips and no one else's, then
sorts by name as before. `GET /api/trips` takes the filters as its query string. With none, it answers exactly
as today, so nothing that works now changes. The filter runs on the owner's Trips in memory: a Traveler's
list is small, and the duration is worked out from the dates, which SQL cannot do here.

**Web** — the Trips page gains a search box and a filter group: Country and Destination (choices drawn from
the Traveler's own Trips), Travel style (the eight styles), Budget (currency, minimum, maximum), and Days
(minimum, maximum), with **Clear filters**. The values live in the page address (`useSearchParams`). A pure
`trip-list-state.ts` turns the address into the request and back, and works out the choices. When nothing
matches, the page says **No Trips match your search** and offers to clear it, distinct from "You have no
Trips yet". The search box asks the server after the Traveler stops typing for a moment, not on every key.

**Files (new):** `src/shared/trip-filter.ts`, `src/web/components/{TripFilters,TripTable}.tsx`,
`src/web/pages/trip-list-state.ts`, and the tests below.
**Files (changed):** `src/server/trips/{trip-service,trip-routes}.ts`, `src/web/pages/TripsPage.tsx`
(the table moves to its own component to keep the page short).

No migration: nothing new is stored.

---

## Test skeleton

Belts: A = `tests/unit`, C = `tests/api/*.http.spec.ts`, B = `e2e/`.

### `tests/unit/trip-filter.test.ts` (A)
- `@covers REQ-TRV-076@v1` — searching "Tokyo" keeps "Tokyo Family Holiday" and drops "Paris Weekend"
- `@covers REQ-TRV-076@v1` — a search ignores capitals, matches anywhere in the name, and ignores spaces at its ends
- `@covers REQ-TRV-076@v1` — a search also finds a Trip by its Destination name and country (decision 1)
- `@covers REQ-TRV-076@v1` — an empty or blank search keeps every Trip
- `@covers REQ-TRV-077@v1` — travel style Family keeps the Family Trip and drops the Business Trip
- `@covers REQ-TRV-077@v1` — a Trip with Family and Cultural styles matches a filter of Cultural
- `@covers REQ-TRV-077@v1` — a Trip with no travel style matches no style filter
- `@covers REQ-TRV-077@v1` — a minimum of 6 Days keeps the 8-Day Trip and drops the 3-Day Trip
- `@covers REQ-TRV-077@v1` — a minimum and a maximum of Days are inclusive at both ends
- `@covers REQ-TRV-077@v1` — country Japan keeps the Kyoto Trip and drops the Paris Trip
- `@covers REQ-TRV-077@v1` — a Destination filter keeps only Trips to that Destination
- `@covers REQ-TRV-077@v1` — a budget range in USD keeps USD Trips inside it and drops other currencies (decision 2)
- `@covers REQ-TRV-077@v1` — several filters together keep only a Trip that meets all of them
- `@covers REQ-TRV-077@v1` — no filter at all keeps every Trip, in the order given
- reading the query: numbers as text are read, a fraction, a negative, text, a minimum above the maximum, and a budget with no currency are each refused naming the field (supplementary)

### `tests/unit/trip-service.test.ts` additions (A)
- `@covers REQ-TRV-076@v1` — listing with a search returns only the owner's matching Trips, sorted by name
- `@covers REQ-TRV-077@v1` — listing with filters never returns another Traveler's Trip, or a deleted one

### `tests/unit/trip-list-state.test.ts` (A)
- `@covers REQ-TRV-076@v1` — the page address `?search=Tokyo` becomes the search, and back again
- `@covers REQ-TRV-077@v1` — every filter is read from the address and written back to it, and blank ones are left out
- `@covers REQ-TRV-077@v1` — the country and Destination choices are drawn from the Traveler's own Trips, each once, in order
- `@covers REQ-TRV-077@v1` — clearing the filters gives an empty address
- `@covers REQ-TRV-076@v1` — "no Trips yet" and "no Trips match" are told apart

### `tests/api/trip-search.http.spec.ts` (C)
- `@covers REQ-TRV-076@v1` — GET `/api/trips?search=Tokyo` returns only "Tokyo Family Holiday"
- `@covers REQ-TRV-077@v1` — `?style=Family` returns only the Family Trip
- `@covers REQ-TRV-077@v1` — `?minDays=6` returns only the 8-Day Trip
- `@covers REQ-TRV-077@v1` — `?country=Japan` returns only the Kyoto Trip
- `@covers REQ-TRV-077@v1` — a Destination, a budget range with its currency, and a combination of filters
- `@covers REQ-TRV-076@v1` — no query returns every Trip exactly as before
- `@covers REQ-TRV-007@v2` — another Traveler's Trips and a deleted Trip are never returned, whatever the filter
- 400 naming the field for a bad number, a minimum above the maximum, a budget with no currency, an unknown travel style, an unknown parameter; 401 when not logged in (supplementary)

### `e2e/trip-search.spec.ts` (B)
- `@covers REQ-TRV-076@v1` — typing "Tokyo" in Search leaves only "Tokyo Family Holiday" in the list
- `@covers REQ-TRV-077@v1` — choosing travel style Family leaves only the Family Trip
- `@covers REQ-TRV-077@v1` — a minimum of 6 Days leaves only the 8-Day Trip
- `@covers REQ-TRV-077@v1` — choosing country Japan leaves only the Kyoto Trip
- `@covers REQ-TRV-077@v1` — a budget range and a Destination narrow the list, and Clear filters brings every Trip back
- `@covers REQ-TRV-076@v1` — a search with no match says "No Trips match your search", and a Traveler with no Trips still says "You have no Trips yet"
- `@covers REQ-TRV-076@v1` — the search and filters are in the address, so a reload keeps them and Back returns to the list as it was

### Existing tests that must stay green
Everything in slices 1 to 8; the Trips list is the one place `GET /api/trips` changes, and with no query it must
answer exactly as it does now.

---

## Decisions this forces

Each becomes an ADR once chosen. I recommend both.

1. **One shared filter, used by the server and described the same way on the page.** The two cannot disagree about what "more than 5 Days" means.
2. **Filters are in the address of the page.** They survive a reload, and Back works.

## What I am unsure about

- **"City".** The BRD's list says destination, country, **city**, budget, style, duration. A Destination here has a name and a country and no separate city, so a filter by Destination covers the city. I would not add a field for it.
- **"Priority: should".** Both requirements are "should", not "must". The slice is small, so I would build both; if time is short, 077's budget and Destination filters are the part with no acceptance example and could wait.
- **A long list.** There is no paging on the Trips list, and filtering happens in memory. That is fine for a Traveler's own Trips and would not be for thousands. Nothing asks for paging.
- **Sorting.** The list stays sorted by name. No requirement asks to sort by date or budget.
- **Search of the plan itself.** The BRD says users search "saved trips", and this plan searches the Trip's name and Destination, not the Activities inside its Plan. That would need the Plan's text searched; nothing in the criteria asks for it.
- **Typed search and a slow server.** The search waits a moment after the Traveler stops typing. The browser test has to wait for the result rather than a fixed time.

## Review triggers

A new query string on an owner-scoped route, read as user input, qualifies for **security-reviewer**
(the filters must never reach another Traveler's Trips, and a query must not be able to reach SQL: it does not,
because filtering is in code). **typescript-reviewer** and **react-reviewer** after `/tdd`.

## Then

Waiting for you. Answer the four items at the top, or say "I approve" to take my recommendations, then run
`/tdd REQ-TRV-076 REQ-TRV-077`. This work belongs on `feat/trv-search`, which you have already created and are on.
