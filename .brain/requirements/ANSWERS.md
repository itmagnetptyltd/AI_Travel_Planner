# Answers

> **Status: confirmed by the client, 2026-09-23.**
> These answers were drafted as proposed defaults for the TRV demo build. On
> 2026-09-23 Kartik Chandra Biswas confirmed, in the development session, that
> the client accepts all 52 as written. No separate client message was supplied;
> if one exists, add it here.
>
> Channel recorded on requirements: `client confirmation relayed in session 2026-09-23`.

The questions and their readings are in `AMBIGUITIES.md`. This project is
greenfield, so none were answered from the code.

## Destination: chosen from the Administrator's list, or free text?

_When a Traveler creates a Trip, must the Destination be chosen from the Administrator-managed Destination list, or may the Traveler type any place name?_

The Traveler must choose the Destination from the Administrator-managed list (option b), with type-ahead search over that list. Every Trip points at a Destination record, so filtering by country/city, "popular destinations" and disabling a Destination all work. The glossary entry for Destination should be rewritten to match. If a place is missing, the Traveler cannot create the Trip until an Administrator adds it; a "request a destination" feature is out of scope for the demo.

## Activities per Day

_How many Activities may a Day hold — exactly three (morning, afternoon, evening), or any number, each with its own time and duration?_

Any number (option b). Each Activity has its own start time, duration, location, estimated cost and reason for the recommendation, as §8 requires. Activities are ordered by start time. The AI should aim for 3–5 Activities per Day by default, adjusted by travel style. The glossary entry for Activity should be rewritten to match.

## One Plan per Trip, or kept versions?

_Does a Trip keep only its latest Plan, or must earlier Plans (before an edit, chat change or regeneration) be kept so the Traveler can go back to them?_

Keep versions (option b), but simply. Every generation, regeneration, accepted chat change and saved manual edit creates a new Plan version. The Traveler sees a version list for the Trip and can restore an earlier version (restoring creates a new version; nothing is overwritten). Keep at most the last 10 versions per Trip. Feedback is stored against the Plan version that was current when it was given.

## When does a Trip come into existence?

_Does a Trip exist as soon as the Traveler enters its details, or only once the Traveler saves a generated Plan?_

As soon as the details are entered and submitted (option a). The Trip is saved with status "Draft" and appears in the Trip list before any Plan exists. It becomes "Planned" once a Plan has been generated and saved. "Total trips" on the dashboard counts all Trips; the dashboard also shows how many are Draft vs Planned.

## Which Trip details are mandatory?

_Which Trip details must be filled in before a Trip can be created, and which may be left blank?_

Required: trip name, Destination, start date, end date, number of adults (at least 1), budget and currency. Optional: number of children (defaults to 0) and all preferences (travel style, food, transportation, interests, accommodation). The AI must cope with missing preferences by using sensible defaults (Balanced, No Preference, Mixed).

## Number of travelers versus adults and children

_Is the number of travelers always adults plus children, or is it entered separately and allowed to differ?_

Always adults plus children (option a). It is calculated and displayed, not entered or stored separately. Per-person costs use this total.

## Trip length and past dates

_What is the longest Trip the application must plan, and may a Trip start on a date that has already passed?_

Maximum 14 Days. The end date must be on or after the start date. A new Trip must start today or later; existing Trips whose dates have passed remain viewable but their dates cannot be edited into the past.

## What the budget covers

_Is the Trip budget a total for everyone on the Trip or an amount per person, and must it cover travel to and from the Destination?_

One total for the whole group (option a), covering costs at the Destination only: accommodation, food, local transportation, activities, shopping and other. It excludes flights or other travel to and from the Destination. The screen should state this next to the budget field. Per-person figures are shown for information only.

## Currencies and conversion

_Which currencies must a Traveler be able to choose, and must cost estimates be converted into the Trip's currency?_

Fixed list, no conversion (option a): AUD, USD, EUR, GBP, JPY, SGD, NZD, BDT. All estimates are produced directly in the Trip's currency. No exchange-rate service. On the dashboard, "average budget" is reported per currency rather than as one figure.

## One travel style, food preference and transportation per Trip, or several?

_May a Trip have more than one travel style, food preference or transportation option, or exactly one of each?_

Several of each (option b). A Trip may have up to 3 travel styles, any number of food preferences (so a group can be Vegetarian and Gluten-Free), and any number of transportation options. "No Preference" and "Mixed" are exclusive with the other values in their list. Filtering by travel style matches a Trip that has that style among its values.

## Profile preferences versus Trip preferences

_Should a Traveler's profile preferences fill in each new Trip automatically, and may a Trip then use different ones?_

