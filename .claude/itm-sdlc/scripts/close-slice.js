#!/usr/bin/env node
"use strict";

/**
 * close-slice.js — the way out of a slice, and the lock on the next one.
 *
 * /tdd used to move agreed → in_progress and then stop. The dashboard stayed
 * "In progress" forever because nothing recorded verified unless someone
 * remembered `/verifyReq --record`. This script is that missing step:
 *
 *   - records in_progress → verified for every named id that has a current
 *     @covers test (advance-status.js is the law; this only chooses the ids)
 *   - reports what is still not verified, and that the slice is not Done
 *   - `--gate` refuses to start a later slice while an earlier one is open
 *
 * Usage:
 *   node close-slice.js --project . REQ-ONIT-005 REQ-ONIT-006
 *   node close-slice.js --project . --slice 2
 *   node close-slice.js --project . --gate --slice 3
 *   node close-slice.js --project . --gate REQ-ONIT-031
 *   node close-slice.js --project . --dry-run
 *
 * Exit codes:
 *   0  named ids are verified (or --gate passed)
 *   1  a named id could not be verified, or a predecessor slice is not Done
 *   2  bad usage
 */

const fs = require("node:fs");
const path = require("node:path");

const { advance, coveringTests } = require("./advance-status");
const {
  DEFAULT_PATTERNS,
  loadRequirementFiles,
  flatten,
} = require("./lib/requirements");
const { readSlices } = require("./lib/slices");
const { detectAdapters } = require("./lib/adapters");
const { beltEvidence } = require("./lib/belts");

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

const USAGE = `
Usage: node close-slice.js [--project <path>] [--slice N] [REQ-ID ...]

  Records in_progress → verified for every named requirement that a test
  annotates at the current version. Reports what is still open.

  --slice N     close that slice's covers (from .brain/slices.yaml)
  REQ-ID ...    close these ids. Default, with neither: every in_progress id
  --gate        do not write. Refuse if a previous slice is not Done
  --force       with --gate: warn and allow the next slice anyway
  --dry-run     report what would be recorded, write nothing
  --json        machine-readable output
  --project     project root (default: current directory)

  signed_off is never written. A slice is Done only when every id it covers
  is verified or signed_off.
`;

function parseArgs(argv) {
  const options = {
    ids: [],
    slice: null,
    project: process.cwd(),
    dryRun: false,
    gate: false,
    force: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--gate":
        options.gate = true;
        break;
      case "--force":
        options.force = true;
        break;
      case "--slice":
        i += 1;
        if (argv[i] === undefined) throw new Error("--slice requires a number");
        options.slice = argv[i];
        break;
      case "--project":
        i += 1;
        if (argv[i] === undefined) throw new Error("--project requires a path");
        options.project = path.resolve(argv[i]);
        break;
      default:
        if (arg.startsWith("-")) throw new Error(`unknown option: ${arg}`);
        options.ids.push(arg);
    }
  }

  return options;
}

function loadRequirements(project) {
  const { documents } = loadRequirementFiles(DEFAULT_PATTERNS, project);
  return flatten(documents).map(({ requirement }) => requirement);
}

function sliceForIds(computed, ids) {
  const hits = computed.slices.filter((slice) =>
    ids.some((id) => slice.covers.includes(id)),
  );
  return hits;
}

function predecessorOpen(computed, targetSlice) {
  if (!targetSlice || !computed.present || computed.slices.length === 0) {
    return null;
  }
  const index = computed.slices.findIndex(
    (s) => String(s.id) === String(targetSlice.id),
  );
  if (index <= 0) return null;
  return computed.slices.slice(0, index).find((s) => s.state !== "done");
}

function gateStart(computed, targetSlice, { force }) {
  const open = predecessorOpen(computed, targetSlice);
  if (!open) {
    return {
      ok: true,
      blockedBy: null,
      warning: null,
    };
  }
  const summary = `${open.label} (${open.doneCount}/${open.total})`;
  if (force) {
    return {
      ok: true,
      blockedBy: open,
      warning: `previous slice ${open.id} ${open.name} is still ${summary} — continuing because --force was passed`,
    };
  }
  return {
    ok: false,
    blockedBy: open,
    reason: `Slice ${targetSlice.id} ${targetSlice.name} cannot start. Slice ${open.id} ${open.name} is ${summary}. Finish it with /tdd on the remaining ids, then /close-slice, before starting the next slice.`,
  };
}

