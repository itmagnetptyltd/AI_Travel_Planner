#!/usr/bin/env node
'use strict';

/**
 * add-slice.js — append a slice to the task sequence, gated.
 *
 * `.brain/slices.yaml` says which requirements are built together and in what
 * order. Until now it was hand-edited, which is the same failure advance-status.js
 * was written to remove: an ungated edit that reformats whatever the editor felt
 * like reformatting, and that nothing checks until someone reads the dashboard
 * and finds an id that is in two slices, or in none, or scheduled before the
 * thing it depends on.
 *
 * A variation makes this constant rather than occasional. /decompose allocates
 * REQ ids for the new scope; without this, those ids sit outside the plan and
 * the dashboard reports them as unplanned forever.
 *
 * The grouping itself is still a judgement — which increments can be shown
 * working, and in what order. This does not decide that. It applies the checks
 * that judgement has to survive, and writes the file so the shape stays constant.
 *
 * Usage:
 *   node add-slice.js --name "Visual design" --covers REQ-PHOTO-016,REQ-PHOTO-017 \
 *                     --branch feat/photo-visual-design --why "Type scale, app bar, focus rings"
 *   node add-slice.js --list
 *   node add-slice.js --unplanned
 *
 * Options:
 *   --name <text>          slice name (required to add)
 *   --covers <ids>         comma-separated REQ ids (required to add)
 *   --branch <name>        the branch this slice is built on
 *   --why <text>           one sentence: what this slice can demonstrate
 *   --list                 print the current sequence and exit
 *   --unplanned            print requirements in no slice and exit
 *   --project <path>       project root (default: cwd)
 *   --dry-run              report what would change and write nothing
 *   --json                 machine-readable output
 *   -h, --help             this message
 *
 * Exit codes:
 *   0  the slice was added (or the query succeeded)
 *   1  refused — a check failed
 *   2  bad usage
 */

const fs = require('node:fs');
const path = require('node:path');

const { DEFAULT_PATTERNS, loadRequirementFiles, flatten } = require('./lib/requirements');
const { DEFAULT_SLICE_FILE, loadSlices, computeSlices } = require('./lib/slices');

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

const USAGE = `
Usage: node add-slice.js --name <text> --covers <REQ-A,REQ-B> [--branch <b>] [--why <text>]
       node add-slice.js --list
       node add-slice.js --unplanned

  Appends a slice to .brain/slices.yaml. Refuses when:

    - an id is not in the requirement record
    - an id is already covered by another slice
    - the slice covers nothing
    - a covered requirement depends on one scheduled in a LATER slice

  The last check is the one worth having. A plan exists to give an order, so a
  plan that contradicts its own dependency graph is worse than no plan.

Options:
  --name <text>       slice name
  --covers <ids>      comma-separated requirement ids
  --branch <name>     branch this slice is built on
  --why <text>        what this slice can demonstrate once it is done
  --list              print the current sequence
  --unplanned         print requirements that are in no slice
  --project <path>    project root (default: current directory)
  --dry-run           report and write nothing
  --json              machine-readable output
  -h, --help          this message
`;

