---
name: legacy-discover
description: First install on an existing production repo. Inventory the tree and write draft brain files only. Use after install.js when the project already has code and no REQ- ids yet. Never agrees anything. Never moves folders into src/.
allowed-tools: Read, Grep, Glob, Write, Bash
---

# legacy-discover

For a **live / year-old** repo the first time itm-sdlc is installed. It walks
the tree (solutions, `.csproj`, `package.json`, docker-compose **service
names**, README titles) and writes a **recovered draft brain**. It does
**not** agree anything and does **not** invent one requirement per API.
The client still has to answer before anything is `agreed`.

**Never** move `CRM/`, `Web/`, or anything else into `src/`.

---

## Before running a vendored script

```bash
[ -f .claude/itm-sdlc/scripts/legacy-discover.js ] || echo "vendored toolkit predates legacy-discover.js - re-run install.js"
```

If `.claude/itm-sdlc/node_modules/` is missing:

```bash
cd .claude/itm-sdlc && npm ci --omit=dev --no-audit --no-fund
```

Then return to the project root.

---

## 1. Record branch

```bash
git checkout -b brain/legacy-discover
```

Do not run `--write` on `main`.

## 2. Inventory, then write drafts

```bash
node .claude/itm-sdlc/scripts/legacy-discover.js --project . --json
node .claude/itm-sdlc/scripts/legacy-discover.js --project . --write
```

`--write` is refused if the brain already has requirements that did **not**
come from a previous `/legacy-discover` draft. Empty stubs from an earlier
run are overwritten with the recovered map.

## 3. What it wrote

- `.brain/picture.md` — what the system is, architecture from README, BRD if found
- `.brain/docs/ref/legacy-*` — copies of README, Documentation/articles, BRD/SRS, top-level docs/
- `.brain/inventory.yaml` — every solution, project, package, compose service, unscoped folder
- `.brain/constraints/observed-layout.md` — the same map as a constraint
- `glossary.md` — folder/project names from disk (not agreed terms)
- `BRIEF.md` — README title and observed layout
- One **draft** `REQ-<MODULE>-001` per install module, listing the files found there
- `AMBIGUITIES.md` — what must still be true, plus folders that are not in `--modules`
- `.brain/sessions/<date>-legacy-discover.md`

Show the command output as written (project counts, unscoped folders). Do not
summarise an empty stub as “done”.

**Status stays `draft`.** Do not run `/resolve-ambiguities` until the client
has pasted answers. Do not `/tdd` these IDs until they are `agreed`.

## 4. PR

This is a **record** PR. `/pr-prepare` as chore or with no behaviour Covers.
Human reviews. Merge. Then the next **real** change uses `/decompose` on that
ask only — do not invent the rest of production.

---

## Rules

- **Inferred is not agreed.** An agent must not close the open question.
- **Do not emit one requirement per controller or endpoint.** That is a guess
  factory. One draft hook per declared module is the cap.
- **Do not restructure the repo.**