function remainingFor(requirement, advanceRefused) {
  if (!requirement) return { reason: "not in the requirement record" };
  if (requirement.status === "draft") {
    return { reason: "still draft — agree it before /tdd" };
  }
  if (requirement.status === "agreed") {
    return { reason: "still agreed — /tdd has not started it" };
  }
  if (requirement.status === "in_progress") {
    const refused = advanceRefused.get(requirement.id);
    return {
      reason:
        refused || "still in_progress — missing @covers at the current version",
    };
  }
  return null;
}

function evidenceFor(requirement, project, adapters) {
  if (!requirement) return [];
  const covering = coveringTests(project, requirement.id, requirement.version);
  return beltEvidence(requirement, covering.files, project, adapters);
}

function printBeltRows(lines, rows) {
  if (!rows || rows.length === 0) return;
  for (const row of rows) {
    const files = row.ok ? row.files.join(", ") : "(no @covers)";
    const mark = row.ok ? "ok" : "MISSING";
    lines.push(`          ${row.belt}  ${files.padEnd(32)} ${mark}`);
  }
}

function closeSlice(options) {
  const project = options.project;
  if (!fs.existsSync(project)) {
    throw new Error(`project not found: ${project}`);
  }

  const requirements = loadRequirements(project);
  const computed = readSlices(project, requirements);
  const byId = new Map(requirements.map((r) => [r.id, r]));

  let targetSlice = null;
  let scopeIds = options.ids.slice();

  if (options.slice !== null) {
    targetSlice = computed.slices.find(
      (s) => String(s.id) === String(options.slice),
    );
    if (!targetSlice) {
      throw new Error(`no slice ${options.slice} in .brain/slices.yaml`);
    }
    if (scopeIds.length === 0) scopeIds = targetSlice.covers.slice();
  } else if (scopeIds.length > 0) {
    const hits = sliceForIds(computed, scopeIds);
    if (hits.length > 1) {
      return {
        ok: false,
        gate: options.gate,
        dryRun: options.dryRun,
        reason: `ids span more than one slice (${hits.map((s) => s.id).join(", ")}). Close or build one slice at a time.`,
        moved: [],
        refused: [],
        remaining: [],
        slice: null,
      };
    }
    targetSlice = hits[0] || null;
    if (
      computed.present &&
      computed.slices.length > 0 &&
      !targetSlice &&
      !options.gate
    ) {
      return {
        ok: false,
        gate: false,
        dryRun: options.dryRun,
        reason: `${scopeIds.join(", ")} ${scopeIds.length === 1 ? "is" : "are"} not in any slice. /slice-add first.`,
        moved: [],
        refused: [],
        remaining: [],
        slice: null,
      };
    }
  } else {
    scopeIds = requirements
      .filter((r) => r.status === "in_progress")
      .map((r) => r.id);
  }

  if (options.gate) {
    if (!targetSlice && computed.slices.length > 0) {
      return {
        ok: false,
        gate: true,
        dryRun: true,
        reason:
          "name a slice (--slice N) or ids that belong to one slice. There is a task sequence; do not start unplanned work.",
        moved: [],
        refused: [],
        remaining: [],
        slice: null,
      };
    }
    const gated = gateStart(computed, targetSlice, { force: options.force });
    return {
      ok: gated.ok,
      gate: true,
      dryRun: true,
      reason: gated.reason || null,
      warning: gated.warning || null,
      blockedBy: gated.blockedBy
        ? {
            id: gated.blockedBy.id,
            name: gated.blockedBy.name,
            state: gated.blockedBy.state,
            doneCount: gated.blockedBy.doneCount,
            total: gated.blockedBy.total,
          }
        : null,
      moved: [],
      refused: [],
      remaining: [],
      slice: targetSlice
        ? {
            id: targetSlice.id,
            name: targetSlice.name,
            state: targetSlice.state,
            label: targetSlice.label,
            doneCount: targetSlice.doneCount,
            total: targetSlice.total,
            next: targetSlice.next,
          }
        : null,
    };
  }

  const inProgress = scopeIds.filter(
    (id) => byId.get(id)?.status === "in_progress",
  );

  let advanced = {
    moved: [],
    refused: [],
    unchanged: [],
    ok: true,
    dryRun: options.dryRun,
  };

  if (inProgress.length > 0) {
    advanced = advance({
      ids: inProgress,
      to: "verified",
      project,
      dryRun: options.dryRun,
      patterns: DEFAULT_PATTERNS,
    });
  }

  const after = options.dryRun ? requirements : loadRequirements(project);
  const afterById = new Map(after.map((r) => [r.id, r]));
  const afterSlices = readSlices(project, after);
  const refusedById = new Map(
    advanced.refused.map((item) => [item.id, item.reason]),
  );
  const movedIds = new Set(advanced.moved.map((item) => item.id));

  const adapters = detectAdapters(project);
  const remaining = [];
  for (const id of scopeIds) {
    if (movedIds.has(id)) continue;
    const req = afterById.get(id);
    const note = remainingFor(req, refusedById);
    if (note) {
      remaining.push({
        id,
        ...note,
        belts: req ? evidenceFor(req, project, adapters) : [],
      });
    }
  }

  const moved = advanced.moved.map((item) => {
    const req = afterById.get(item.id) ?? byId.get(item.id);
    return {
      ...item,
      belts: req ? evidenceFor(req, project, adapters) : [],
    };
  });

  const sliceAfter = targetSlice
    ? afterSlices.slices.find((s) => String(s.id) === String(targetSlice.id))
    : null;

  return {
    ok: remaining.length === 0 && advanced.ok,
    gate: false,
    dryRun: Boolean(options.dryRun),
    reason: null,
    moved,
    refused: advanced.refused,
    remaining,
    slice: sliceAfter
      ? {
          id: sliceAfter.id,
          name: sliceAfter.name,
          state: sliceAfter.state,
          label: sliceAfter.label,
          doneCount: sliceAfter.doneCount,
          total: sliceAfter.total,
          next: sliceAfter.next,
        }
      : null,
  };
}

