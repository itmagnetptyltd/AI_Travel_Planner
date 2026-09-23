#!/usr/bin/env node
"use strict";

/**
 * check-belt-gates.js — tell CI whether belts B or C are in force.
 *
 * Used by detect / G4 / G7. Does not classify files; it only reads
 * requirement `belts:` (default [A]) and whether adapters declared
 * an integration command.
 *
 * Usage:
 *   node scripts/check-belt-gates.js [--project <path>] [--json]
 *   node scripts/check-belt-gates.js --fail-if-b-unconfigured
 *   node scripts/check-belt-gates.js --fail-if-c-skipped --g7-status <file>
 *
 * Exit codes:
 *   0  ok (or B/C not required)
 *   1  --fail-if-b-unconfigured and some agreed+ REQ lists B, but no
 *      detected adapter has commands.integration
 *      OR --fail-if-c-skipped and belt C is in force but G7 skipped
 *   2  the tool could not run
 */

const fs = require("node:fs");
const path = require("node:path");

const {
  DEFAULT_PATTERNS,
  loadRequirementFiles,
  flatten,
} = require("./lib/requirements");
const { loadAdapters, detectAdapters } = require("./lib/adapters");
const { projectRequiresBelt, g7MustFail } = require("./lib/belts");

function parseArgs(argv) {
  const options = {
    project: process.cwd(),
    json: false,
    failIfBUnconfigured: false,
    failIfCSkipped: false,
    g7Status: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--fail-if-b-unconfigured":
        options.failIfBUnconfigured = true;
        break;
      case "--fail-if-c-skipped":
        options.failIfCSkipped = true;
        break;
      case "--g7-status":
        i += 1;
        if (argv[i] === undefined)
          throw new Error("--g7-status requires a path");
        options.g7Status = path.resolve(argv[i]);
        break;
      case "--project":
        i += 1;
        if (argv[i] === undefined) throw new Error("--project requires a path");
        options.project = path.resolve(argv[i]);
        break;
      default:
        throw new Error(`unknown option: ${arg}`);
    }
  }
  return options;
}

function inspect(project) {
  const { documents } = loadRequirementFiles(DEFAULT_PATTERNS, project);
  const requirements = flatten(documents).map(({ requirement }) => requirement);
  const adapters = detectAdapters(project, loadAdapters());
  const idsB = projectRequiresBelt(requirements, "B");
  const idsC = projectRequiresBelt(requirements, "C");
  const integrationDeclared = adapters.some((adapter) =>
    Boolean(adapter.commands?.integration),
  );
  return {
    requiresB: idsB.length > 0,
    requiresC: idsC.length > 0,
    idsB,
    idsC,
    integrationDeclared,
    adapters: adapters.map((a) => a.id),
  };
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(
      `Usage: node check-belt-gates.js [--project <path>] [--json] [--fail-if-b-unconfigured] [--fail-if-c-skipped --g7-status <file>]\n`,
    );
    return 0;
  }
  if (!fs.existsSync(options.project)) {
    process.stderr.write(`project not found: ${options.project}\n`);
    return 2;
  }

  const result = inspect(options.project);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(
      `belts  B=${result.requiresB ? result.idsB.join(",") || "yes" : "off"}  C=${result.requiresC ? result.idsC.join(",") || "yes" : "off"}  integration=${result.integrationDeclared ? "declared" : "missing"}\n`,
    );
  }

  if (
    options.failIfBUnconfigured &&
    result.requiresB &&
    !result.integrationDeclared
  ) {
    process.stderr.write(
      `G4 required: ${result.idsB.join(", ")} list belt B, but no detected adapter declared commands.integration. Empty skip is not force.\n`,
    );
    return 1;
  }

  if (options.failIfCSkipped) {
    if (!options.g7Status) {
      process.stderr.write("--fail-if-c-skipped requires --g7-status <file>\n");
      return 2;
    }
    if (!fs.existsSync(options.g7Status)) {
      process.stderr.write(`G7 status file not found: ${options.g7Status}\n`);
      return result.requiresC ? 1 : 2;
    }
    let state = "no-output";
    try {
      const payload = JSON.parse(fs.readFileSync(options.g7Status, "utf8"));
      state = payload.status ?? "no-output";
    } catch {
      state = "no-output";
    }
    if (g7MustFail(result.requiresC, state)) {
      process.stderr.write(
        `G7 required: ${result.idsC.join(", ")} list belt C, but G7 status is '${state}'. not-configured is not a pass.\n`,
      );
      return 1;
    }
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { inspect, parseArgs, main };
