---
name: decompose
description: Turn a client brief into atomic requirements plus an ambiguity register. Use at discovery, and again on every scope variation.
allowed-tools: Read, Grep, Glob, Write, Task, Bash
---

# decompose

Turns whatever the client gave you into structured requirements and an honest
list of everything they did not actually say.

**Paste the brief when you invoke this.** Attach the PDF or screenshot in the
same message. If you did not, ask for it and stop.

---

## 1. Record the brief unedited

Write the client's words, verbatim, to `.brain/requirements/BRIEF.md`:

```markdown
# Source brief

Received: <date>, from <who>, via <call | email | message>

> <their exact words>

<Anything else that was said, or "Nothing else was said.">
```

**Do not tidy it up.** The vagueness is evidence. When someone later asks "was
pagination ever mentioned?", this file is the answer.

If a brief already exists, append the new one under a dated heading rather than
replacing it.

**Keep the source file.** Chat attachments are copied into **that app's**
`.brain/docs/ref/` when the prompt hook gets a path. Still run this so a missed
hook is not silent. `--project` is the client app, never the itm-sdlc toolkit:

```
node .claude/itm-sdlc/scripts/keep-ref.js --project . --file PATH
```

PATH is the attachment path from the user message. If you have no path, put the
file in `.brain/docs/inbox/` and run keep-ref without `--file`. The script
prints `.brain/docs/ref/NNN-name.ext`. Put those paths in `BRIEF.md`. Then
`/dashboard` so the Others tab Files table shows them.

Do not skip the copy because you already quoted the words. The file is the
evidence; `BRIEF.md` is the transcript.

## 2. Check the glossary

Read `.brain/glossary.md`.

If it is still the shipped template, or it does not define the terms this brief
uses, fill in what the **running code** already settles. List under **"Appears
in source documents, not yet defined"** only terms that are **not** on disk
and **not** in the brief. Do not invent definitions. Do not ask the client
what a live field, table, or rate formula means.

## 3. Decompose

Invoke `spec-agent` with the brief. It writes:

- `.brain/requirements/<module>.yaml` — every requirement at `status: draft`,
  `version: 1`, ids allocated sequentially from the highest already used
- `.brain/requirements/AMBIGUITIES.md` — one section per open question

The module code comes from `.brain/install-state.json`. Never invent one.

When spec-agent writes each requirement, it must set **`belts:`** (A unit,
B browser, C HTTP/API) from the brief. Default `[A]`. See
[PLAN-UI-E2E.md](../../docs/PLAN-UI-E2E.md) §5 and §7.3.

## 4. Existing project — do not ask what the code already does

If this repo is **already running** (or the brief says "as today", "like
production", "read the code"), including a **new API / page / controller on
that system**:

**Most of the logic is already in the old handlers.** Take it. A new
endpoint that reuses existing commands does not make the database, the rate
formula, or the user count into questions.

**Tell spec-agent to read the source tree before it writes a question.**
Database, connection, stored procedures, rate/price/share formulas, user
roles, messages, labels, and host wiring are taken from the live files. They
are not questions.

A question that only restates production ("which database?", "how is the rate
calculated?", "how many people use this?") is a defect in the decomposition.
Delete it. Put the fact on the requirement.

Then, for anything that still slipped into `AMBIGUITIES.md`:

1. Answer it from the handlers in `ANSWERS.md` labelled **From the code**,
   cited to file and line.
2. Run `/resolve-ambiguities` in the same session.
3. Leave open **only** new behaviour that is not in the brief and not on disk.

Do not send the client a register about a system they already operate.

If this is a **greenfield** brief (no running code for the ask), skip this step.

## 5. Create the answer sheet

Write `.brain/requirements/ANSWERS.md` with a heading per question and space
beneath each. If step 4 already filled answers, keep those; only leave blanks
for what the code could not settle.

```markdown
# Answers

Paste the client's reply here, under the question it answers. Their words, not
a summary. Then run `/resolve-ambiguities`.

## Is a Book a title, or a physical copy?

<their answer>
```

This is the file the client's reply lands in, and it is what `/resolve-ambiguities` reads to
write the acceptance criteria and clear the questions. Keeping it means the
wording behind every criterion stays in the repository.

## 6. Report, honestly

State: how many requirements, how many ambiguities, and which requirement's
`source` you were least confident about.

**If fewer than five ambiguities came back, and the brief is greenfield,**
the decomposition was too shallow. A twelve-word brief hides more than four
questions. Say so and run it again rather than presenting it as finished.

**If the brief names a running repository as source of truth,** do not pad
the register to five. Ask only what the code cannot settle. See the rule
below.

---

## Rules

- **On an existing project, close from the running code automatically.** That is
  not a guess. Cite the file. Then `/resolve-ambiguities`.
- **On a greenfield brief, nothing reaches `agreed`** until the client answers.
  Do not invent behaviour that is not on disk.
- **Never resolve by convention or by the easier build.** Production behaviour
  is allowed. "What people usually do" is not.
- **Write only inside `.brain/requirements/`**, except attached source files
  which go in `.brain/docs/ref/` via `keep-ref.js`.
- **Work on a branch**, never on `main`. `.brain/` changes reach `main` through a
  reviewed pull request.

## Existing production code is an answer, not a question

When the brief names a **running repository** as the source of truth (legacy
install, "as it works today", "do not invent — read the code"), observed
production behaviour is already an answer. Write it into `BRIEF.md` ground
truth and into `ANSWERS.md` as **From the code**, cited to file and line.

**Ask only what the running code cannot settle:**

- a commercial or sign-off choice the code never made
- a new capability that does not exist in production
- two live paths that do different things *and* the brief does not say which
  form or route to follow

Do **not** open a question whose only content is "the code does X; should we
do X?". That is the brief. Reproduce X.

The "fewer than five ambiguities means too shallow" rule still applies to a
**greenfield** brief. It does not apply when the brief points at a live
codebase and most of the behaviour is already on disk. A brownfield
decomposition that asks forty questions about behaviour the handlers already
encode is too deep, not too honest.

## Then what

If step 4 closed everything the code can settle, what remains in
`AMBIGUITIES.md` is the only list to send to the client.

When a reply comes back, paste it into `ANSWERS.md` and run
`/resolve-ambiguities` again.

Building starts when the requirements for the next slice are `agreed`.
`/resolve-ambiguities` writes the first task sequence when it agrees them —
you should not need a separate command just to see `/dashboard` Task Sequence
fill in.

## Then

Send the open questions. Next: answers in `ANSWERS.md`, then `/resolve-ambiguities`.
Lost? `/help`
