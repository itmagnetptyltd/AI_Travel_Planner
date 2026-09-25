# Plan — Slice 3 Trips

Covers REQ-TRV-011@v2, REQ-TRV-012@v2, REQ-TRV-013@v1, REQ-TRV-014@v2,
REQ-TRV-015@v2, REQ-TRV-016@v1, REQ-TRV-007@v2, REQ-TRV-061@v1,
REQ-TRV-093@v1, REQ-TRV-095@v1. All ten are `agreed`.
Branch `feat/trv-trips`. Gate: slices 1 and 2 are Done.

Dependencies are either `verified` (REQ-TRV-002, 072, 074, 075, 078) or
REQ-TRV-011, 014 and 015, which are in this plan. `.brain/decisions/`,
`rejected/` and `constraints/` hold only their READMEs, so nothing recorded
governs this plan, and no rejected approach is being proposed again.

**Revised 2026-09-25 after CHG-0002.** The first draft pinned v1 and asked
whether to split the 13 criteria that need later slices. CHG-0002 did that
(option b, absorbed): those criteria now sit in REQ-TRV-096 to 101, in slices
5, 6, 7, 8 and 12. Nothing in this plan tests them. Soft delete is still built
here, because 095 c2 needs a deleted Trip to keep holding its Destination.
Restore and the 30-day purge are built in slice 8 with REQ-TRV-099.

---

## What must be true

### REQ-TRV-011@v2: create a Trip (A B C)
1. A confirmed Traveler creates "Tokyo Family Holiday": Tokyo, 2026-10-10 to 2026-10-17, 2 adults, 2 children, 5000 USD. It is listed with exactly those values and with 4 travelers.
2. Destination "Atlantis", which doesn't exist, is refused, and `destinationId` is named as the invalid field.
3. Typing "Tok" into the Destination field offers Tokyo and not Kyoto. The existing prefix search already does this.
4. A new Trip is listed with status "Draft".
5. Leaving any one of these blank is refused, naming that field: name, Destination, start date, end date, adults, budget, currency.
6. 0 adults is refused, naming `adults`.
7. Leaving children and every preference blank creates the Trip with 0 children and no preferences.
8. If the API receives 2 adults, 1 child and `numberOfTravelers: 5`, the Trip reads back with 3 travelers.
9. The budget field has text beside it: one total for the whole group, covering costs at the Destination only, excluding flights or other travel to and from it.
10. The currency choice offers exactly AUD, USD, EUR, GBP, JPY, SGD, NZD and BDT.
11. Currency "CAD" is refused through the API, naming `currency`.
12. The profile default is Family. The Traveler changes this Trip to Adventure. The Trip saves Adventure, and the profile still shows Family.

### REQ-TRV-012@v2: date rules (A B C)
1. An end date before the start date is refused, naming `endDate`.
2. With today 2026-09-23, 2026-10-01 to 2026-10-14 (14 Days) is created.
3. 2026-10-01 to 2026-10-15 (15 Days) is refused, naming `endDate`.
4. A start of 2026-09-22 is refused, naming `startDate`.
5. A start and end of 2026-09-23 creates a 1-Day Trip.
6. Editing a saved Trip's start date to 2026-09-20 is refused, naming `startDate`. The Trip still starts on 2026-10-10.

### REQ-TRV-013@v1: negative budget (A C)
1. A budget of -100 is refused, naming `budget`.

### REQ-TRV-014@v2: edit a Trip (A B C)
1. Renaming "Tokyo Family Holiday" to "Tokyo Autumn" lists it as "Tokyo Autumn".

### REQ-TRV-015@v2: delete a Trip (A B C)
1. A deleted Trip no longer appears in the owner's list. This is a soft delete.

### REQ-TRV-016@v1: list saved Trips (A B C)
1. A Traveler with two saved Trips sees both, listed by name.

### REQ-TRV-007@v2: only your own Trips (A B C)
1. Y requesting X's Trip gets **404**, with no Trip fields.
2. Y submitting a change to X's Trip is refused (**404**), and X's Trip is unchanged.
3. Y's list contains none of X's Trips.
4. Any account that is neither X nor an Administrator gets **404**. With only two roles, that means another Traveler.

