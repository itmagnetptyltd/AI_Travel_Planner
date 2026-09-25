# Plan — REQ-TRV-080@v1 (slice 14, Performance)

`agreed`, belts A and C (no B). Gate passed: slices 1–13 are Done. Nothing in `.brain/rejected/`, `.brain/decisions/` or
`.brain/constraints/` (all empty apart from READMEs). Source of the numbers: `ANSWERS.md`, "Performance targets".

## What is already true, and what is not

| Criterion | Today |
|---|---|
| 1. 25 users, 95% of normal pages under 2 s | No load test exists. Unknown. |
| 2. Page usable and shows progress while a Plan generates | Partly. A status line "Generating your Plan… this can take up to two minutes" is shown and the request does not block the server. No progress beyond that text. |
| 3. 7-Day Plan generates within 60 s | Depends on the AI provider and model. Nothing measures it. |
| 4. No reply after 120 s: fallback shown | `AI_TIMEOUT_MS` defaults to 120 000 and a timeout already gives the fallback. Not tested at exactly 120 s. |
| 5. Chat: first text within 5 s, the rest as it arrives | **Not built.** `AiService.complete` returns one whole string; the chat route answers once, when the AI has finished. |

Criterion 5 is the real build in this slice. Criteria 1 and 3 are about a deployed host and a live AI, which CI cannot reach.

## What must be true

1. With 25 simultaneous users on ordinary (non-AI) pages, 95% of requests answer in under 2 seconds. Proven here against the
   real application over real HTTP on this machine; proven for the demo host by running the same script against it.
2. While a Plan is being generated, the page shows that generation is in progress and how long it has been running, and
   nothing else on the Trip page or elsewhere is frozen by it; the server keeps answering the Traveler's other requests.
3. A 7-Day Plan generation completes in 60 seconds or less. The application adds no meaningful time to the AI's own.
4. If the AI has not answered 120 seconds after generation began, the Traveler is shown the fallback message, the Trip is
   unchanged, and the request is recorded as failed. At 119 s it is still waiting.
5. A chat reply's text reaches the browser as the AI produces it, first text within 5 seconds of the request, the rest as it
   arrives. The final reply, its proposal and its cost are saved exactly as they are today.

## Approach

**Load test (1, 3).** `scripts/load-runner.ts` is a small library: `percentile` (nearest rank), and `runLoad` that starts N
virtual users, each logging in and then looping through ordinary pages and reads with a short think time, timing every request
and counting failures. `scripts/load-test.ts` is the command, `npm run load-test -- <base-url>`, exiting non-zero if p95 ≥ 2 s or
any request failed; with `--generate` it also creates a 7-Day Trip and times one real Plan generation against 60 s (needs a real
AI key on the target, so it is run by hand). `tests/api/performance.http.spec.ts` runs the library against the real app on a
random local port, with 25 users, and asserts p95 < 2 s and no failures. `tsconfig.json` gets `scripts` in `include` so tooling is
type-checked and the test can import it. If the run shows the app is slower than 2 s, fixing that is the work, and I will report what.

**Progress (2).** `src/web/components/plan-progress.ts` turns elapsed time into the words shown; `PlanGenerator` shows the status
line with elapsed seconds and an indeterminate `role="progressbar"`, updated each second, and nothing on the page is disabled that
does not have to be. A server-side test proves the server answers the Traveler's other requests while a generation is waiting.

**120 seconds (4).** Tests only, unless they fail: a fake-timer test of the generation service at the configured default, and a
config test that the default is 120 000 ms.

**Streamed chat (5).**
- `AiRequest` gets an optional `onText(delta)`. `AiService` stays the single way to call the AI (REQ-TRV-081). An adapter that
  cannot stream ignores it and the text simply arrives at the end.
- `anthropic-ai-service.ts` uses the provider's streaming call when `onText` is set, and passes each text delta on. Failures
  still leave as `AiUnavailableError` with no request text or key.
