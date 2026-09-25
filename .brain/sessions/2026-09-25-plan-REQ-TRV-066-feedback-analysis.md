# Plan — REQ-TRV-066@v1, REQ-TRV-067@v1 (slice 13, AI feedback analysis)

Both are `agreed`, belts A, B, C. 067 depends on 066 (same slice). Slice 12 (064, the feedback list) is `verified`.
Nothing in `.brain/rejected/`, `.brain/decisions/` or `.brain/constraints/` (all empty apart from READMEs).
`ANSWERS.md` rules that bind this slice: identity details are never sent to the AI (name, email, account id, phone, and a
trip name that could identify someone); AI request and reply text is kept 30 days, readable only by an Administrator through
a screen that records who viewed it; token counts and cost stay for the dashboard; theme tagging was deferred to this release.

## What must be true

**REQ-TRV-066 — summary**
1. An Administrator asks for a summary of the feedback; the text the AI returned is shown to them.
2. The request sent to the AI holds the feedback comments and none of: the Traveler's name, email address, account id.
3. While that page is used, the browser sends nothing to the AI provider. Only the server calls the AI.

**REQ-TRV-067 — themes**
4. Given entries and an AI that names the theme "schedules are too busy" for two of them, asking for themes shows that
   theme with a count of two entries against it.

## Approach

A new server service, `FeedbackAnalysisService`, reads the feedback the Administrator is looking at (the same
`feedbackFilterSchema` the list and the CSV already use; no filter means all), builds one prompt per request, calls the AI
through the existing `AiService` (REQ-TRV-081), and returns plain data. Two admin routes: `POST /api/admin/feedback/summary`
and `POST /api/admin/feedback/themes`, each taking the filter as its body. POST because it spends money; they sit in the
admin scope, so the admin guards and `Cache-Control: no-store` already apply.

*What is sent.* Per entry: its number in the list, rating, Destination name and country, comment. Never the Trip name (it may
identify someone), the date, or any id. Entries with no comment are counted for the Administrator but not sent. The database
has no account column on feedback, so the identity of a Traveler is not reachable from a feedback row at all; on top of that
a comment's own text is scrubbed of anything shaped like an email address before it is sent (a Traveler can type their own
address into a comment). Comments are put in the prompt as quoted data, and the instructions say they are not instructions.

*Size.* At most the newest `FEEDBACK_ANALYSIS_MAX_ENTRIES` (100) commented entries are sent, so one click cannot send an
unbounded prompt. When that trims the list, the answer says "Based on the newest 100 of 240 comments."

*Reply handling.* Summary: text, trimmed, at most 2,000 characters; empty or oversize is treated as an unusable reply.
Themes: the AI replies with JSON `{ "themes": [{ "name": "…", "entries": [3, 7] }] }`. The **server** works out the count from
the entry numbers: it discards numbers that were not sent and repeats, drops a theme left with no entries, and counts what
remains. The AI's own claim about a count is never used. Themes come back ordered by count, then name. Anything that does not
parse is an unusable reply, shown as "the AI is unavailable", same as an AI failure (REQ-TRV-029 pattern).

*Recording.* Every call is an `ai_requests` row (so it is counted on the dashboard, retained 30 days, viewable through the
audited admin viewer). Two new kinds, `feedback-summary` and `feedback-themes`. Today the row needs a Trip
(`trip_id NOT NULL`) and `AiCaller.reserve` counts against a Traveler's daily limit; neither fits. Migration 0009 makes
`trip_id` nullable, and `AiCaller` gets a `record(...)` that stores the request without the per-Traveler limit check. The kinds
are outside `PLAN_LIMIT_KINDS` and `CHAT_LIMIT_KINDS`, so no Traveler's limit can be touched by an Administrator's analysis.

*Screen.* `/admin/feedback` gets two buttons under the filters, "Summarise feedback" and "Find recurring themes". The result
appears under them as text (never HTML), with a caption that it was written by the AI from the comments and can be wrong, and
the filters it was made from. While it waits: busy state. On failure: role=alert with the standard AI-unavailable message and
the list stays as it was. Nothing else on the page depends on the AI (REQ-TRV-030).

Files to create: `src/shared/feedback-analysis.ts` (constants, view types, `feedbackAnalysisRequestSchema` = the filter),
`src/server/feedback/feedback-analysis-service.ts`, `feedback-analysis-prompt.ts`, `feedback-analysis-reply.ts`,
`src/server/db/migrations/0009_ai_requests_no_trip.sql` + snapshot, `src/web/pages/admin/FeedbackAnalysisPanel.tsx`,
`src/web/pages/admin/use-feedback-analysis.ts`.
Files to change: `src/shared/ai-limits.ts` (two kinds), `src/server/db/schema.ts` (nullable `tripId`),
`src/server/plans/ai-call.ts` (`record`), `src/server/admin/admin-report-routes.ts`, `src/server/app.ts`,
`src/server/ai/scripted-ai-service.ts` (the browser-test stand-in), `src/web/pages/admin/AdminFeedbackPage.tsx`,
`README.md`.

*Browser-test stand-in.* The scripted AI recognises the two requests by how the prompt begins, like chat. The script file
gets a `feedback` block: `summary: "…"` and `themes: [{ name, matching: "keyword" }]`. The stand-in reads the numbered
entries out of the prompt and answers with the numbers whose comment contains the keyword. That keeps the e2e test correct
however much other feedback the shared e2e database already holds.

