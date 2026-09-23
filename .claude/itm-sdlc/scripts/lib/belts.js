"use strict";

/**
 * Testing belts A (unit), B (browser), C (HTTP / AI-API).
 *
 * Classification is path + adapter globs, not the test title. Missing `belts`
 * on a requirement means [A], so old YAML still validates.
 */

const path = require("node:path");
const { minimatch } = require("minimatch");

const BELTS = Object.freeze(["A", "B", "C"]);
const DEFAULT_E2E_GLOBS = Object.freeze(["**/e2e/**"]);

function toPosix(p) {
  return String(p).split(path.sep).join("/");
}

function matchGlobs(relPosix, patterns) {
  if (!patterns || patterns.length === 0) return false;
  const rel = toPosix(relPosix).replace(/^\.\//, "");
  return patterns.some((pattern) => {
    try {
      return minimatch(rel, pattern, { dot: true, nocase: false });
    } catch {
      return false;
    }
  });
}

/**
 * Belts this requirement must prove. A is always required (plan §5).
 * Unknown letters are ignored. Empty / missing → [A].
 */
function requiredBelts(requirement) {
  const raw = requirement?.belts;
  const listed = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const letter = String(item).toUpperCase();
      if (BELTS.includes(letter) && !listed.includes(letter))
        listed.push(letter);
    }
  }
  if (!listed.includes("A")) listed.unshift("A");
  return listed;
}

/**
 * Which belt a repository-relative test path belongs to.
 * B (e2e) wins over C (api) wins over A (remaining testGlobs).
 */
function classifyRelativePath(relPosix, adapters) {
  const rel = toPosix(relPosix).replace(/^\.\//, "");
  if (!rel) return null;

  for (const adapter of adapters) {
    if (matchGlobs(rel, adapter.e2eGlobs ?? DEFAULT_E2E_GLOBS)) return "B";
  }
  for (const adapter of adapters) {
    if (matchGlobs(rel, adapter.apiGlobs ?? [])) return "C";
  }
  for (const adapter of adapters) {
    if (matchGlobs(rel, adapter.testGlobs ?? [])) return "A";
  }
  return null;
}

function coveringByBelt(files, projectDir, adapters) {
  const byBelt = { A: [], B: [], C: [] };
  for (const file of files) {
    const rel = toPosix(path.relative(projectDir, file));
    const belt = classifyRelativePath(rel, adapters);
    if (belt) byBelt[belt].push(rel);
  }
  return byBelt;
}

function missingBelts(requirement, files, projectDir, adapters) {
  const present = coveringByBelt(files, projectDir, adapters);
  return requiredBelts(requirement).filter(
    (belt) => present[belt].length === 0,
  );
}

/**
 * Per-letter evidence for close-slice / reports.
 * One row per required belt, files that satisfy it, and whether it is present.
 */
function beltEvidence(requirement, files, projectDir, adapters) {
  const present = coveringByBelt(files, projectDir, adapters);
  return requiredBelts(requirement).map((belt) => ({
    belt,
    files: present[belt],
    ok: present[belt].length > 0,
  }));
}

/** G7 statuses that are a silent skip, not a real review. */
const G7_SKIP_STATES = Object.freeze([
  "not-configured",
  "not-installed",
  "no-output",
  "harness-error",
]);

/**
 * Normalise review-change.js output into a G7 job state.
 * `scriptExit` is the process exit code of review-change.js (0/1/2).
 */
function g7StateFromReview(review, scriptExit) {
  if (!review || typeof review !== "object") {
    return scriptExit === 2 ? "harness-error" : "no-output";
  }
  if (review.status === "not-configured") return "not-configured";
  if (review.status === "not-installed") return "not-installed";
  const findings = Array.isArray(review.findings) ? review.findings : [];
  if (findings.some((f) => f.severity === "blocking"))
    return "blocking-findings";
  return findings.length > 0 ? "findings" : "clean";
}

/**
 * Belt C in force + G7 skipped/broken → fail the job (plan §7.1 lock 3).
 * Advisory G7 (no letter C) may still record not-configured and stay green.
 */
function g7MustFail(requiresC, state) {
  return Boolean(requiresC) && G7_SKIP_STATES.includes(state);
}

const COUNTED_STATUSES = new Set([
  "agreed",
  "in_progress",
  "verified",
  "signed_off",
]);

function projectRequiresBelt(requirements, letter) {
  const ids = [];
  for (const requirement of requirements) {
    if (!COUNTED_STATUSES.has(requirement?.status)) continue;
    if (requiredBelts(requirement).includes(letter)) ids.push(requirement.id);
  }
  return ids;
}

module.exports = {
  BELTS,
  DEFAULT_E2E_GLOBS,
  G7_SKIP_STATES,
  requiredBelts,
  classifyRelativePath,
  coveringByBelt,
  missingBelts,
  beltEvidence,
  projectRequiresBelt,
  g7StateFromReview,
  g7MustFail,
  matchGlobs,
  toPosix,
};
