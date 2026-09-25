# Plan — REQ-TRV-008@v1 (slice 16, Profile privacy)

`agreed`, belts A and C, one acceptance criterion. Gate passed: slices 1–15 are Done. Its dependency, REQ-TRV-009 (a Traveler
updates their profile), is `verified`. Nothing in `.brain/rejected/`, `.brain/decisions/` or `.brain/constraints/`. The
requirement's own source line records the developer's decision (2026-09-25) that the privacy answer in `ANSWERS.md` adds no
behaviour to it, so it is planned as written.

## What must be true

Traveler X has a profile and Traveler Y is logged in. When Y requests X's profile by X's identifier, the response is a 404 and
carries none of X's profile fields.

## What is already true

There is no route that takes a Traveler's identifier and returns a profile. `GET /api/profile` and `PATCH /api/profile` read the
account only from the caller's own session, and the update body is strict, so it cannot name another account. Any other address
under `/api/` answers 404 `{ "code": "NOT_FOUND" }`, with or without the built web app (the single-page fallback is refused for
`/api/`). Administrators can see accounts, but only through `/api/admin/…`, which answers a Traveler 403. So the requirement
holds today by construction, and this slice **builds nothing**: it adds tests that pin it, so that adding a "view a profile by
id" route later, or letting one read an identifier from the request, fails a test.

## Approach

Tests only; no file under `src/` changes.

The requirement does not say which address "requests X's profile by X's identifier" means, and none exists. So the C tests make
the request at every address a profile could plausibly live at, in the ways a route would most likely be added (path, sub-path,
query string, method), and assert the same thing of each: 404, a body of exactly `{ "code": "NOT_FOUND" }`, and none of X's
values anywhere in the response (display name, email, account id, currency, travel style, food preference, notification
switches). It is repeated with the built web app being served, since a single-page fallback that answered `index.html` with 200
would break "404". The A tests pin the structure that makes it true: the service reads a profile only by the id it is given
(which the route takes from the session), and the route table has no Traveler-facing route that reads a profile by identifier.

Files to create: `tests/api/profile-privacy.http.spec.ts`, `tests/unit/profile-privacy.test.ts`. If the two Travelers' set-up is
needed twice it goes in `tests/support/`.

## Test skeleton (each carries `// @covers REQ-TRV-008@v1`)

**Belt C — `tests/api/profile-privacy.http.spec.ts`** (X has filled in every profile field; Y is logged in)
- Y asking for X's profile by X's account id at `/api/profile/:id`, `/api/profiles/:id`, `/api/accounts/:id`,
  `/api/accounts/:id/profile`, `/api/users/:id`, `/api/travelers/:id`, `/api/account/:id` and `/api/me/:id` gets 404 and
  `{ code: 'NOT_FOUND' }`
- none of X's values appears anywhere in any of those responses, body or headers
- the same with X's email address in place of the id, and with an identifier that belongs to nobody: the answers are the same,
  so a 404 cannot be used to find out whether an account exists
- with the built web app being served, each of those is still a 404 JSON answer, not the page
- `GET /api/profile?id=X`, `?accountId=X` and `?email=X` answer with Y's own profile and none of X's
- Y cannot change X's profile: `PATCH /api/profile` with X's id in the body is refused (400), with `x-account-id`, `x-user-id`
  or `x-forwarded-user` headers still changes only Y's, and `PUT`, `PATCH` and `DELETE` at the by-id addresses are 404; X's
  profile is unchanged afterwards
- someone not logged in asking at those addresses also gets 404 and none of X's values
- X's own `GET /api/profile` still returns X's fields, and Y's returns Y's, so the guard is not passing because profiles are unreadable
- what Y sees through the rest of the Traveler API, including a public link X shared, holds none of X's profile values
- a Traveler asking for the Administrator's account route gets 403 and none of X's fields (the one route that does read an
  account by id; see point 2 below)

**Belt A — `tests/unit/profile-privacy.test.ts`**
- `getProfile` returns the fields of the account it is given and of no other, and nothing for an id that belongs to nobody
- the profile the service returns holds only the profile's own fields: no password hash, no other account's data
- no route in the application reads a profile from anything but the caller's session: the only routes with "profile" in them are
  `GET /api/profile` and `PATCH /api/profile`, neither has a parameter, and every route that takes an account identifier is
  under `/api/admin/`
- the profile update accepts only the profile's own fields, so an account identifier in it is refused

I will run each guard against a deliberately broken application to show it can fail: a `GET /api/profile/:id` route that returns
the profile, `GET /api/profile` honouring an `id` query, the single-page fallback answering `/api/` addresses, a profile update
that reads an account id from its body, and the shared-link view gaining the owner's name.

## Decisions this forces (ADR candidates)

- A Traveler's profile is only ever read through their own session. There is no by-identifier profile route, and adding one is a
  change that needs a requirement first.

## What I am unsure about (recorded, not resolved)

1. **Which address is "X's profile by X's identifier".** The requirement does not name one, and none exists. I test the
   plausible ones, and any I have not thought of that is added later would have to be added to the list. I am not building a
   dedicated route that always answers 404: it would be code that exists only to say no.
2. **The Administrator's route answers 403, not 404.** `/api/admin/accounts/:id` does return an account by identifier, to an
   Administrator only, and a Traveler gets 403. The requirement says "404"; I have read it as being about Traveler-facing
   addresses, since the Administrator role is separately required to see accounts (`ANSWERS.md`, "What may an Administrator do
   to a user account") and its guard is separately verified. If you want that route to answer a Traveler 404 as well, that is a
   change to a verified requirement and needs a decision.
3. **Sharing tells the recipient the sharer's display name.** "Jane Citizen shared this Plan with you" (REQ-TRV-058, verified) is
   put in the email X chooses to send. That is a disclosure X causes, by email, not a profile returned by the application, so I
   have not treated it as a breach, but it is a place where one Traveler's display name reaches another.
4. The guard cannot show that no *future* response will carry another Traveler's fields; it shows that none of the responses the
   application has today does, for the fields a profile holds now.

## Waiting for approval

No test is written and no status has changed. Approve or correct the plan; point 2 in particular. Then `/tdd REQ-TRV-008`.