## Test skeleton

Belt A — `tests/unit/feedback-analysis-*.test.ts`
- `// @covers REQ-TRV-066@v1` a summary is what the AI returned, trimmed
- `// @covers REQ-TRV-066@v1` the request holds each comment, and holds no name, email, account id, Trip name, or date
  (Jane Citizen / traveler@example.com case built from the real tables: a Traveler with feedback, then asserted absent)
- `// @covers REQ-TRV-066@v1` an email address typed inside a comment is not sent
- `// @covers REQ-TRV-066@v1` only commented entries are sent; with none, the AI is not called and the Administrator is told
- `// @covers REQ-TRV-066@v1` more than 100 comments send the newest 100 and say so
- `// @covers REQ-TRV-066@v1` an AI failure, a timeout, an empty or oversize reply are refused as unavailable
- `// @covers REQ-TRV-066@v1` the filter narrows what is sent
- `// @covers REQ-TRV-066@v1` the call is recorded as `feedback-summary`, with the Administrator's id, no Trip, and does not
  count against any Traveler's daily limit
- `// @covers REQ-TRV-067@v1` two entries named by the AI for "schedules are too busy" show that theme counted two
- `// @covers REQ-TRV-067@v1` a repeated number counts once; a number that was not sent is ignored; a theme left with none is dropped
- `// @covers REQ-TRV-067@v1` themes are ordered by count then name; unparseable JSON is refused as unavailable
- `// @covers REQ-TRV-067@v1` the view-state helper words the busy, failed, empty and trimmed states

Belt C — `tests/api/feedback-analysis.http.spec.ts`
- `// @covers REQ-TRV-066@v1` POST summary as Administrator returns the double's text; the double's received request has no identity
- `// @covers REQ-TRV-066@v1` a Traveler, and a signed-out caller, are refused; nothing is sent to the AI
- `// @covers REQ-TRV-066@v1` an invalid filter is a 400; the AI is not called; AI down is a 503 with the standard message
- `// @covers REQ-TRV-067@v1` POST themes returns the theme with count 2; response is `no-store`

Belt B — `e2e/feedback-analysis.spec.ts`
- `// @covers REQ-TRV-066@v1` an Administrator asks for a summary and reads the scripted text
- `// @covers REQ-TRV-066@v1` with the network recorded, every request goes to the application's own origin and none to an AI host
- `// @covers REQ-TRV-066@v1` the AI failing shows the message and leaves the feedback list readable
- `// @covers REQ-TRV-067@v1` two Travelers say the schedule is too busy, one does not; themes show it with "2 entries"

Each new test is run red first for the right reason (missing behaviour), as in earlier slices. I will break the identity
scrub and the server-side counting once each and confirm a test fails, as with the slice 12 mutation checks.

## Decisions this forces (ADR candidates; not written from `/tdd`)

- Feedback comments go to the third-party AI. `ANSWERS.md` says the privacy notice must say trip preferences go to the AI;
  it does not mention feedback. I will extend the sentence a Traveler sees beside the feedback form ("…an AI service may
  summarise comments, without your name or email") — text only — and flag that the client should confirm the notice.
- `ai_requests` now holds rows with no Trip and from an Administrator. Anything that assumed a Trip per row (none found in
  `src/`) or a Traveler per row needs to know.
- Server-computed theme counts (the AI names entries; the server counts). Deliberate, so a wrong claimed count cannot be shown.

## What I am unsure about (recorded, not resolved — the client or you decide)

1. **Which feedback is analysed?** The requirement says "submitted feedback". I propose the list as currently filtered
   (nothing filtered = all). The alternative is always all. Proposing "as filtered" only because the filters and export
   already work that way; it is also what lets an Administrator ask "what do 1-star ratings say?".
2. **The 100-comment cap and the 2,000-character summary cap** are mine; the requirement names neither. The cap is what
   keeps cost bounded.
3. **No limit on how often an Administrator may ask.** Each ask costs an AI call. No requirement sets a limit and I have
   not invented one; it counts on the dashboard's AI usage. Say if you want a daily cap.
4. **Name scrubbing.** I can remove email-shaped text from a comment. I cannot reliably remove a first name a Traveler wrote
   into their own comment; the account's name is not sent, and I do not claim more than that. Test 2 covers only what the
   requirement tests.
5. **Rating-only entries** are not sent (no text to summarise), so a summary says nothing about them.
6. **Stored text.** The `ai_requests` row keeps the comments for 30 days like every AI request; the existing admin AI-request
   viewer (already flagged last slice as bypassing the "Plan only with feedback" gate) would show them.
7. **Which entries "count against" a theme** is displayed as a count only. Listing the entries under each theme would be
   more useful but is not required by the acceptance criterion; not built.
8. Migration 0009 rebuilds `ai_requests` (SQLite cannot drop NOT NULL in place). No foreign keys point at it. Existing rows
   copy across unchanged.

## Waiting for approval

No code has been written and no status has been changed. Approve or correct the plan; correct points 1–3 in particular.
Then `/tdd REQ-TRV-066 REQ-TRV-067`.
