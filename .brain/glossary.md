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

Taken from `.brain/docs/AI_Travel_Planner_BRD.pdf` (BRD v1.0), and from the
client's answers in `requirements/ANSWERS.md` (confirmed 2026-09-23). A word is
here only when one of those settles it.

**Traveler** — the person who creates Trips, uses the AI Planner, manages
Plans, and gives Feedback.
- **Not to be confused with:** an Administrator. There is no Travel
  Consultant in this build (ANSWERS.md, "Travel Consultant role").

**Administrator** — the person who manages users, Destinations, Feedback,
and the dashboard metrics.

**Destination** — a place record an Administrator manages, with a name and a
country. A Trip's Destination is always one of these records, chosen by
type-ahead search. It is never free text. (ANSWERS.md, "Destination: chosen
from the Administrator's list, or free text?")
- **Not to be confused with:** a place name the Traveler types. If a place is
  missing, the Trip can't be created until an Administrator adds it.
- **Identified by:** an identifier the application issues.

**Trip** — one journey the Traveler enters: trip name, Destination, start
date, end date, adults, children, budget, and currency. It exists as soon as
its details are submitted, with status **Draft**, and becomes **Planned** once
a Plan is generated and saved.
- **Number of travelers:** always adults plus children. It is worked out and
  shown, never entered or stored (ANSWERS.md, "Number of travelers versus
  adults and children").
- **Identified by:** an identifier the application issues. Not the trip name.

**Day** — one calendar date of a Trip, from its start date through its end
date. A Trip has at most 14. "Section", as the BRD uses it for regeneration,
means the same as Day (ANSWERS.md, "What is a 'section'?").

**Plan** — the day-by-day plan the AI Planner generates for a Trip: its Days
and their Activities, with estimated costs. Editable. A recommendation, not a
booking. Each generation, regeneration, accepted chat change and saved edit
makes a new Plan version.
- **Also called:** Itinerary. That is the BRD's word, and it survives in the
  "Itinerary Updated" email. The agreed requirements and the code say Plan.

**Activity** — one item on a Day of a Plan, with its own start time,
duration, location, estimated cost and reason for the recommendation. A Day
holds any number of them, ordered by start time (ANSWERS.md, "Activities per
Day"). The Traveler can view, edit, remove, replace, or move one to another Day.
- **Not to be confused with:** a morning, afternoon or evening slot. There are
  no fixed slots.

**Travel preference** — travel style, interests, food preference, and
transportation, using only the lists in BRD §7.

**Feedback** — a rating and comments stored against the Trip or Plan
they refer to.

---

## Appears in source documents, not yet defined

- "country" and "city" — filters in §20, not fields in §6. A Destination has a
  country. Whether it also has a city, or is itself the city, is not settled.

The other terms once listed here were answered by the client on 2026-09-23.
Their answers are in `requirements/ANSWERS.md` and in the acceptance criteria
of the requirements they affect: AI provider, Destination, number of
travelers, share, significant itinerary change, trip reminder, rate, Travel
Consultant and acceptable time.
