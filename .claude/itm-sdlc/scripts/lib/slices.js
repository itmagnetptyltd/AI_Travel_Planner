"use strict";

/**
 * slices.js — read a project's delivery slices and work out where each one is.
 *
 * A slice is a set of requirement ids delivered together on one branch, one
 * pull request. Requirement order is the client's; slice order is ours, and it
 * is a judgement — which increments can actually be demonstrated, and in what
 * order. `depends_on` gives a topological ordering, but topology alone groups
 * the runtime, the grid and the upload button into one level that nobody can
 * run, so the grouping is written down rather than derived.
 *
 * It lives in `.brain/slices.yaml`, beside the requirements but not inside
 * them: a slice is a delivery decision, not part of what the client agreed, and
 * requirement.schema.json is `additionalProperties: false` anyway.
 *
 * The file is optional. A project without one is not in error — it has simply
 * not written its plan down, and every reader here reports that as absence
 * rather than failure.
 */

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const { STATUS_ORDER } = require("./requirements");

const DEFAULT_SLICE_FILE = ".brain/slices.yaml";

/** Slice states, weakest first. A slice is only as far along as its least-advanced id. */
const SLICE_STATES = ["blocked", "not_started", "in_progress", "done"];

const LABELS = {
  blocked: "Blocked",
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

/**
 * Read `.brain/slices.yaml`.
 *
 * Returns `{ present: false, slices: [], problems: [] }` when there is no file.
 * A malformed file is a problem to report, never a throw — the dashboard must
 * still render the rest of the project.
 */
function loadSlices(projectRoot = process.cwd(), file = DEFAULT_SLICE_FILE) {
  const full = path.join(projectRoot, file);
  if (!fs.existsSync(full))
    return { present: false, file, slices: [], problems: [] };

  let parsed;
  try {
    parsed = yaml.load(fs.readFileSync(full, "utf8"), {
      schema: yaml.CORE_SCHEMA,
    });
  } catch (error) {
    return {
      present: true,
      file,
      slices: [],
      problems: [`${file} is not valid YAML: ${error.message}`],
    };
  }

  // A file that is only comments parses to null. That is the shipped template,
  // untouched — a project that has not written its plan down yet, not an error.
  if (parsed === null || parsed === undefined) {
    return { present: true, file, slices: [], problems: [] };
  }

  if (!Array.isArray(parsed)) {
    return {
      present: true,
      file,
      slices: [],
      problems: [`${file} must be a list of slices.`],
    };
  }

  const problems = [];
  const slices = [];
  const seen = new Set();

  parsed.forEach((entry, index) => {
    const where = `${file} entry ${index + 1}`;
    if (!entry || typeof entry !== "object") {
      problems.push(`${where} is not a slice.`);
      return;
    }
    const covers = Array.isArray(entry.covers) ? entry.covers.map(String) : [];
    if (covers.length === 0) {
      problems.push(`${where} names no requirements in 'covers'.`);
      return;
    }
    for (const id of covers) {
      if (seen.has(id)) problems.push(`${id} appears in more than one slice.`);
      seen.add(id);
    }
    slices.push({
      id: entry.id ?? index + 1,
      name: String(entry.name || `Slice ${index + 1}`),
      branch: entry.branch ? String(entry.branch) : "",
      why: entry.why ? String(entry.why) : "",
      covers,
    });
  });

  return { present: true, file, slices, problems };
}

/** Where a single requirement has got to, or null when the id does not exist. */
function statusOf(requirementsById, id) {
  const requirement = requirementsById.get(id);
  return requirement ? requirement.status : null;
}

/**
 * A slice is `done` only when every id it covers is verified or signed off —
 * one unfinished requirement is an unfinished slice. It is `blocked` while any
 * id is still `draft`, because a draft has open ambiguities and /tdd will
 * refuse it.
 */
function stateOf(statuses) {
  if (statuses.some((s) => s === "draft")) return "blocked";
  if (statuses.every((s) => s === "verified" || s === "signed_off"))
    return "done";
  if (
    statuses.some((s) => s === "in_progress") ||
    statuses.some((s) => s === "verified" || s === "signed_off")
  ) {
    return "in_progress";
  }
  return "not_started";
}

/**
 * What to type next. The dashboard was showing In progress with no instruction,
 * so people finished /tdd and did not know the slice was not Done.
 */
function unfinishedIds(slice) {
  if (!Array.isArray(slice.members)) return [];
  return slice.members
    .filter(
      (m) => !m.missing && m.status !== "verified" && m.status !== "signed_off",
    )
    .map((m) => m.id);
}

function nextAction(slice, previous) {
  if (slice.missing.length > 0) {
    return `${slice.missing.join(", ")} not in the requirement record.`;
  }
  const remaining = slice.total - slice.doneCount;
  const ids = unfinishedIds(slice);
  const named = ids.length ? ids.join(", ") : "";
  switch (slice.state) {
    case "blocked":
      return named
        ? `${named} still draft. Answer in ANSWERS.md, then /resolve-ambiguities.`
        : "Agree remaining drafts. /tdd refuses draft.";
    case "done":
      return "Done. Next slice may start.";
    case "not_started":
      if (previous && previous.state !== "done") {
        return `Wait. Finish slice ${previous.id} first.`;
      }
      return "/feature-plan then /tdd.";
    case "in_progress":
      if (named) {
        return `/tdd ${named}, then /close-slice. Not Done until ${remaining} more are verified.`;
      }
      return `/tdd the remaining ${remaining} id(s), then /close-slice. Not Done until ${remaining} more are verified.`;
    default:
      return "";
  }
}

/**
 * Join the slice plan to the requirement record.
 *
 * Every id is reported: one that names a requirement which does not exist is a
 * `missing` entry rather than a silent omission, because a slice plan that has
 * drifted from the record is worse than none.
 */
function computeSlices(requirements, loaded) {
  const byId = new Map(requirements.map((r) => [r.id, r]));
  const covered = new Set();

  const slices = loaded.slices.map((slice) => {
    const members = slice.covers.map((id) => {
      const status = statusOf(byId, id);
      if (status) covered.add(id);
      return { id, status, missing: status === null };
    });
    const known = members.filter((m) => !m.missing).map((m) => m.status);
    const missing = members.filter((m) => m.missing).map((m) => m.id);
    const state = known.length === 0 ? "blocked" : stateOf(known);
    const doneCount = known.filter(
      (s) => s === "verified" || s === "signed_off",
    ).length;
    const built = {
      ...slice,
      members,
      missing,
      state,
      label: LABELS[state],
      doneCount,
      total: members.length,
    };
    return built;
  });
  slices.forEach((slice, index) => {
    slice.next = nextAction(slice, index > 0 ? slices[index - 1] : null);
  });

  const unplanned = requirements
    .map((r) => r.id)
    .filter((id) => !covered.has(id));

  const problems = [...loaded.problems];
  for (const slice of slices) {
    for (const id of slice.missing) {
      problems.push(
        `${slice.name} covers ${id}, which is not in the requirement record.`,
      );
    }
  }

  return {
    present: loaded.present,
    file: loaded.file,
    slices,
    unplanned,
    problems,
    counts: SLICE_STATES.reduce((acc, state) => {
      acc[state] = slices.filter((s) => s.state === state).length;
      return acc;
    }, {}),
  };
}

/** Everything the dashboard needs, from a project root. */
function readSlices(projectRoot, requirements, file = DEFAULT_SLICE_FILE) {
  return computeSlices(requirements, loadSlices(projectRoot, file));
}

module.exports = {
  DEFAULT_SLICE_FILE,
  SLICE_STATES,
  LABELS,
  STATUS_ORDER,
  loadSlices,
  computeSlices,
  readSlices,
  stateOf,
  nextAction,
  unfinishedIds,
};