Pre-fill only (option a). Profile preferences fill in a new Trip's form; the Traveler may change them for that Trip. Each Trip stores its own values. Changing the profile never changes existing Trips or Plans. "Dietary preference" (§17) and "food preference" (§7) are the same thing; use "food preference" everywhere.

## Which AI service, and who pays for it?

_Which AI service should produce Plans and chat replies, and whose account pays for its usage?_

A commercial hosted AI service (Anthropic Claude via API) on the client's own account, paid for by the client (option a). The developer uses a separate development key during the build. The service is called only through the application's AI service layer so the provider can be swapped later. Keys are held server-side only.

## Limits on AI use

_Should the number of Plan generations, regenerations or chat messages a Traveler can make be limited, and if so to how many?_

Yes (option b). Per Traveler, per calendar day: 20 Plan generations/regenerations (whole Plan or Day) and 100 chat messages. When a limit is reached, the Traveler sees a clear message saying when it resets. Administrators can see usage on the dashboard. Limits are configuration values, not hard-coded.

## Working without the AI

_When the AI is unavailable, must the Traveler still be able to build or change a Plan by hand, or only see the fallback message and try again later?_

Fallback message only (option a). Existing Plans remain viewable, and manual edits to existing Activities (edit, remove, move) still work because they don't need the AI. No manual Plan builder from scratch in this build.

## Release 1 "basic itinerary"

_Is the Release 1 'basic itinerary' produced by the AI from destination, dates and budget alone, or is it something simpler that does not use the AI?_

Produced by the AI from Destination, dates, travelers and budget (option a). The AI integration is in place from Release 1; personalization inputs (interests, style, food) are added to the prompt in Release 2.

## Meals and accommodation in the Plan

_Are restaurant meals and accommodation part of the day-by-day Plan as Activities, or shown separately from it?_

Restaurant meals are Activities on each Day, with a category of "Food" (so "replace expensive restaurants" is an Activity replacement). Accommodation is shown separately as a stay summary for the Trip (type, suggested area, nightly cost estimate), not as a daily Activity. Cost totals come from Activity categories plus the stay summary.

## Which personal details must stay out of AI requests?

_Which Traveler details count as sensitive and must be kept out of AI requests — for example name, email address, children's details, food preference?_

Identity details are never sent: name, email address, account ID, phone, and trip name if it could identify someone. Sent because the Plan needs them: Destination, dates, number of adults and children, children's age ranges (not names or birthdates), budget, currency, and preferences including food preference (option a). The privacy notice must tell Travelers that trip preferences are sent to a third-party AI service.

## Storing AI requests and replies

_Should AI requests and replies be stored at all, and if so for how long and who may read them?_

Stored for 30 days, then deleted automatically (option b). Only Administrators may read them, and only through an admin screen that records who viewed what. Separately, token counts and cost per request are kept indefinitely (no text) for the dashboard.

## Chat changes: accept first, or apply and highlight?

_When the AI proposes a change through the chat, must the Traveler accept it before the Plan changes, or does the Plan change straight away with the changes highlighted?_

Accept first (option a). The proposed change is shown as a preview with changed Activities highlighted, and the Plan changes only when the Traveler clicks Accept. Reject discards it. An accepted change creates a new Plan version (so it can also be undone).

## Is the chat conversation kept?

_Should the chat conversation be saved with the Trip and shown again when the Trip is reopened?_

Yes (option a). The conversation is saved with the Trip and shown when it is reopened. It is deleted with the Trip. Only the last 20 messages are sent to the AI as context.

## What may the chat be asked?

_Should the chat answer only questions about the current Trip, or any question the Traveler asks?_

Only the current Trip and travel in general for its Destination (option a). Anything else gets a polite decline. The restriction must be tested with off-topic and prompt-injection examples.

## What is a "section"?

_Apart from the whole Plan and a single Day, what else counts as a 'section' that a Traveler can regenerate?_

Nothing else (option a). "Section" means the same as Day. Single Activities are handled through Replace, not regeneration.

## Regeneration and the Traveler's own edits

_When a Traveler regenerates the Plan or a Day, should Activities they changed by hand be kept, or replaced along with the rest?_

Replaced, with a warning (option a). Before regenerating, the Traveler is warned that manual edits in scope will be replaced. Because Plans are versioned, the previous version can be restored. Pinning is out of scope for the demo.

## Where does a replacement Activity come from?

_When a Traveler replaces an Activity, does the replacement come from the AI, from the Traveler typing their own, or either?_

Either (option c). The Traveler can ask the AI for a replacement suggestion (counts toward the generation limit) or type their own Activity in a form.

## Changing Trip details after a Plan exists

_When a Traveler changes a Trip's dates, Destination or travelers after a Plan exists, should the Plan be regenerated, adjusted, or left as it is?_

