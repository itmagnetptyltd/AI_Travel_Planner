# Glossary

Terms are **fixed** on this project. Use these words, spelled this way, and no
synonyms — in requirements, in code, in tests, in conversation with the client.

A term used in a requirement but not defined here is an **ambiguity**, not a
decision anyone may make on the client's behalf. Record it and ask.

---

## Why this file exists

A client described one thing three ways in a single meeting:

> "When a **job** comes in we assign it to a crew."
> "Each **engagement** has a start date and a purchase order."
> "The customer can cancel a **booking** up to 24 hours before."

Three words. The team built:

- a `Job` table for scheduling,
- an `Engagement` record for billing, because it "obviously" carried the PO,
- a `Booking` API for the customer-facing app.

They were the same entity. It was discovered in UAT, when cancelling a booking
left the job scheduled and the engagement billable. The fix touched three
schemas, two APIs and a migration — about three weeks — and none of it was
visible as a defect until real users produced all three views of one record.

**The cost was not the rework. It was that nobody could see it coming**, because
each team was individually consistent and the disagreement lived in the gaps
between them.

Pinning one word at discovery would have cost five minutes.

---

## How to write an entry

**Term** — what it means here, in one sentence. Then, where it matters:
- **Not to be confused with:** the near-synonym people reach for, and how it differs
- **Also called:** what the client says, when it differs from the agreed term
- **Identified by:** what makes two of these the same one

Define the term the *client's business* uses, not the one the database uses. If
they diverge, that divergence is itself worth writing down.

---

## Agreed terms

Taken from `.brain/docs/AI_Travel_Planner_BRD.pdf` (BRD v1.0). A word is
here only when that file settles it.

**Traveler** — the person who creates Trips, uses the AI Planner, manages
Itineraries, and gives Feedback.
- **Not to be confused with:** an Administrator, or a Travel Consultant.

**Administrator** — the person who manages users, Destinations, Feedback,
and the dashboard metrics.

**Trip** — one journey the Traveler enters: trip name, destination, start
date, end date, number of travelers, adults, children, budget, and currency.
- **Identified by:** an identifier the application issues. Not the trip name.

**Itinerary** — the day-by-day plan the AI Planner generates for a Trip.
Suggested activities, with times, durations, estimated costs, locations, and
reasons. Editable. A recommendation, not a booking.

**Activity** — one suggested item on a day of an Itinerary. The Traveler can
view, edit, remove, replace, or move it to another day.

**Travel preference** — travel style, interests, food preference, and
transportation, using only the lists in BRD §7.

**Feedback** — a rating and comments stored against the Trip or Itinerary
they refer to.

---

## Appears in source documents, not yet defined

- "AI" — which provider, and where the key lives. The BRD requires a service layer, not a vendor.
- "Destination" — free text on the Trip (§6), or a record an Administrator manages (§19).
- "number of travelers" against "adults" and "children" — must those two counts add up to the first?
- "share" — email to another address only (§14), or something else (§13).
- "significant itinerary change" — which edits send email.
- "trip reminder" — how long before the start date.
- "rate" — the scale is not given.
- "Travel Consultant (optional)" — in this delivery, or not.
- "acceptable time" — no number is given.
- "country" and "city" — filters in §20, not fields in §6.
