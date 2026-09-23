---
name: close-slice
description: Record verified for a finished slice, and refuse to start the next slice until this one is Done. Use after /tdd once tests are green, and before /feature-plan or /tdd on a later slice.
allowed-tools: Read, Grep, Glob, Bash
---

# close-slice

A slice is **not Done** because `/tdd` ran. `/tdd` starts work
(`agreed → in_progress`). This command records the evidence
(`in_progress → verified`) and locks the next slice until every id in this
one is `verified` or `signed_off`.

**Invoke with the slice or the ids**, e.g. `/close-slice 2` or
`/close-slice REQ-ONIT-005 REQ-ONIT-006`.

---

## Before running a vendored script

```bash
[ -f .claude/itm-sdlc/scripts/close-slice.js ] || echo "vendored toolkit predates close-slice.js - re-run install.js"
[ -f .claude/itm-sdlc/scripts/advance-status.js ] || echo "vendored toolkit predates advance-status.js - re-run install.js"
```

If `.claude/itm-sdlc/node_modules/` is missing:

```bash
cd .claude/itm-sdlc && npm ci --omit=dev --no-audit --no-fund
```

Then return to the project root.

---

## 1. Record what the tests earned

From the project root. Pass the ids `/tdd` just built, or `--slice N`.

```bash
node .claude/itm-sdlc/scripts/close-slice.js --project . REQ-... REQ-...
```

or

```bash
node .claude/itm-sdlc/scripts/close-slice.js --project . --slice 2
```

The script writes `status: verified` and `verified_by` only for ids that a
test annotates at the **current** version **in every required belt**. It
refuses the rest. **Never edit the YAML by hand.**

**Show the script output.** Do not paraphrase it.

## 2. Read the slice line

If it says the slice is **not Done**, that is the restriction:

- The remaining OPEN ids still need `/tdd` (and a `@covers` test).
- **Do not** `/feature-plan` or `/tdd` a later slice.
- **Do not** tell the developer the task is finished.

If every named id moved to `verified` and the slice line still says In
progress, the other ids in that slice were never built. Name them. That is
the next `/tdd`, not a new slice.

## 3. Catch-up (no ids)

When the dashboard is stuck In progress after work that already has tests:

```bash
node .claude/itm-sdlc/scripts/close-slice.js --project .
```

That closes every `in_progress` id that has earned it, and lists the ones
that have not.

---

## Rules

- **A green test suite is not Done.** Done is `verified` on every id the
  slice covers, recorded by this script (or `/tdd` calling it).
- **Never write `signed_off`.** The client does that.
- **Never skip an OPEN id** by starting the next slice. `--force` exists for
  the gate used by `/tdd` / `/feature-plan` when the developer explicitly
  overrides. You do not pass `--force` from here unless they said so in this
  conversation.
- **`.brain/` knowledge still goes through `/checkpoint`.** This command
  only writes `status`, `verified_by` (and whatever `advance-status.js`
  writes with them) on the code branch.

## Then

If Done: `/verifyReq` then PR, or `/feature-plan` the next slice.
If not Done: `/tdd` the OPEN ids in this slice. Lost? `/help`
