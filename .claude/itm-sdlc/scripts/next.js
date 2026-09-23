#!/usr/bin/env node
"use strict";

/**
 * Where this project is in the loop, and the one command to type next.
 *
 * Usage:
 *   node scripts/next.js [--project <path>]
 */

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");
const {
  DEFAULT_PATTERNS,
  loadRequirementFiles,
  flatten,
} = require("./lib/requirements");
const { readSlices } = require("./lib/slices");

const EXIT_OK = 0;
const EXIT_TOOL_ERROR = 2;

function readChangeDocs(projectRoot) {
  const dir = path.join(projectRoot, ".brain", "changes");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /^CHG-\d+/i.test(name) && /\.ya?ml$/i.test(name))
    .sort()
    .flatMap((name) => {
      try {
        const doc = yaml.load(fs.readFileSync(path.join(dir, name), "utf8"), {
          schema: yaml.CORE_SCHEMA,
        });
        if (!doc || typeof doc !== "object") return [];
        return [
          {
            id: String(doc.id || name.replace(/\.[^.]+$/, "")).toUpperCase(),
            decision: String(doc.decision || "").trim(),
            outcome: String(doc.outcome || "").trim(),
          },
        ];
      } catch {
        return [];
      }
    });
}

function undecidedChanges(projectRoot) {
  return readChangeDocs(projectRoot)
    .filter((row) => !row.decision)
    .map((row) => row.id);
}

function pendingOutcome(projectRoot) {
  return readChangeDocs(projectRoot)
    .filter((row) => row.decision && !row.outcome)
    .map((row) => row.id);
}

function draftIds(requirements) {
  return requirements.filter((r) => r.status === "draft").map((r) => r.id);
}

function openQuestionIds(requirements) {
  return requirements
    .filter((r) => Array.isArray(r.ambiguities) && r.ambiguities.length > 0)
    .map((r) => r.id);
}

function firstOpenSlice(slices) {
  return slices.find((s) => s.state !== "done") || null;
}

function report(projectRoot) {
  const { documents } = loadRequirementFiles(DEFAULT_PATTERNS, projectRoot);
  const requirements = flatten(documents).map(({ requirement }) => requirement);
  const slices = readSlices(projectRoot, requirements);
  const chgs = undecidedChanges(projectRoot);
  const outcomes = pendingOutcome(projectRoot);
  const drafts = draftIds(requirements);
  const questions = openQuestionIds(requirements);
  const open = firstOpenSlice(slices.slices);
  const agreedUnplanned = slices.unplanned.filter((id) => {
    const r = requirements.find((req) => req.id === id);
    return r && r.status === "agreed";
  });

  let where = "No requirements yet.";
  let next = "/decompose the brief.";
  let avoid = "";

  if (chgs.length) {
    where = `CHG waiting on you: ${chgs.join(", ")}.`;
    next =
      "Fill decision: and commercial: on those CHG files. Do not type REQ ids. Then tell the agent they are filled.";
    avoid = "Do not /tdd new variation work until decision is filled.";
  } else if (outcomes.length) {
    where = `CHG decided, outcome still empty: ${outcomes.join(", ")}.`;
    next =
      "Tell the agent those CHGs are filled. Do not type REQ ids. Agent fills outcome: from affects: plus the current version.";
    avoid = "Do not /verifyReq. Do not /tdd until outcome is filled.";
  } else if (questions.length || drafts.length) {
    const ids = [...new Set([...questions, ...drafts])];
    where = `Open questions. Still draft: ${ids.join(", ")}.`;
    next = "Paste answers in ANSWERS.md, then /resolve-ambiguities.";
    avoid = "Do not /tdd a draft id.";
  } else if (open) {
    where = `Slice ${open.id} ${open.name} — ${open.label} ${open.doneCount}/${open.total}.`;
    next = open.next;
    if (open.state === "in_progress" || open.state === "blocked") {
      avoid = "Do not /feature-plan a later slice.";
    }
  } else if (agreedUnplanned.length) {
    where = `Agreed ids not in any slice: ${agreedUnplanned.join(", ")}.`;
    next = `/slice-add covering ${agreedUnplanned.join(", ")}.`;
  } else if (requirements.length) {
    where = "Every sequenced requirement is verified.";
    next =
      "/verifyReq then PR — or a new ask starts at /find-variation (not /decompose).";
  }

  return { where, next, avoid, loops: false };
}

function formatReport(data) {
  const lines = ["Where", `  ${data.where}`, "", "Next", `  ${data.next}`];
  if (data.avoid) lines.push("", "Do not", `  ${data.avoid}`);
  lines.push("", "Lost later? Type /help.");
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const options = { project: process.cwd(), help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg === "--project") {
      i += 1;
      options.project = argv[i];
    } else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

function main(argv) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      process.stdout.write("Usage: node scripts/next.js [--project <path>]\n");
      return EXIT_OK;
    }
    process.stdout.write(formatReport(report(options.project)));
    return EXIT_OK;
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return EXIT_TOOL_ERROR;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  report,
  formatReport,
  parseArgs,
  main,
  undecidedChanges,
  pendingOutcome,
};
