---
name: note
description: Save an informal working note and optional files (screenshots, emails) without a requirement or change record. Use for polish, a look tweak, or "just do this" after a slice is built. /note
allowed-tools: Read, Grep, Glob, Write, Bash
---

# note

Saves **the words they typed** and any files they attached. Not a REQ. Not a CHG.
Shows on the dashboard **Others** tab of **that app**.

`--project` is the **client app** that installed itm-sdlc (it has `.brain/` and
`.claude/itm-sdlc/`). MyGallery, book-library, or any other. **Never** the
itm-sdlc toolkit clone. Files land in `<app>/.brain/docs/ref/` and the Others
tab of `<app>`'s dashboard.

In a client app the Cursor capture hook does this without `/note`:

- **Words** — any prompt that is not a slash skill (`/tdd`, `/dashboard`,
  `/note`, …) is saved to `.brain/docs/commands.yaml`.
- **Files** — any attached image, PDF, or other file is copied to
  `.brain/docs/ref/`, including on slash skills. `/tdd` still skips the
  prompt-change log; the file is still kept.

`/note` is the manual path when the hook did not fire.

**Invoke as** `/note` plus the words. Attach files in the chat if there are any.

---

## Before running a vendored script

```bash
[ -f .claude/itm-sdlc/scripts/note.js ] || echo "vendored toolkit predates note.js - re-run install.js"
```

If it is missing, say that and stop. If `.claude/itm-sdlc/node_modules/` is missing:

```bash
cd .claude/itm-sdlc && npm ci --omit=dev --no-audit --no-fund
```

Then return to the project root.

---

## 1. Write the note

Copy any attached files into the project first if they are only in the chat.
Use the path Cursor shows for the attachment. Then:

```
node .claude/itm-sdlc/scripts/note.js --project . --text "THEIR WORDS HERE" --file PATH
```

`--file` once per file. If you have no path, copy the file into
`.brain/docs/inbox/` and run the same command without `--file` — inbox is
drained into `.brain/docs/ref/`.

**Do not skip the copy.** Quoting the image is not saving it. The script must
print `.brain/docs/ref/NNN-name.ext`. Then:

```
node .claude/itm-sdlc/scripts/dashboard.js --project . --open
```

The **Others** tab lists the note and a table of files in `.brain/docs/ref/`
(serial, filename, type, icon). Image thumbs load from `.claude/reports/ref/`
so they work when the dashboard is opened as a file.

## 2. Do not

- Do not open `/feedback-capture` from here unless they said it is client UAT
  that must be classified.
- Do not version a requirement.
- Do not start `/tdd`.

---

## Then

That is the record. Code the polish if it is not done yet. Lost? `/help`
