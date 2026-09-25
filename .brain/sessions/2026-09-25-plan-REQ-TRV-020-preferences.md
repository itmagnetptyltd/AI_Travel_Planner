# Plan — Slice 6 Preferences and personalization

Covers REQ-TRV-020@v1, 021@v1, 022@v1, 023@v1, 024@v1, 025@v1, 028@v1, 096@v1. All `agreed`.
Branch `feat/trv-preferences`, stacked on `feat/trv-save-reopen` until slice 5 merges.
Gate: slice 5 Done (4/4).

`.brain/decisions/`, `rejected/` and `constraints/` are still empty, so nothing recorded
governs this plan and no rejected approach is being re-proposed.

**Status: proposal. Nothing is built. Three items under "Needs your decision" should be
answered before `/tdd`.**

---

## Needs your decision before /tdd

### 1. Checkbox groups, or multi-select boxes?

ANSWERS.md says a Trip has up to 3 travel styles, any number of food preferences and any
number of transportation options. Today the Trip form has one single-choice Travel style
dropdown. It has to become a pick-several control.

I propose **a group of checkboxes** for each list (a labelled fieldset), because a
multi-select box needs Ctrl-click and is hard to use on a phone or with a screen reader.

The cost is that some labels now appear twice on the page: "Budget" is both a travel style and
the budget field, and "Adventure" is both a travel style and an interest. Three existing
browser-test selectors (`getByLabel('Budget')` in `trip-journeys.ts` and `trips.spec.ts`) become
ambiguous, and the Travel style lines in `trips.spec.ts` (69 to 88) and `accounts.spec.ts`
assume a dropdown. I would change those selectors to say what they mean (the number field by
role, each list inside its named group). No requirement changes; the tests still cover REQ-TRV-010
and 011. The alternative is `<select multiple>`, which keeps most old selectors and worsens the
form.

### 2. What are the accommodation preferences?

REQ-TRV-025 names five values: type, budget range, preferred location, rating and facilities.
Unlike styles and food, **no list is given for any of them**, and the client's answers say only
that they shape the cost estimate and suggested area, and never name a hotel.

I propose each is **optional text, at most 100 characters**, and I do not invent lists,
a rating scale or a budget-range format. The Plan request carries whatever the Traveler typed.
This is a client question I cannot settle: is "type" a list (Hotel, Hostel, Apartment...), what
is a "budget range", and is "rating" stars? It belongs in `AMBIGUITIES.md`.

### 3. Pre-fill the food preference from the profile?

REQ-TRV-010 (already verified) says a new Trip form is pre-filled with the profile's currency,
travel style **and food preference**. Only the first two are done today, because food
preference was not a Trip field. CHG-0002 recorded that gap and left it for you to decide.

