---
name: run-browsertest
description: Run belt B browser tests in Chromium. Use when asked to run browser tests, e2e, Playwright, /run-browsertest, or to watch the UI tests click.
allowed-tools: Read, Grep, Glob, Bash
---

# run-browsertest

Opens Chromium and runs the project's belt B tests (`e2e/`). Starts its own
app server. Does **not** use a site you already have open.

`--project` is the **client app** (has `.brain/` + `.claude/itm-sdlc/`).

---

## Before running a vendored script

```bash
[ -f .claude/itm-sdlc/scripts/run-browsertest.js ] || echo "vendored toolkit predates run-browsertest.js - re-run install.js"
```

If it is missing, say that and stop.

---

## 1. Run

From the project root, with the browser **visible**:

```
node .claude/itm-sdlc/scripts/run-browsertest.js --project . --headed
```

Headless (CI-style):

```
node .claude/itm-sdlc/scripts/run-browsertest.js --project . --headless
```

On Windows, double-click `scripts/run-browsertest.cmd` — same thing, headed.

Show the command output as written. Do not paraphrase a failure into a lecture.

## 2. Do not

- Point the tests at a URL the developer already opened.
- Start `/tdd` or `/dashboard` from here.
- Edit `.brain/`.

---

## Then

Green: belt B passed. Red: `/fix` the failing e2e, do not skip it. Lost? `/help`