### REQ-TRV-061@v1: in-app success and failure messages (A B)
1. When a Trip edit saves, a success message is shown.
2. When the save fails in storage, a failure message is shown and the form keeps what the Traveler typed.

### REQ-TRV-093@v1: Destination chosen from enabled records (A B C)
1. After an Administrator adds enabled Kyoto, the Trip form's Destination choice offers Kyoto.
2. Selecting Kyoto makes the Trip's Destination the Kyoto record, shown with country Japan.
3. A new Trip for a disabled Kyoto is refused through the API, naming `destinationId`.

### REQ-TRV-095@v1: Destination in use cannot be removed (A B C)
1. If one saved Trip uses Kyoto, removing Kyoto is refused. Kyoto is still listed, and the Trip is unchanged.
2. If the only Trip using Kyoto was deleted 5 days ago, removing Kyoto is still refused.

---

## Approach

**Data (migration `0002_trips.sql`)**

New `trips` table:
- `id`
- `owner_account_id`, a foreign key to accounts with cascade (account deletion doesn't exist yet)
- `name`
- `destination_id`, a foreign key to destinations with **restrict**
- `start_date` and `end_date`, stored as `YYYY-MM-DD` text: calendar dates, not instants
- `adults`, `children`, `budget` (integers) and `currency`
- `travel_styles`, a JSON array, empty when blank
- `status`: `draft` or `planned`. Only `draft` is written in this slice.
- `deleted_at` (nullable), `created_at`, `updated_at`
- Index on `(owner_account_id, deleted_at)`

The number of travelers is **never stored**. It is always adults plus children.

**Shared schema: `src/shared/trip-schemas.ts`**
- `tripInputSchema` is zod `.strict()`, like the other schemas. `tripUpdateSchema` is `.partial().strict()`.
- Limits:
  - name: 1 to 100 characters, trimmed
  - adults: 1 to 20
  - children: 0 to 20
  - budget: whole number, 0 to 10,000,000
  - currency: from `CURRENCIES`
  - travelStyles: from `TRAVEL_STYLES`, at most 3
  - dates: ISO calendar dates
- `endDate` must be on or after `startDate`, and the Trip must be at most 14 Days. Both checks sit in `superRefine` with path `endDate`.
- `numberOfTravelers` is the only extra key accepted. It is removed on parse and never read (011 c8; see Decisions).
- `TRIP_MAX_DAYS = 14` is a named constant.

**Service: `src/server/trips/trip-service.ts`**
- `create(ownerId, input)`, `listForOwner(ownerId)`, `getForOwner(ownerId, id)`, `update(ownerId, id, change)`, `softDelete(ownerId, id)` and `countUsingDestination(destinationId)`.
- `countUsingDestination` **includes soft-deleted Trips**.
- Rules that need the clock are checked here, through the injected `Clock`:
  - A **new** start date before today is refused.
  - On edit, a start or end date that **changes** to before today is refused (012 c6). Dates left unchanged may already be past, so a Trip that has ended can still be renamed. REQ-TRV-097 relies on past Trips staying readable.
- The Destination must exist and be enabled when it is **set or changed**. A saved Trip whose Destination was later disabled can still be edited in other fields, as REQ-TRV-094 anticipates.
- Every read and write is scoped with `owner_account_id = caller AND deleted_at IS NULL`. Not found, not owned and deleted all return the same `not-found` result (007).
- Expected failures come back as results, not exceptions, for example `{ ok: false, field }`.

**Routes: `src/server/trips/trip-routes.ts`** (replaces the slice 1 stub)

| Route | Result |
|---|---|
| `GET /api/trips` | 200 |
| `POST /api/trips` | 201 |
| `GET /api/trips/:id` | 200, or 404 `TRIP_NOT_FOUND` |
| `PATCH /api/trips/:id` | 200, 400 or 404 |
| `DELETE /api/trips/:id` | 204, or 404 |

- Every route requires a logged-in, confirmed Traveler.
- The owner always comes from the session and never from the body.
- The response DTO adds `numberOfTravelers` and `destination { id, name, country }`.
- Clock failures return `400 VALIDATION_FAILED` with the field named, the same shape as `parseBody`.

**Destinations**
- `destination-service.remove(id)` currently deletes without checking. It gains a check: if `countUsingDestination(id) > 0`, it returns `in-use`, and the route replies **409 `DESTINATION_IN_USE`**.
- The foreign-key restrict is a backstop. Without the check, the route would return a 500.
- The admin page shows the 409 as "Kyoto is used by a Trip and cannot be removed."

**Web (`src/web/`)**
- `components/DestinationSearch.tsx`: pulled out of `DestinationsPage.tsx` as a type-ahead over `GET /api/destinations?q=`. Results show name and country. `DestinationsPage` reuses it.
- `pages/TripsPage.tsx`: the real list, showing name, Destination, dates, travelers, budget and currency, and status. It links to create and to each Trip.
- `pages/TripFormPage.tsx` (`/trips/new` and `/trips/:id/edit`) and `components/TripForm.tsx`:
  - Pre-fills currency and travel style from the profile.
  - The budget note from 011 c9 sits beside the budget field.
  - A currency select built from `CURRENCIES`.
- `pages/TripPage.tsx` (`/trips/:id`) shows the Trip, with Edit and Delete. Delete asks for confirmation on the page, not with `window.confirm`.
- `pages/trip-form-state.ts` is a pure reducer holding the form values plus a `saved` or `failed` outcome. Failure keeps the values. It is the belt A target for 061.
- Messages use `role="status"` for success and `role="alert"` for failure. Every value is rendered as React text.

**Files changed:**
- `src/server/db/schema.ts`
- `src/server/db/migrations/*`
- `src/server/app.ts` (wire the trip service; pass it to the Destination routes)
- `src/server/destinations/destination-service.ts` and `destination-routes.ts`
- `src/web/App.tsx`
- `src/web/pages/DestinationsPage.tsx`
- `src/web/pages/admin/AdminDestinationsPage.tsx`
- `tests/support/`: add `a-trip.ts`, a builder

**New dependencies:** none.

---

## Test skeleton

In belts A and C, dates come from `aFixedClock` set to 2026-09-23, so the literal
dates in each criterion are used as written. Belt B runs against the real
clock, so its dates are relative to today (see uncertainty 2).

### Belt A (unit): `tests/unit/trip-service.test.ts`, `trip-schemas.test.ts`, `trip-form-state.test.ts`
```ts
// @covers REQ-TRV-011@v2
test('a created Trip is listed with its name, Destination, dates, adults, children, budget and currency')
test('a Trip with 2 adults and 2 children has 4 travelers')
test('a Trip to a Destination that does not exist is refused, naming destinationId')
test('a new Trip has status Draft')
test.each(['name','destinationId','startDate','endDate','adults','budget','currency'])('a Trip with %s blank is refused, naming it')
test('a Trip with 0 adults is refused, naming adults')
test('a Trip with children and preferences left blank has 0 children and no travel styles')
test('a supplied numberOfTravelers is ignored; 2 adults and 1 child read back as 3')
test('the currencies offered are exactly AUD, USD, EUR, GBP, JPY, SGD, NZD and BDT')
test('a Trip with currency CAD is refused, naming currency')
test('a Trip saved with travel style Adventure leaves the profile default Family unchanged')
// @covers REQ-TRV-012@v2
test('an end date before the start date is refused, naming endDate')
test('a 14-Day Trip is created')
test('a 15-Day Trip is refused, naming endDate')
test('a new Trip starting yesterday is refused, naming startDate')
test('a Trip starting and ending today is a 1-Day Trip')
test('editing a start date into the past is refused, naming startDate, and the Trip keeps its start date')
// @covers REQ-TRV-013@v1
test('a budget of -100 is refused, naming budget')
// @covers REQ-TRV-014@v2
test('renaming a Trip lists it under the new name')
// @covers REQ-TRV-015@v2
test('a deleted Trip is no longer in its owner list')
// @covers REQ-TRV-016@v1
test('a Traveler with two Trips has both listed by name')
// @covers REQ-TRV-007@v2
test('reading another Traveler Trip returns not-found')
test('updating another Traveler Trip returns not-found and changes nothing')
test('a Traveler list holds none of another Traveler Trips')
// @covers REQ-TRV-061@v1
test('a saved outcome carries a success message')
test('a failed outcome carries a failure message and keeps the entered values')
// @covers REQ-TRV-093@v1
test('a Trip for an enabled Destination takes that Destination record, with its country')
test('a new Trip for a disabled Destination is refused, naming destinationId')
// @covers REQ-TRV-095@v1
test('removing a Destination used by a saved Trip is refused and leaves the Trip unchanged')
test('removing a Destination used only by a deleted Trip is refused')
```

### Belt C (API): `tests/api/trips.http.spec.ts`, `tests/api/trip-access.http.spec.ts`
```ts
// @covers REQ-TRV-011@v2
test('POST /api/trips returns 201, and GET /api/trips lists it with 4 travelers and status Draft')
test('POST /api/trips with an unknown destinationId returns 400 naming destinationId')
test('GET /api/destinations?q=Tok returns Tokyo and not Kyoto')
test.each(REQUIRED_FIELDS)('POST /api/trips without %s returns 400 naming it')
test('POST /api/trips with adults 0 returns 400 naming adults')
test('POST /api/trips without children returns 201 with children 0 and travelStyles []')
test('POST /api/trips with numberOfTravelers 5, 2 adults and 1 child reads back numberOfTravelers 3')
test('POST /api/trips with currency CAD returns 400 naming currency')
test('POST /api/trips with travelStyles [Adventure] leaves GET /api/profile at Family')
test('POST /api/trips with an unknown extra field returns 400')
// @covers REQ-TRV-012@v2
test('POST /api/trips ending before it starts returns 400 naming endDate')
test('POST /api/trips for 2026-10-01 to 2026-10-14 returns 201')
test('POST /api/trips for 2026-10-01 to 2026-10-15 returns 400 naming endDate')
test('POST /api/trips starting 2026-09-22 returns 400 naming startDate')
test('POST /api/trips for 2026-09-23 to 2026-09-23 returns 201')
test('PATCH startDate 2026-09-20 returns 400 naming startDate, and GET still shows 2026-10-10')
// @covers REQ-TRV-013@v1
test('POST /api/trips with budget -100 returns 400 naming budget')
// @covers REQ-TRV-014@v2
test('PATCH name Tokyo Autumn, then GET /api/trips lists Tokyo Autumn')
// @covers REQ-TRV-015@v2
test('DELETE /api/trips/:id returns 204 and GET /api/trips no longer lists it')
// @covers REQ-TRV-016@v1
test('GET /api/trips lists both of the Traveler Trips by name')
// @covers REQ-TRV-007@v2
test('GET another Traveler Trip returns 404 with no Trip fields in the body')
test('PATCH another Traveler Trip returns 404 and the owner still sees it unchanged')
test('DELETE another Traveler Trip returns 404 and the owner still has it')
test('GET /api/trips as Y lists none of X Trips')
test('GET /api/trips/:id without a session returns 401')
// @covers REQ-TRV-093@v1
test('POST /api/trips for a disabled Destination returns 400 naming destinationId')
test('GET /api/trips/:id carries destination Kyoto with country Japan')
// @covers REQ-TRV-095@v1
test('DELETE /api/admin/destinations/:id for a Destination used by a Trip returns 409, and it is still listed')
test('DELETE /api/admin/destinations/:id for a Destination used only by a deleted Trip returns 409')
```

### Belt B (browser): `e2e/trips.spec.ts`
```ts
// @covers REQ-TRV-011@v2
test('a Traveler creates a Trip to Tokyo, typing "Tok" to pick it, and sees it listed as Draft with 4 travelers')
test('the Trip form shows the budget note beside the budget field')
test('the currency choice offers exactly the eight currencies')
test('the Trip form is pre-filled with travel style Family; changing it to Adventure leaves the profile at Family')
test('submitting with the name blank names the name field')
// @covers REQ-TRV-012@v2
test('an end date before the start date is shown as an error on the end date')
test('a Trip longer than 14 Days is shown as an error on the end date')
// @covers REQ-TRV-014@v2
test('a Traveler renames a Trip and sees the new name in the list')
// @covers REQ-TRV-015@v2
test('a Traveler deletes a Trip after confirming, and it leaves the list')
// @covers REQ-TRV-016@v1
test('a Traveler with two Trips sees both by name')
// @covers REQ-TRV-007@v2
test('Traveler Y opening X Trip URL sees "Trip not found" and no Trip details')
// @covers REQ-TRV-061@v1
test('saving an edit shows a success message')
test('a failed save shows a failure message and keeps the typed values')   // PATCH forced to 500 by route interception
// @covers REQ-TRV-093@v1
test('a Destination an Administrator just added is offered on the Trip form, shown with its country')
// @covers REQ-TRV-095@v1
test('an Administrator trying to remove a Destination used by a Trip sees it refused, and it stays listed')
```

---

## Decisions this forces

- **ADR: soft delete for Trips.** A `deleted_at` column. Every Traveler query filters it out, and the Destination in-use check deliberately doesn't. The purge job is designed in slice 8, with restore (REQ-TRV-099).
- **ADR: the number of travelers is derived, never stored.** `numberOfTravelers` is the one exception to "reject unknown fields": it is accepted and thrown away. Rejecting it would contradict 011 c8, which submits it and expects the Trip to be created.
- **ADR: a Trip that isn't yours returns 404, not 403.** Absent, deleted and not-owned get the same response, so a caller can't learn which Trip ids exist.
- **ADR: Trip dates are calendar dates, not instants.** Stored as `YYYY-MM-DD`. How "today" is decided is uncertainty 2.
- **ADR: a Destination foreign key with restrict, plus a checked 409.** The database backs up the rule, and the service states it.
- Still unwritten from slices 1 and 2: ADR-0001 to ADR-0005 and the three slice 2 ADRs. Worth doing at `/checkpoint`.

---

## What I am unsure about

1. **REQ-TRV-010 c2 and c3.** CHG-0001 and CHG-0002 both noted these need the Trip form and were never tested, yet 010 is `verified`. This slice's form pre-fills currency and travel style from the profile, so c2 could be tested now, except that food preference isn't a Trip field until slice 6. I haven't planned it, because 010 is outside this slice's list. It needs a decision: a change record, or reopening 010.
2. **Whose "today"?** 012 says "a new Trip must start today or later", but not in which time zone. At 08:00 in Sydney it is still yesterday in UTC. I propose using the server's UTC date for now and **recording this as an ambiguity** for the client, not settling it. Belt B uses dates a few days away from today, so it doesn't depend on the answer.
3. **Budget shape.** "Negative is refused" suggests 0 is allowed. I've assumed whole numbers only, since JPY has no minor unit, with an upper limit of 10,000,000. None of this is in the criteria or ANSWERS.md.
4. **Limits the criteria don't give.** Name up to 100 characters, and adults and children up to 20 each. These are safety limits, not client rules. The client should confirm them.
5. **Travel styles, one or several.** ANSWERS.md allows up to 3 styles per Trip, but that is REQ-TRV-020 (slice 6). I'd store a list now, so slice 6 doesn't need a migration, and show a single choice on the form for 011 c12. The "at most 3" rule gets its `@covers` in slice 6.
6. **What "refused" means in 007 c2.** I've proposed 404, matching c1. A 403 would reveal that the Trip exists.
7. **The storage failure in 061 c2, browser test.** Belt B can't break SQLite underneath the server, so the test makes the PATCH return a 500 by intercepting it. Belt A proves the form keeps its values. Say if a real storage fault is wanted instead.
8. **Delete confirmation.** No criterion asks for it. I've proposed a confirmation step on the page because a delete is easy to trigger by mistake, and restore doesn't exist until slice 8.
9. **Glossary.** The requirements say *Plan* and *Day*, but the glossary defines *Itinerary* and has no entry for *Day*. "Destination" is still listed as undefined, though ANSWERS.md settles it. I use the requirements' words: Trip, Plan, Day, Destination and Draft. The glossary fixes belong in `/checkpoint`.