- The chat reply is JSON with `"reply"` as its first key (already so in the chat prompt). A small extractor reads the reply's
  text out of the JSON as it arrives, decoding escapes, so the prompt, the parser and their tests stay as they are. If the AI
  puts something else first, nothing streams early and the whole reply arrives at the end; it still works.
- **REQ-TRV-040 (the AI must not reveal its instructions).** Streaming would show text before the check that catches a reply
  copying the instructions. So the extractor holds back the last 8 words (the same window `revealsInstructions` uses) and only
  releases text once 8 more words have arrived. A run of instructions cannot be shown before it is recognised. When a reply is
  caught, the Traveler gets the existing decline message as the final reply, as today.
- `ChatService` gets `start(owner, trip, message)`, which does what `send` does up to and including reserving the daily limit
  and returns either a refusal (the same 404/429/etc. as today, sent as plain JSON before any streaming) or `run(onText)`,
  which asks the AI, parses, saves, and returns the same result as `send`. `send` becomes `start` then `run`, so the two cannot drift.
- New route `POST /api/trips/:id/chat/stream`, answering `application/x-ndjson`, `Cache-Control: no-store`: lines
  `{"type":"text","text":"…"}` as text arrives, then `{"type":"done","messages":[…]}` or `{"type":"failed","code":…,"message":…}`.
  The existing `POST /api/trips/:id/chat` stays.
- Web: `use-chat.ts` reads the stream and shows the growing reply; `chat-view-state.ts` gets the pure step function that folds
  events into what is shown. On `failed`, nothing is added to the conversation and what the Traveler typed stays in the box,
  as today.
- The scripted AI (browser-test stand-in) sends its chat reply in a few pieces so the streamed path is what runs in the browser tests.

Files to create: `scripts/load-runner.ts`, `scripts/load-test.ts`, `src/server/chat/chat-reply-stream.ts`,
`src/server/chat/chat-stream-routes.ts` (or added to `chat-routes.ts` if it stays small), `src/web/components/plan-progress.ts`,
`src/web/components/chat-stream.ts`.
Files to change: `src/server/ai/ai-service.ts`, `anthropic-ai-service.ts`, `scripted-ai-service.ts`,
`src/server/plans/ai-call.ts` (pass `onText`), `src/server/chat/chat-service.ts`, `chat-routes.ts`,
`src/web/components/{PlanGenerator,use-chat,chat-view-state,ChatBox}.tsx/ts`, `package.json` (`load-test` script),
`tsconfig.json`, `README.md` (how to run the load test).

## Test skeleton

Belt A — `tests/unit/`
- `// @covers REQ-TRV-080@v1` percentile of known samples by nearest rank (95th of 1..100 is 95; empty is refused)
- `// @covers REQ-TRV-080@v1` the runner counts a failed request as a failure and includes its time
- `// @covers REQ-TRV-080@v1` progress wording at 0 s, 7 s, 61 s, 119 s (seconds so far; still says it can take up to two minutes)
- `// @covers REQ-TRV-080@v1` generation at the default timeout: still waiting at 119 999 ms, fallback refusal at 120 000 ms (fake timers)
- `// @covers REQ-TRV-080@v1` config default `AI_TIMEOUT_MS` is 120 000
- `// @covers REQ-TRV-080@v1` a 7-Day generation with an instant AI is saved in well under a second: the application adds nothing to the AI's time
- `// @covers REQ-TRV-080@v1` the reply extractor gives the `reply` text as it arrives, across chunk boundaries that split a word, an escape (`\n`, `\"`, `\uXXXX`) and the key itself
- `// @covers REQ-TRV-080@v1` the extractor holds back 8 words, releases them at the end, and never releases a run copied from the instructions
- `// @covers REQ-TRV-080@v1` a reply whose JSON puts `changes` first still arrives whole at the end
- `// @covers REQ-TRV-080@v1` the chat service `run` with streaming saves the same messages, cost record and proposal as `send` did
- `// @covers REQ-TRV-080@v1` an AI failure after some text was streamed saves nothing and records the request as failed
- `// @covers REQ-TRV-080@v1` the Anthropic adapter passes each text delta to `onText` and still returns the whole reply, tokens and stop reason
- `// @covers REQ-TRV-080@v1` the chat view-state step function: text events grow the reply, done replaces it with the saved messages, failed clears it