function parseArgs(argv) {
  const options = {
    name: null,
    covers: null,
    branch: null,
    why: null,
    list: false,
    unplanned: false,
    project: process.cwd(),
    dryRun: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} needs a value`);
      }
      i += 1;
      return value;
    };

    switch (arg) {
      case '--name': options.name = next(); break;
      case '--covers': options.covers = next(); break;
      case '--branch': options.branch = next(); break;
      case '--why': options.why = next(); break;
      case '--list': options.list = true; break;
      case '--unplanned': options.unplanned = true; break;
      case '--project': options.project = next(); break;
      case '--dry-run': options.dryRun = true; break;
      case '--json': options.json = true; break;
      case '-h':
      case '--help': options.help = true; break;
      default:
        throw new Error(`unknown option ${arg}`);
    }
  }

  return options;
}

/** Requirement ids, in record order, with their statuses and dependencies. */
function readRecord(projectRoot) {
  const { documents } = loadRequirementFiles(DEFAULT_PATTERNS, projectRoot);
  return flatten(documents).map(({ requirement }) => requirement);
}

/**
 * Every check the slice has to survive, as a list of refusals.
 *
 * Reported together rather than one at a time: a person fixing a slice
 * definition wants to know everything wrong with it, not to rerun four times.
 */
function check(slice, existing, requirements) {
  const refusals = [];
  const byId = new Map(requirements.map((r) => [r.id, r]));

  if (slice.covers.length === 0) {
    refusals.push('--covers names no requirements. A slice that covers nothing cannot be built.');
  }

  const claimed = new Map();
  existing.forEach((s, index) => {
    for (const id of s.covers) claimed.set(id, { name: s.name, position: index + 1 });
  });

  for (const id of slice.covers) {
    if (!byId.has(id)) {
      refusals.push(`${id} is not in the requirement record.`);
      continue;
    }
    const owner = claimed.get(id);
    if (owner) {
      refusals.push(`${id} is already covered by slice ${owner.position}, "${owner.name}".`);
    }
  }

  const seen = new Set();
  for (const id of slice.covers) {
    if (seen.has(id)) refusals.push(`${id} is named twice in --covers.`);
    seen.add(id);
  }

  // Where each id sits once this slice is appended.
  const position = new Map();
  existing.forEach((s, index) => s.covers.forEach((id) => position.set(id, index + 1)));
  const appended = existing.length + 1;
  slice.covers.forEach((id) => position.set(id, appended));

  for (const id of slice.covers) {
    const requirement = byId.get(id);
    if (!requirement) continue;
    for (const dep of requirement.depends_on || []) {
      const depAt = position.get(dep);
      if (depAt === undefined) {
        refusals.push(
          `${id} depends on ${dep}, which is in no slice. Plan ${dep} first, or add it to this one.`,
        );
      } else if (depAt > appended) {
        refusals.push(`${id} depends on ${dep}, which is planned later in slice ${depAt}.`);
      }
    }
  }

  return refusals;
}

/** YAML for one slice, in the shape the file already uses. */
function render(slice, id) {
  const lines = [`- id: ${id}`, `  name: ${slice.name}`];
  if (slice.branch) lines.push(`  branch: ${slice.branch}`);
  if (slice.why) lines.push(`  why: ${JSON.stringify(slice.why)}`);
  lines.push(`  covers: [${slice.covers.join(', ')}]`);
  return lines.join('\n');
}

function append(projectRoot, file, text) {
  const full = path.join(projectRoot, file);
  const existing = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  const separator = existing.length === 0 || existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  fs.writeFileSync(full, `${existing}${separator}${text}\n`);
}

function printSequence(computed, requirements) {
  const statusOf = new Map(requirements.map((r) => [r.id, r.status]));
  const out = [`\n  itm-sdlc | task sequence\n`];
  if (computed.slices.length === 0) {
    out.push('  no slices yet\n');
    return out.join('\n');
  }
  for (const slice of computed.slices) {
    out.push(`  ${String(slice.id).padStart(2)}  ${slice.label.padEnd(12)} ${slice.name}`);
    out.push(`      ${slice.covers.map((id) => `${id} (${statusOf.get(id) ?? 'missing'})`).join(', ')}`);
  }
  out.push('');
  return out.join('\n');
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n${USAGE}`);
    return EXIT_USAGE;
  }

  if (options.help) {
    process.stdout.write(USAGE);
    return EXIT_OK;
  }

  const projectRoot = path.resolve(options.project);
  let requirements;
  try {
    requirements = readRecord(projectRoot);
  } catch (error) {
    process.stderr.write(`cannot read the requirement record: ${error.message}\n`);
    return EXIT_USAGE;
  }

  const loaded = loadSlices(projectRoot);
  const computed = computeSlices(requirements, loaded);

  if (options.list) {
    process.stdout.write(
      options.json ? `${JSON.stringify(computed, null, 2)}\n` : printSequence(computed, requirements),
    );
    return EXIT_OK;
  }

  if (options.unplanned) {
    const statusOf = new Map(requirements.map((r) => [r.id, r.status]));
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ unplanned: computed.unplanned }, null, 2)}\n`);
    } else if (computed.unplanned.length === 0) {
      process.stdout.write('\n  every requirement is in a slice\n\n');
    } else {
      process.stdout.write(
        `\n  ${computed.unplanned.length} requirement(s) in no slice\n\n` +
          computed.unplanned.map((id) => `      ${id}  ${statusOf.get(id)}`).join('\n') +
          '\n\n',
      );
    }
    return EXIT_OK;
  }

  if (!options.name || !options.covers) {
    process.stderr.write(`--name and --covers are both required to add a slice\n${USAGE}`);
    return EXIT_USAGE;
  }

  const slice = {
    name: options.name,
    branch: options.branch,
    why: options.why,
    covers: options.covers.split(',').map((s) => s.trim()).filter(Boolean),
  };

  if (loaded.problems.length) {
    process.stderr.write(
      `\n  ${DEFAULT_SLICE_FILE} has problems that must be fixed before adding to it:\n\n` +
        loaded.problems.map((p) => `      ${p}`).join('\n') +
        '\n\n',
    );
    return EXIT_REFUSED;
  }

  const refusals = check(slice, loaded.slices, requirements);
  if (refusals.length) {
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ ok: false, refusals }, null, 2)}\n`);
    } else {
      process.stderr.write(
        `\n  REFUSED — "${slice.name}" was not added\n\n` +
          refusals.map((r) => `      ${r}`).join('\n') +
          '\n\n',
      );
    }
    return EXIT_REFUSED;
  }

  const id = loaded.slices.length + 1;
  const text = render(slice, id);

  if (options.dryRun) {
    process.stdout.write(`\n  DRY RUN — would append to ${DEFAULT_SLICE_FILE}:\n\n${text}\n\n`);
    return EXIT_OK;
  }

  append(projectRoot, loaded.file, text);

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, id, slice }, null, 2)}\n`);
  } else {
    process.stdout.write(
      `\n  ok    slice ${id}  ${slice.name}\n          ${slice.covers.join(', ')}\n\n` +
        `  Run /dashboard to see it.\n\n`,
    );
  }
  return EXIT_OK;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main, check, render, parseArgs };