- Destination changed: the Plan must be regenerated; the Traveler is warned first.
- Dates changed: the Plan is adjusted (option b). Days are kept in order from the first Day; Days beyond the new length are dropped (with a warning), and new Days are added empty with an offer to generate them.
- Travelers or budget changed: the Plan is left as it is, with a banner suggesting the Traveler regenerate or re-estimate costs.

## Where cost estimates come from

_Should cost estimates come from the AI alone, or from prices the application stores and Administrators maintain?_

From the AI alone (option a). Every estimate is labelled as an estimate, not a guaranteed price. The estimate is stored with the Plan version, so it does not change unless the Plan is regenerated or changed. Administrator-maintained price tables are out of scope.

## What accommodation preferences are for

_Should accommodation preferences lead the Plan to recommend specific places to stay, or only shape the accommodation cost estimate?_

Only shape the accommodation cost estimate and suggested area (option b). No specific hotels are named, since availability cannot be checked.

## Features absent from the requirements matrix and roadmap

_Accommodation preferences, profile preferences, and search and filtering are not in the requirements matrix or the roadmap — are they needed for this demo, and in which release?_

Yes, all three are needed for the demo (option a):
- Profile preferences: Release 1 (with register/login/profile).
- Accommodation preferences: Release 2 (with the other personalization inputs).
- Search and filtering of saved Trips and Destinations: Release 3.

Priority: `should`.

## Travel Consultant role

_Is the Travel Consultant role part of this build, and if so, which Travelers' Trips may a Travel Consultant see and change?_

Not built in this demo (option a). Only two roles: Traveler and Administrator. Keep it listed as a future enhancement.

## Deleting a Trip

_When a Traveler deletes a Trip, is it removed permanently, and what happens to the feedback given on it?_

Soft delete then purge. The Trip disappears for the Traveler immediately and can be restored by them for 30 days, then it is permanently deleted with its Plans and chat. Feedback is kept but detached and anonymised (rating, comment, Destination and date only, no link to the Traveler or Trip) so Administrator reporting survives.

## What an emailed or shared Plan contains

_When the application emails a Plan, to the Traveler or to someone it is shared with, does the email contain the full Plan or a link to view it, and must a link's recipient log in?_

The email contains a readable summary of the full Plan (days and activities, total estimate) plus a link to a read-only view. The link is an unguessable token, needs no login, expires after 30 days, and can be revoked by the Traveler. Shared emails are limited to 10 recipients per Trip per day, and the email clearly names the Traveler who shared it.

## Plan email: automatic or on request?

_Is the email carrying the Plan sent automatically after a Plan is generated, or only when the Traveler asks for it?_

Only when the Traveler asks for it (option b), using an "Email me this Plan" button.

## The "Trip Created" email

_Is the 'Trip Created' email a separate email sent when a Trip is first created, or the same email as the one carrying the Plan?_

A separate, short confirmation email (option a), sent once when the Trip is first created (i.e. when its details are submitted). It contains the Trip name, Destination, dates and a link to open the Trip.

## What counts as a "significant" change?

_Which changes to a Plan are significant enough to send an 'Itinerary Updated' email?_

Changes to the Trip's dates or Destination, and full-Plan regenerations. Not sent for Day regenerations, single Activity edits or chat changes. At most one "Itinerary Updated" email per Trip per hour.

## Reminder timing

_How long before a Trip's start date should the reminder be sent, and should there be more than one?_

One reminder, 3 days before the start date (option a), sent at 09:00 in the application's configured timezone. Each Trip records that its reminder was sent so it is never sent twice. Trips created less than 3 days before they start get no reminder.

## Who controls email notifications?

_Who turns email notifications on and off — each Traveler for their own account, or an Administrator for everyone?_

Both. An Administrator can switch each event type on or off for everyone. Each Traveler can switch Trip Created, Itinerary Updated and Trip Reminder on or off for their own account. All start switched on. Account emails (confirmation, password reset) and shares the Traveler explicitly sends cannot be switched off.

## Email service and sender

_Which email service and sender address should the application send from, and whose account is it?_

A transactional email service (e.g. Amazon SES, Postmark or SendGrid) on the client's account, sending from `no-reply@itmagnet.com.au` with SPF, DKIM and DMARC set up on that domain. During development, a test inbox service (e.g. Mailpit) is used so no real email is sent.

## Account confirmation and password reset

_Must a new account confirm its email address before it can be used, and must a Traveler be able to reset a forgotten password by email?_

Yes to both (option b). A new account must confirm its email address before it can create Trips or receive Plan emails. Confirmation links expire after 24 hours; password-reset links expire after 1 hour and work once.

## Password rules

_What rules must a password meet, for example a minimum length?_