Belt C — `tests/api/`
- `// @covers REQ-TRV-080@v1` `performance.http.spec.ts`: 25 users, real HTTP, p95 under 2 000 ms, no failed request
- `// @covers REQ-TRV-080@v1` while a Plan generation is waiting on the AI, the same Traveler's other requests answer promptly
- `// @covers REQ-TRV-080@v1` generation with an AI that never answers returns 503 with the fallback message at the timeout, the Trip unchanged, the record failed
- `// @covers REQ-TRV-080@v1` `chat-stream.http.spec.ts`: on a real connection the first text event arrives while the AI has not finished, and within 5 s
- `// @covers REQ-TRV-080@v1` the stream ends with `done` carrying the saved messages, equal to what `GET /chat` then returns
- `// @covers REQ-TRV-080@v1` a refusal (unknown Trip, limit reached, bad body) is an ordinary JSON error, not a stream, and does not ask the AI
- `// @covers REQ-TRV-080@v1` the AI failing mid-stream ends with a `failed` event carrying only the fixed message
- `// @covers REQ-TRV-080@v1` a reply that copies the instructions never shows the copied words in any text event, and ends with the decline message

## Decisions this forces (ADR candidates)

- Streaming to the browser is newline-delimited JSON over POST, not Server-Sent Events: `EventSource` cannot send a request body.
- The chat reply is streamed out of a JSON reply rather than changing the AI's reply format, and text is held back 8 words for REQ-TRV-040.
- `AiRequest.onText` as the one streaming hook, so there is still one AI interface.
- Load and generation-time acceptance is a repeatable script run against the demo host, recorded by hand; CI proves the application, not the host.

## What I am unsure about (recorded, not resolved)

1. **Criteria 1 and 3 cannot be proven here.** They name "the public demo host" and a live AI. I can prove the application meets
   the numbers on this machine over real HTTP, and I give you the script to prove it on the host. The 60 s for a 7-Day Plan is
   mostly the provider's speed and the model chosen; I cannot make CI show it. Is a recorded manual run acceptable for `verified`?
2. **Which pages are "normal pages".** I propose: the web app's shell, and the reads behind the ordinary screens (log in, Destinations,
   Trips list, one Trip, its Plan, its budget). Not Plan generation, regeneration or chat. Login is included in the timings.
3. **What "remains usable" means.** I propose: the server keeps answering, and no control that does not conflict is disabled. I do
   *not* propose that a Traveler who leaves the page mid-generation finds it still shown as in progress when they return (that needs the
   server to say a generation is running; `ANSWERS.md` says "runs in the background with progress shown", which could mean that).
   Say so if you want it; it is small (a pending AI-request row already exists) but it is more than the criterion states.
4. **"Progress"** is elapsed time and an indeterminate bar. The provider gives no percentage.
5. **The 5 seconds** is measured from the request to the first text event on the wire. How fast the provider produces its first
   token is outside our control.
6. **A hosting risk for criterion 4.** Plan generation is one HTTP request that can wait up to 120 s with nothing on the wire.
   Many hosts and proxies close an idle connection at 60 s. If the demo host does, the Traveler sees a network error, not our fallback
   message, even though our timeout is right. I cannot test that without the host. Worth checking there.
7. Chat streaming assumes the AI writes `"reply"` first. If it does not, the answer still works but is not incremental.
8. `tsconfig.json` will include `scripts/`, so the existing `scripts/seed-administrator.ts` starts being type-checked too.

## Waiting for approval

No code is written and no status has changed. Approve or correct the plan; points 1, 2 and 3 in particular. Then
`/tdd REQ-TRV-080`.