I propose this slice **finishes it**: a new Trip's food preference is pre-filled from the
profile, and the Traveler can change it for that Trip (ANSWERS.md, "Profile preferences versus
Trip preferences"). It is one line plus a test, annotated REQ-TRV-010@v1. If you would rather
leave it, that gap stays.

---

## What must be true

### REQ-TRV-020 — travel style, from the eight listed (A B C)
1. Creating or editing a Trip offers exactly Relaxed, Balanced, Adventure, Luxury, Budget, Family, Business and Cultural.
2. Choosing Family and saving shows travel style Family when the Trip is reopened.
3. Choosing Family and Cultural and saving shows both.
4. Submitting four travel styles saves nothing and names the travel style as the invalid field.

### REQ-TRV-021 — interests, from the twelve listed (A B C)
1. Exactly History, Nature, Shopping, Food, Museums, Beaches, Nightlife, Photography, Adventure, Sports, Local Culture and Architecture are offered.
2. Choosing History and Food and saving shows both when the Trip is reopened.

### REQ-TRV-022 — food preference, from the six listed (A B C)
1. Exactly No Preference, Vegetarian, Vegan, Halal, Gluten-Free and Other are offered.
2. Choosing Halal and saving shows Halal when reopened.
3. Choosing Vegetarian and Gluten-Free shows both.
4. No Preference together with Vegetarian saves nothing and names the food preference.

### REQ-TRV-023 — transportation, from the five listed (A B C)
1. Exactly Public Transport, Taxi, Rental Car, Walking and Mixed are offered.
2. Choosing Public Transport shows it when reopened.
3. Choosing Public Transport and Walking shows both.
4. Mixed together with Taxi saves nothing and names the transportation.

### REQ-TRV-024 — values outside the lists are refused (A C)
1. Submitting travel style "Backpacker" through the API gives 400 naming the travel style field.
2. Submitting transportation "Helicopter" gives 400 naming the transportation field.

### REQ-TRV-025 — accommodation preferences (A B C)
1. Recording accommodation type, budget range, preferred location, rating and facilities shows the same five values when reopened.
2. With accommodation type Hotel and preferred location near the city centre, the Plan request contains both.
3. The stay summary of a generated Plan shows an accommodation type, a suggested area and a nightly cost estimate, and names no specific hotel or property.

### REQ-TRV-028 — the AI is given the preferences, and not the identity (A C)
1. A Trip with travel style Family, interests Nature, food preference Vegetarian and transportation Walking sends a request containing all four.
2. A Traveler named Jane Citizen with a Trip named "Jane Citizen 40th birthday": the request contains neither the name, the Trip name nor the account identifier.
3. With 2 adults and 2 children the request says so, and carries no child's name or date of birth.

### REQ-TRV-096 — defaults (A B C)
1. A Trip created with no travel style, food preference or transportation sends a request carrying Balanced, No Preference and Mixed.

---

## Approach

Preferences are stored on the Trip as JSON columns, the way `travel_styles` already is. The
Plan request is built from them, with the defaults applied at request time, not stored.

**Shared** — `src/shared/trip-preferences.ts` (new): `INTERESTS`, `TRANSPORTATION`, the
exclusive values (`No Preference`, `Mixed`), and the zod schemas. `FOOD_PREFERENCES` and
`TRAVEL_STYLES` stay where they are.
- Each list is unique-valued; travel style at most 3 (the existing limit); interests any number; food preference and transportation any number, except that `No Preference` and `Mixed` must stand alone.
- `accommodation` is `null` or an object of five optional text fields, each trimmed and at most 100 characters.
- `trip-schemas.ts` adds `interests`, `foodPreferences`, `transportation` and `accommodation` to the create and update schemas, and to `TripView`.

**Errors** — `parseBody` names a failing field by its full path, so an unknown style comes back as
`travelStyles.0`. REQ-TRV-024 wants "the travel style field", and the form maps `travelStyles` to
"travel style". I propose it names the **top-level field** (`travelStyles`). Every existing test
expects a single-segment name, so nothing else moves.

**Data** — migration `0005_trip_preferences.sql`: `interests`, `food_preferences` and `transportation` (JSON, default `[]`) and `accommodation` (JSON, nullable) on `trips`. Existing Trips get empty preferences.

**Trip service** — `trip-service.ts` copies the four new fields by name, as it does the others, and returns them in the view.

**Plan request** — `plan-prompt.ts`. `PlanPromptInput` gains `preferences`. A small pure function fills the defaults: an empty travel style list becomes Balanced, an empty food list becomes No Preference, an empty transportation list becomes Mixed. Interests and accommodation are left out when empty.
- The Traveler's preferences reach the AI as labelled lines. The accommodation values are free text the Traveler typed, so they go inside the `<reference_data>` section, escaped and cut, like the Destination text.
- The system text gains one rule: name an accommodation type, a suggested area and a nightly cost, and **never a specific hotel or property**.
- The type still has no field for the Trip name, email or account id, so REQ-TRV-028 crit 2 and 3 hold by construction, and the tests prove it.

**Web**
- New `CheckboxGroup` (fieldset, legend, one checkbox per option). `TripForm` uses it for the four lists and adds an Accommodation fieldset of five text inputs.
- `trip-form-state.ts`: the list fields become arrays, with a `toggled` action. `newTripValues` pre-fills the travel style and, if you agree to item 3, the food preference. `FIELD_NAMES` names the four new fields, so a refusal says "Check the food preference."
- `TripPage` shows each preference the Trip has, for example `Travel style: Family, Cultural`.

**Files (new):** `src/shared/trip-preferences.ts`, migration `0005` with its snapshot and journal entry, `src/web/components/CheckboxGroup.tsx`, and the test files below.
**Files (changed):** `db/schema.ts`, `shared/trip-schemas.ts`, `trips/trip-service.ts`, `http/validation.ts`, `plans/plan-prompt.ts`, `plans/plan-service.ts`, `web/components/TripForm.tsx`, `web/pages/trip-form-state.ts`, `web/pages/TripFormPage.tsx`, `web/pages/TripPage.tsx`, `tests/support/a-trip.ts`, and the three e2e selectors named in item 1.

---

## Test skeleton

One test per criterion at least. Belts: A = `tests/unit/*.test.ts`, C = `tests/api/*.http.spec.ts`, B = `e2e/*.spec.ts`.

### `tests/unit/trip-preferences.test.ts` (A)
- `// @covers REQ-TRV-020@v1` — the travel style list is exactly the eight
- `// @covers REQ-TRV-020@v1` — three travel styles are accepted and four are refused, naming travelStyles
- `// @covers REQ-TRV-021@v1` — the interest list is exactly the twelve
- `// @covers REQ-TRV-022@v1` — the food preference list is exactly the six
- `// @covers REQ-TRV-022@v1` — No Preference with Vegetarian is refused, naming foodPreferences; No Preference alone is accepted
- `// @covers REQ-TRV-023@v1` — the transportation list is exactly the five
- `// @covers REQ-TRV-023@v1` — Mixed with Taxi is refused, naming transportation; Mixed alone is accepted
- `// @covers REQ-TRV-024@v1` — "Backpacker" as a travel style and "Helicopter" as transportation are refused
- `// @covers REQ-TRV-024@v1` — an unknown interest or food preference is refused, and a repeated value is refused
- `// @covers REQ-TRV-025@v1` — an accommodation value over 100 characters is refused; an empty accommodation is accepted

### `tests/unit/trip-service.test.ts` (A, additions)
- `// @covers REQ-TRV-020@v1` — a Trip saved with Family and Cultural reads back with both
- `// @covers REQ-TRV-021@v1` — a Trip saved with History and Food reads back with both
- `// @covers REQ-TRV-022@v1` — a Trip saved with Vegetarian and Gluten-Free reads back with both
- `// @covers REQ-TRV-023@v1` — a Trip saved with Public Transport and Walking reads back with both
- `// @covers REQ-TRV-025@v1` — the five accommodation values read back as saved
- editing a Trip's preferences changes only what was sent (supplementary)

### `tests/unit/plan-prompt.test.ts` (A, additions)
- `// @covers REQ-TRV-028@v1` — a request for Family, Nature, Vegetarian and Walking contains all four
- `// @covers REQ-TRV-096@v1` — a Trip with no travel style, food preference or transportation carries Balanced, No Preference and Mixed
- `// @covers REQ-TRV-096@v1` — a Trip with a travel style set keeps it, and is not overridden by the default
- `// @covers REQ-TRV-025@v1` — accommodation type Hotel and preferred location near the city centre are in the request
- `// @covers REQ-TRV-025@v1` — accommodation text sits inside the reference data section and cannot close it (supplementary)
- `// @covers REQ-TRV-025@v1` — the request tells the AI never to name a specific hotel or property
- `// @covers REQ-TRV-028@v1` — the request has no child's name or date of birth, and carries 2 adults and 2 children

### `tests/unit/plan-service.test.ts` (A, additions)
- `// @covers REQ-TRV-028@v1` — a Traveler named Jane Citizen with a Trip named "Jane Citizen 40th birthday": the request has neither name, the Trip name nor the account identifier

### `tests/unit/trip-form-state.test.ts` (A)
- `// @covers REQ-TRV-020@v1` — choosing and clearing options adds and removes them from the list
- `// @covers REQ-TRV-010@v1` — a new Trip form is pre-filled with the profile's travel style and food preference (only if you agree to item 3)
- `// @covers REQ-TRV-022@v1` — a refused food preference is named "food preference" to the Traveler

### `tests/api/trip-preferences.http.spec.ts` (C)
- `// @covers REQ-TRV-020@v1` — a Trip created with Family reads back Family, and with Family and Cultural reads back both
- `// @covers REQ-TRV-020@v1` — four travel styles give 400 naming travelStyles, and nothing is saved
- `// @covers REQ-TRV-021@v1` — History and Food read back
- `// @covers REQ-TRV-022@v1` — Halal reads back; Vegetarian and Gluten-Free read back; No Preference with Vegetarian gives 400 naming foodPreferences
- `// @covers REQ-TRV-023@v1` — Public Transport reads back; Public Transport and Walking read back; Mixed with Taxi gives 400 naming transportation
- `// @covers REQ-TRV-024@v1` — "Backpacker" gives 400 naming travelStyles and "Helicopter" gives 400 naming transportation
- `// @covers REQ-TRV-025@v1` — the five accommodation values read back
- `// @covers REQ-TRV-025@v1` — a Plan for a Trip with accommodation Hotel and a preferred location sends both to the AI double
- `// @covers REQ-TRV-028@v1` — the request received by the double carries Family, Nature, Vegetarian and Walking, and 2 adults and 2 children
- `// @covers REQ-TRV-028@v1` — the request has neither the Traveler's name, the Trip name nor the account identifier
- `// @covers REQ-TRV-096@v1` — a Trip with no preferences sends Balanced, No Preference and Mixed
- editing a Trip's preferences after a Plan exists leaves the Plan unchanged (supplementary)

### `e2e/trip-preferences.spec.ts` (B)
- `// @covers REQ-TRV-020@v1` — the travel style group offers exactly the eight
- `// @covers REQ-TRV-020@v1` — a Traveler chooses Family, saves, and sees travel style Family on the Trip; then Family and Cultural
- `// @covers REQ-TRV-020@v1` — choosing four travel styles and saving shows "Check the travel style." and saves nothing
- `// @covers REQ-TRV-021@v1` — the interests group offers exactly the twelve; History and Food are shown after saving
- `// @covers REQ-TRV-022@v1` — the food preference group offers exactly the six; Halal, then Vegetarian and Gluten-Free, are shown after saving; No Preference with Vegetarian shows "Check the food preference."
- `// @covers REQ-TRV-023@v1` — the transportation group offers exactly the five; Public Transport, then Public Transport and Walking, are shown; Mixed with Taxi shows "Check the transportation."
- `// @covers REQ-TRV-025@v1` — the five accommodation values are shown after saving
- `// @covers REQ-TRV-025@v1` — after generating a Plan for a Trip with accommodation Hotel and a preferred location, an Administrator opens the stored AI request and sees both in the text
- `// @covers REQ-TRV-025@v1` — the generated Plan's stay summary shows a type, an area and a nightly cost
- `// @covers REQ-TRV-096@v1` — after generating a Plan for a Trip with no preferences, an Administrator opens the stored AI request and sees Balanced, No Preference and Mixed
- `// @covers REQ-TRV-010@v1` — the new Trip form is pre-filled with the profile's travel style and food preference (only if you agree to item 3)

### Existing tests that must stay green
Slice 3 and 5's browser tests, once their selectors are updated as described in item 1, and every
API test that creates a Trip with the old `travelStyles` field.

---

## Decisions this forces

Each becomes an ADR once chosen. I recommend the first two.

1. **Preferences are JSON columns on `trips`,** matching `travel_styles`. Nothing filters on them yet; slice 9 (search and filter Trips by travel style) needs "a Trip that has that style among its values", which SQLite's JSON functions can do without a join table. If that proves slow, slice 9 can add one.
2. **Defaults apply when the request is built, not when the Trip is saved.** A Trip with no travel style stays "Not set" on screen and is planned as Balanced. The alternative, storing the defaults, would show the Traveler choices they never made.
3. **The API names a failing field by its top-level name.** This changes one function shared by every endpoint.

## What I am unsure about

- **Accommodation** (item 2). I am guessing at free text because nothing says otherwise.
- **How many interests.** The requirement lists twelve and shows two chosen. ANSWERS.md sets a limit for travel styles only. I allow any number.
- **Whether "no specific hotel" can be enforced.** REQ-TRV-025 crit 3 says the stay summary "names no specific hotel or property". I can only tell the AI not to, and test that the instruction is in the request. Nothing checks what the AI returns. A test double that returns "Hilton Shinjuku" would pass. That is a gap in what can be verified, not something I can close with code.
- **Free text goes to a third party.** The accommodation fields are typed by the Traveler and sent to the AI. The privacy notice already says Trip details are sent to a third-party AI service. It does not say free text may contain personal detail. That is a wording question for the client.
- **Changing preferences after a Plan exists.** REQ-TRV-098 covers destination, dates, adults and budget and says nothing about preferences. I leave the Plan as it is and show no banner. The Traveler regenerates if they want the new preferences used.
- **Interests and travel styles share names.** "Adventure" is in both lists. They are sent to the AI on separate labelled lines, so the two are never confused, but the Traveler sees the word twice.
- **The 4-style refusal in the browser.** I let the Traveler tick a fourth style and the server refuses it, rather than disabling the fourth checkbox. That keeps one place that enforces the rule, and it is what the criterion describes. It is a worse experience than disabling.
- **Old Trips.** Trips saved before this slice have empty preferences and are planned with the defaults.

## Review triggers

This adds free text that reaches an external AI, so **security-reviewer** runs before the commit, and **typescript-reviewer** and **code-reviewer** after `/tdd`.

## Then

Waiting for you. Answer the three items at the top, or say "I approve" to take my
recommendations, then run `/tdd REQ-TRV-020 REQ-TRV-021 REQ-TRV-022 REQ-TRV-023 REQ-TRV-024 REQ-TRV-025 REQ-TRV-028 REQ-TRV-096`.
