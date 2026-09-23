---
name: help
description: Where you are in the loop and the one command to type next. Use when lost, stuck, asking what next, /help, or /next.
allowed-tools: Read, Grep, Glob, Bash
---

# help

Tells the developer **where they are** and **the one thing to type**. Nothing else.

**Invoke as** `/help` or `/next`. No arguments.

---

## 1. Read the project

From the **project root** (the folder that contains `.brain/`), run:

```
node .claude/itm-sdlc/scripts/next.js --project .
```

If Node says the file is missing: this project's vendored toolkit predates `next.js` — re-run `install.js`, then this command.

If `.claude/itm-sdlc/node_modules/` is missing:

```
cd .claude/itm-sdlc
npm ci --omit=dev --no-audit --no-fund
```

Then return to the project root and run `next.js` again.

**Show that output as written.** Do not paraphrase it into a lecture.

Then add one copy-paste line: the `Next` command from that output, in a fenced block.

The dashboard **Others** tab shows the same Where / Next.

## 2. If they asked for the map

Only if they asked how feedback, changes, or a new feature flow — print these four lines and stop. Do not explain them.

```
First build:  brief → /decompose → ANSWERS → /resolve-ambiguities → /feature-plan (approve) → /tdd → /close-slice → PR
Feedback:     their words → /feedback-capture → /find-variation → you fill decision+commercial → agent fills outcome → /tdd
Changes:      CHG decision filled → agent outcome + REQs → /resolve-ambiguities → /slice-add → /feature-plan → /tdd
New feature:  /find-variation (not /decompose) → same as Changes
Polish:       /note the words (and --file for a screenshot). Dashboard Others tab. Not a REQ.
Belt B:       /run-browsertest — Chromium. Or scripts/run-browsertest.cmd.
```

You never type REQ ids. `affects:` already has them.

## 3. Do not

- Open `/dashboard` unless they asked for the page.
- Start `/tdd`, `/decompose`, or `/feature-plan` from here.
- Invent a next step that contradicts the script.

---

## Then

The `Next` line is the next command. After they run it, `/help` again if they are lost.
