# Plan — REQ-TRV-082 to REQ-TRV-090 @v1 (slice 15, Out-of-scope guards)

All nine are `agreed`, `priority: wont`, belt A only, one acceptance criterion each. Gate passed: slices 1–14 are Done.
Nothing in `.brain/rejected/`, `.brain/decisions/` or `.brain/constraints/`. `ANSWERS.md` has no answer that changes these
(its "out of scope for the demo" lines are about other features).

## What is already true

The application has none of the nine features today. I checked `src/`: no URL literal anywhere, no weather, map, calendar,
speech, language or booking code; the words that do appear are benign ("calendar date", `localeCompare`, the sentence "not
guaranteed availability, prices or bookings", and the Trip form's "excludes flights"). Emails are plain text with only
`from`, `to`, `subject`, `text`, and there are exactly three notification events. So this slice **builds nothing**. It adds
tests that pin the absence, so a later change that adds one of these features fails a test and has to be a decision.

## What must be true

| Id | Feature not built | Observable |
|---|---|---|
| 082 | Live weather | A generated Plan shows no weather data |
| 083 | Live flight and hotel information | A generated Plan shows no flight or hotel availability |
| 084 | Map | A generated Plan shows no embedded map |
| 085 | Calendar integration | A saved Trip offers no "add to calendar" |
| 086 | Multi-language generation | Asking for a Plan offers no choice of language |
| 087 | Voice assistant | The chat accepts only typed input |
| 088 | Mobile application | No native mobile application is among the deliverables |
| 089 | Risk and disruption notifications | No notification sent for a Trip is a risk or disruption notice |
| 090 | Booking providers | No Activity offers a way to book or pay |

## Approach

A test proving a negative can only look at what ships. Each guard uses whichever of these reaches the feature, and where two
apply both are used:

1. **What a Traveler is shown.** `renderToStaticMarkup` (react-dom is already a dependency; no DOM library needed) renders the
   shipped presentational components, `PlanDisplay`, `ReadOnlyPlan` (the owner's, the shared link's and the Administrator's
   view), `ChatBox`, `TripForm`, `PlanGenerator`, with a full Plan. A small helper lists every button, link, form control and
   embed in the markup by accessible name, and the tests assert none is a weather, map, calendar, language, voice or booking
   control, and that there is no `iframe`, `canvas`, `img`, `audio` or `video`. The one sentence that legitimately says
   "availability… bookings" (`PLAN_RECOMMENDATION_NOTICE`) is required to be present, and is removed before scanning.
2. **What the data can carry.** The Plan, Activity, `stay`, Trip, profile and chat-request contracts have no field for weather,
   availability, a map location, a calendar, a language, audio or a booking. A reply from the AI that includes such fields is
   parsed and they do not survive into the saved Plan.
3. **What the application can reach.** `package.json` (every dependency section) holds no library for maps, calendars,
   internationalisation, speech, weather, flights, hotels, booking, payment or native mobile. No `src/` file contains an
   `http(s)://` address at all (true today) so nothing can call a third-party service without an edit that trips this test;
   the response `Content-Security-Policy` is `default-src 'self'`, which would stop an embedded map or tile server loading.
4. **What is delivered (088).** The repository has no `android/`, `ios/`, Expo, Capacitor or Cordova markers, and no CI job that
   builds a mobile app.
5. **What is sent (085, 089).** Every email template and every event the notification code can send, run for a Trip through
   its whole life, has no attachment, no calendar link or `.ics`, and no risk or disruption wording; the notification and email
   code never imports the AI, and the AI double is not asked anything while notifications are sent.

Files to create (tests only): `tests/support/out-of-scope.ts`, `tests/unit/out-of-scope-plan-views.test.ts`,
`out-of-scope-integrations.test.ts`, `out-of-scope-input.test.ts`, `out-of-scope-notifications.test.ts`, and
`e2e/out-of-scope.spec.ts`. No file under `src/` changes.

## Test skeleton (each carries `// @covers REQ-TRV-0nn@v1`)

**082 weather**
- a Plan on the owner's page, the shared page and the Administrator's page shows no weather word, temperature or forecast
- no Plan, Day, Activity or `stay` field can hold weather; a reply with `weather`/`forecast` keys is saved without them
- nothing in `package.json` or `src/` names a weather service

**083 flights and hotels**
- a Plan shows no flight, airline, room rate or availability text apart from the recommendation notice, which is present
- `stay` is only an accommodation type, an area and a nightly estimate; a reply naming `hotel`, `flightNumber` or `availableRooms` is saved without them
- nothing names a flight or hotel provider

**084 map**
- a Plan, a Trip and a Destination show no `iframe`, `canvas`, `img`, map control or "view on map" link
- no Activity or Destination field holds coordinates or a map address; a reply with `lat`/`lng` is saved without them
- no map library; the CSP is `default-src 'self'` with nothing wider

**085 calendar**
- a saved Trip and its Plan show no "add to calendar", "download .ics" or calendar-provider link
- every email (Trip created, Itinerary updated for each change, reminder, Plan, shared, confirm, reset) is plain text with no attachment, `BEGIN:VCALENDAR`, `text/calendar`, `webcal:` or calendar link
- no calendar library

**086 language**
- the Trip form, the Plan generator and the profile show no language or locale control; their data has no such field, and `POST …/plan` with `language` is refused
- the Plan prompt has no language instruction, and is identical for two Travelers who differ in everything the profile can hold
- no internationalisation library

**087 voice**
- the chat box renders one text area and one Send button, no microphone, speak, record, audio or file control
- the chat request accepts only `{ message: string }`: an `audio` field, a non-string message, and an `audio/*` or multipart body are refused, and the AI is not asked
- no speech, microphone or media-recording API is used anywhere in `src/web`

**088 mobile application**
- `package.json` has no React Native, Expo, Capacitor, Cordova, Ionic, NativeScript or Flutter dependency
- the repository has no `android/`, `ios/`, `app.json`, `eas.json`, `capacitor.config.*` or `config.xml`, and no workflow builds a mobile app

**089 risk and disruption notifications**
- the events the application can notify are exactly Trip created, Itinerary updated and Trip reminder
- run through a Trip's life (created, changed, reminded, shared), every email sent has no risk, disruption, delay, cancellation, strike, storm, warning or advisory wording
- the notification and email code does not import the AI, and no AI request is made while notifications are sent

**090 booking providers**
- every button and link on a Plan and on an Activity (collapsed and opened) is an editing or planning control; none is book, reserve, pay, buy, ticket or checkout, and no link leaves the application
- no Activity field holds a price link, booking URL or provider; a reply with `bookingUrl` is saved without it
- no booking or payment library or address

**Real browser (extra: belt B is not required)** `e2e/out-of-scope.spec.ts`: on a Trip with a generated Plan, no embed or map,
no weather, calendar, language or booking control, an opened Activity offers no booking, and the chat has only a text box.

## Decisions this forces (ADR candidates)

- "Out of scope" is enforced by tests that pin the current absence, not by code that blocks the feature. Adding any of the nine
  later means changing a requirement first (a change record), then the test.
- The URL and dependency scans make every new outbound address or library an explicit, reviewed edit.

## What I am unsure about (recorded, not resolved)

1. **Free text from the AI.** An Activity's `reason` or title is written by the AI and could say "sunny, 25°C" or "book a table at…".
   The requirements say no live weather data is *shown* and no *option* to book is offered; they do not say AI wording must be
   filtered. I have not changed the prompt or filtered replies. Telling the AI never to state weather, availability or booking
   advice would be a change to verified Plan generation; say if you want it.
2. **Voice is stricter than the criterion.** "Only typed input is accepted" is met by the chat box and API. I am *not* adding a
   `Permissions-Policy: microphone=()` header, which would also stop the browser ever offering the microphone; it is one line and
   is a defence, but it is not required. Say if you want it.
3. **Proving a negative.** These tests cannot catch a feature added in a form I did not think to look for; they catch the
   likely ones (a library, an address, a control, a field). I think that is the honest level for `wont` requirements.
4. **088 is about deliverables.** A responsive web app is not a native app; I treat a web app manifest or service worker as not
   native and do not test for them.
5. **The scans are brittle on purpose.** A future legitimate address in `src/` (for example a payment provider if 090 were ever
   changed) must be added to a named allow-list with a reason, in the same change.
6. The notification guard covers the three notification kinds plus the emails a Traveler triggers (Plan email, share); it cannot
   cover an email a future feature adds, only the templates that exist.

## Waiting for approval

No test or code is written and no status has changed. Approve or correct the plan; points 1 and 2 in particular. Then
`/tdd REQ-TRV-082 REQ-TRV-083 REQ-TRV-084 REQ-TRV-085 REQ-TRV-086 REQ-TRV-087 REQ-TRV-088 REQ-TRV-089 REQ-TRV-090`.