function report(result) {
  const lines = [""];
  const tag = result.dryRun ? "  (DRY RUN - nothing was written)" : "";
  lines.push(`itm-sdlc | close-slice${tag}`);
  lines.push("");

  if (result.reason) {
    lines.push(`  FAIL  ${result.reason}`);
    lines.push("");
  }
  if (result.warning) {
    lines.push(`  WARN  ${result.warning}`);
    lines.push("");
  }

  for (const item of result.moved) {
    lines.push(`  ok    ${item.id}  ${item.from} -> ${item.to}`);
    printBeltRows(lines, item.belts);
    if (!item.belts || item.belts.length === 0) {
      for (const file of item.verifiedBy || []) {
        lines.push(`          verified_by  ${file}`);
      }
    }
  }
  for (const item of result.remaining) {
    lines.push(`  OPEN  ${item.id}  ${item.reason}`);
    printBeltRows(lines, item.belts);
  }

  if (result.slice) {
    lines.push("");
    lines.push(
      `  slice ${result.slice.id}  ${result.slice.name}  ${result.slice.label} (${result.slice.doneCount}/${result.slice.total})`,
    );
    if (result.slice.next) lines.push(`  next  ${result.slice.next}`);
    if (result.gate && result.ok) {
      lines.push("  previous slices are Done. This slice may start.");
    } else if (result.slice.state !== "done" && !result.gate) {
      lines.push(
        "  this slice is not Done. Do not start the next slice until it is.",
      );
    }
  }

  if (
    result.moved.length === 0 &&
    result.remaining.length === 0 &&
    !result.reason &&
    !result.gate
  ) {
    lines.push("  nothing in_progress to close");
  }

  lines.push("");
  process.stdout.write(lines.join("\n"));
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`close-slice: ${err.message}\n${USAGE}`);
    return EXIT_USAGE;
  }

  if (options.help) {
    process.stdout.write(USAGE);
    return EXIT_OK;
  }

  let result;
  try {
    result = closeSlice(options);
  } catch (err) {
    process.stderr.write(`close-slice: ${err.message}\n`);
    return EXIT_USAGE;
  }

  if (options.json)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else report(result);

  return result.ok ? EXIT_OK : EXIT_REFUSED;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  closeSlice,
  parseArgs,
  main,
  predecessorOpen,
  gateStart,
};
