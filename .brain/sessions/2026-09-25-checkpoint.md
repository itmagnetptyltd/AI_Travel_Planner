# 2026-09-25 — CHG-0002 settled, slice 3 plan revised

## Worked on
CHG-0002 (resolved as absorbed; its own branch,
`brain/chg-0002-trips-cross-slice-split`). Slice 3 plan for REQ-TRV-007, 011,
012, 013, 014, 015, 016, 061, 093 and 095, revised to the v2 text:
`2026-09-25-plan-REQ-TRV-011-trips.md`.

## Learned
- The glossary had fallen behind the client's answers of 2026-09-23. It still
  called Destination undefined and used Itinerary where every agreed
  requirement says Plan. Nobody noticed until planning Trips, which is the
  first slice to name those things in code.
- Splitting a slice's criteria across later slices is now the second time
  (CHG-0001, CHG-0002). Both slices were planned from requirements written
  before the build order existed. Slices 4 onwards may need the same check at
  `/feature-plan`, before any code.

## Left unfinished
- **Slice 3 plan is not approved.** No code written. `/tdd` waits for it.
- **CHG-0002 branch is committed but not pushed.** The push needs a GitHub
  login this session couldn't give. Until it merges, `feat/trv-trips` still
  carries the v1 text of 007, 011, 012, 014 and 015.
- **REQ-TRV-008 is still draft.** The privacy answer (Australian Privacy Act,
  account deletion, data export) adds nothing testable to "profile is never
  returned to another Traveler". It needs a requirement of its own
  (`/change-record`) or a decision that it does not apply.
- **REQ-TRV-010 c2 and c3** are untested although 010 is `verified`. Flagged by
  CHG-0001 and CHG-0002. Needs a change record or reopening 010.
- **"Today" for Trip dates.** 012 says a new Trip must start today or later,
  but not in which time zone. The plan proposes the server's UTC date and
  recording the question for the client. It is not yet in `AMBIGUITIES.md`,
  because adding it would move 012 back to draft.
- **ADR backlog.** ADR-0001 to ADR-0005 (slice 1) and three slice 2 ADRs were
  named in earlier plans and never written. The slice 3 plan names five more.
  They should be written from the sessions that made them, not reconstructed
  here.

## Promoted to the record
- `glossary.md`: Destination, Day and Plan added. Trip and Activity rewritten
  to the client's answers. Answered terms taken off the "not yet defined" list.
