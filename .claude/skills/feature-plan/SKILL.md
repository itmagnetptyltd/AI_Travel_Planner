---
name: feature-plan
description: Turn agreed requirement identifiers into an implementation plan and test skeleton. Use at the start of each work item, before any code is written.
allowed-tools: Read, Grep, Glob, Write, Bash
---

# feature-plan

Takes requirement identifiers and produces a plan a developer approves before
code exists.

**Invoke with the ids**, e.g. `/feature-plan REQ-BOOK-001 REQ-BOOK-003`.

---

## 0. Previous slice must be Done

```bash
[ -f .claude/itm-sdlc/scripts/close-slice.js ] || echo "vendored toolkit predates close-slice.js - re-run install.js"
node .claude/itm-sdlc/scripts/close-slice.js --project . --gate REQ-...
```

Pass the ids you were invoked with. Exit 1 means **stop** — an earlier slice
is not Done. Name it. Point at `/tdd` / `/close-slice` for those remaining
ids. Do not write a plan for the new slice.

`--force` only if the developer said in this conversation to plan ahead anyway.

A previous slice that is `In progress 5/29` **does** block planning the next
slice. That is the restriction. Parked ids inside the *current* slice still
do not deadlock `/tdd` on the rest of that same slice.

## 1. Split the list — never deadlock a mixed slice

Read each named requirement from `.brain/requirements/`. **Do not refuse the
whole command** because the list is mixed (some `verified`, some
`in_progress`, some `agreed`). That is normal. A leftover parked id must
not lock the next slice.

| Status | What you do |
|---|---|
| `draft` | Leave it out. Name the open questions. Continue with the rest. |
| `agreed` | Plan these. |
| `in_progress` | Already being built. Do not rewrite their plan unless the developer asked to continue that id. Mention them in one line. |
| `verified` or `signed_off` | Already done. Skip. Mention them in one line. |

If at least one id is `agreed`, write the plan for **those only**.

If none are `agreed` and some are `in_progress`, say so and point at `/tdd`
for those ids — that is not a lock.

If every named id is `verified` or `signed_off`, say the work is already
done and name the next `agreed` ids in `.brain/slices.yaml` **only if
`--gate` passed**. Do not stop the project.

## 1b. Dependencies

Read each **planned** requirement's `depends_on`.

- Dependency is `draft` — leave the dependent out until that draft is agreed.
- Dependency is `agreed` and not in this plan — say so. Prefer to plan that
  dependency first, unless the developer asked for this slice anyway.
- Dependency is `in_progress`, `verified`, or `signed_off` — continue.

Do not wait for every id in an earlier slice to reach `verified` **inside
this plan's own mixed list**. The predecessor-slice gate in step 0 is the
lock. `depends_on` inside the current slice is still a dependency, not a
slice lock.

## 2. Read the record before designing

| Read | For |
|---|---|
| `.brain/glossary.md` | The exact words to use in names |
| `.brain/decisions/` | Decisions that govern the code paths you will touch |
| `.brain/rejected/` | **Whether this approach was already tried and abandoned** |
| `.brain/constraints/` | Limits that apply here, and whether any are past review |

If `rejected/` contains what you are about to propose, say so and explain what
has changed since. Re-proposing an abandoned approach without acknowledging it is
the failure the directory exists to prevent.

## 3. Write the plan

To `.brain/sessions/<date>-plan-<requirement>.md`:

```markdown
# Plan — REQ-BOOK-001@v1

## What must be true
Each acceptance criterion, restated as the observable behaviour to build.

## Approach
The design, in a paragraph. Name the files to be created or changed.

## Test skeleton
One test per acceptance criterion, named for the behaviour, each carrying
`@covers REQ-BOOK-001@v1`. Write the names and assertions, not the bodies.

## Decisions this forces
Anything non-obvious that will need an ADR once chosen.

## What I am unsure about
Where the requirement is thin, or where you are guessing.
```

## 4. Stop for approval

The developer approves or corrects the plan **before** any code is written. Say
plainly that you are waiting.

---

## Rules

- **One test per acceptance criterion, minimum.** A criterion with no test is a
  criterion nobody will notice is missing.
- **Every test carries the requirement at its current version.** `@covers
  REQ-BOOK-001@v1`. The version is mandatory.
- **The plan is a proposal.** A developer who approves every plan unchanged is
  rubber-stamping, and the plan-override rate is a governed metric precisely
  because of that.
- **Every file the application is made of goes under `src/`** — including served
  static assets. The installer creates `src/` for this. Only `package.json` and
  its lockfile (npm reads them from the working directory, and the gates run from
  the repository root), `README.md`, `tests/`, `scripts/` for project tooling,
  and the toolkit's own `.brain/`, `.claude/` and `.github/` belong beside it. A
  plan that puts `public/`, `lib/` or `app/` at the root is wrong.
- Write only to `.brain/sessions/`. No code yet.

## Then

Stop. Wait for "I approve" or a correction.
Next: `/tdd` those ids. Lost? `/help`