Minimum 12 characters, maximum 128, no character-mix rules, and rejected if it appears in a known-breached password list (per NIST SP 800-63B). Passwords are stored with a strong adaptive hash (Argon2id or bcrypt). Login is rate-limited: 5 failed attempts triggers a 15-minute lockout.

## How Administrators are created

_How does someone become an Administrator — made one by another Administrator, or set up once when the application is installed?_

The first Administrator is set up at installation with a command-line/seed step (option b). After that, an existing Administrator can promote a confirmed user to Administrator or demote one (option a), with a confirmation step and an audit log entry. An Administrator cannot demote themselves if they are the last one.

## What Administrators may do to user accounts

_What may an Administrator do to a user account — view it, disable it, delete it, change its role, or edit its profile?_

View, disable/re-enable, and change role. Administrators may not edit a Traveler's profile details or delete accounts directly (account deletion is done by the Traveler; see Privacy obligations). A disabled account cannot log in and receives no emails. Every action is recorded in an audit log.

## How much of a Traveler's Trip an Administrator may see

_May an Administrator open the full Plan of any Traveler's Trip, or see only summary details such as Destination, dates and budget?_

Summary details only by default (option b): Destination, dates, number of travelers, budget, status and feedback. An Administrator may open the full Plan only for a Trip that has feedback attached, to understand that feedback, and each such view is audit-logged.

## When feedback may be given

_When may a Traveler give feedback on a Trip — once a Plan is generated, or only after the Trip's end date — and may they give it more than once?_

Once a Plan is generated (option a). One feedback entry per Trip, which the Traveler may edit at any time; the latest edit replaces the earlier one. Feedback counts on the dashboard count Trips with feedback.

## Rating scale

_What rating scale should feedback use, for example 1 to 5 stars?_

1 to 5 stars (option a), required, with an optional comment of up to 1,000 characters.

## Identifying recurring requirements before AI analysis

_Before AI feedback analysis exists, how should Administrators identify recurring requirements — by filtering and reading feedback, or by tagging each item with a theme?_

Filtering and reading (option a): filter by rating, Destination, date range and keyword in comments, sortable, with export to CSV. Theme tagging is deferred to the AI feedback analysis release.

## Disabling or removing a Destination that Trips use

_What happens to existing Trips when an Administrator disables or removes their Destination?_

- Disable: the Destination can't be chosen for new Trips; existing Trips keep working, still show it, and can still be regenerated (option a).
- Remove: refused while any Trip (including soft-deleted ones) uses the Destination (option c). Only unused Destinations can be removed.

## What Destination information is for

_Is the Destination information entered by Administrators shown to Travelers, given to the AI when it builds a Plan, or both?_

Both (option c). It is shown to Travelers on a simple Destination detail view when choosing a Destination, and the description, popular activities and travel information are given to the AI as context. The AI prompt treats this text as reference data, not instructions, and it is length-limited.

## Dashboard metrics

_Which of the listed dashboard metrics are required, and is 'AI usage' measured as a number of requests or as cost?_

All seven are required: total users, total trips (with Draft/Planned split), generated itineraries (count of Plan versions created by generation/regeneration), popular destinations (top 10), average budget (per currency), feedback volume (with average rating), and AI usage. AI usage is shown as both number of requests and estimated cost, over a selectable date range.

## Performance targets

_What response time is acceptable for normal pages, how long may a Traveler wait for a Plan to be generated, and how many people must be able to use the application at once?_

- Normal pages: under 2 seconds for 95% of requests.
- Plan generation: runs in the background with progress shown; a 7-Day Plan should complete within 60 seconds and any Plan within 120 seconds, otherwise the fallback message is shown.
- Chat replies: first text shown within 5 seconds (streamed).
- Load: 25 simultaneous users for the demo.

## Privacy obligations

_Which privacy law or policy must the application follow, and must Travelers be able to delete their own account and data?_

The Australian Privacy Act 1988 and the Australian Privacy Principles (option b). Travelers must be able to delete their own account; this permanently deletes their profile, Trips, Plans and chat within 30 days, and anonymises their feedback. Data export (a JSON download of their Trips) is in scope. A privacy notice must state that trip details are sent to a third-party AI service, which may process them outside Australia.

## Where the demo runs

_Where will the application run for the demo — on a public web host, or on a single PC?_

A public web host (option a), always on, with HTTPS on its own address (e.g. `trv-demo.itmagnet.com.au`), so reminder emails and shared links work. The app must also run locally with one command (Docker Compose) for development; the glossary's "easy to run on my PC" note should be updated to reflect this.

## Administrator "content"

_What 'content' do Administrators manage, beyond users, Destinations and feedback?_

Nothing beyond users, Destinations, feedback, notification settings and AI usage limits (option a). Site text and email templates are fixed in code for this demo.
