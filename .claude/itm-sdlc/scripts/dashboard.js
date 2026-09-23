#!/usr/bin/env node
"use strict";

/**
 * Visual project dashboard. Reads files only — no database.
 *
 * Usage:
 *   node scripts/dashboard.js [--project <path>] [--out <file>] [--open] [--serve]
 */

const { execFile, spawn } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const {
  DEFAULT_PATTERNS,
  loadRequirementFiles,
  flatten,
  STATUS_ORDER,
} = require("./lib/requirements");
const { computeReport } = require("./client-report");
const { readSlices } = require("./lib/slices");
const {
  listNotes,
  listRefs,
  parsePromptLog,
  drainInbox,
  stageRefs,
  inboxDir,
  safeBase,
} = require("./lib/working");
const { report } = require("./next");

const EXIT_OK = 0;
const EXIT_TOOL_ERROR = 2;

function listNamed(projectRoot, dir, prefix) {
  const root = path.join(projectRoot, dir);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .filter(
      (name) =>
        name.toUpperCase().startsWith(prefix) && !name.startsWith("README"),
    )
    .sort()
    .map((name) => {
      const file = path.join(root, name);
      const text = fs.readFileSync(file, "utf8");
      const title = (text.match(/^#\s+(.+)$/m) || [])[1] || name;
      return { file: `${dir}/${name}`, title: title.trim() };
    });
}

function promptCount(projectRoot) {
  return parsePromptLog(projectRoot).length;
}

function collect(projectRoot) {
  const matrix = computeReport({
    project: projectRoot,
    requirements: DEFAULT_PATTERNS,
  });
  const { documents } = loadRequirementFiles(DEFAULT_PATTERNS, projectRoot);
  const requirements = flatten(documents).map(({ requirement }) => requirement);

  const versioned = requirements.filter(
    (r) => (r.history || []).length > 0 || r.version > 1,
  );
  const history = [];
  for (const r of requirements) {
    for (const entry of r.history || []) {
      history.push({
        id: r.id,
        from: entry.version,
        to: entry.superseded_by ?? r.version,
        summary: entry.summary || "",
      });
    }
  }

  const slices = readSlices(projectRoot, requirements);

  return {
    project: path.basename(projectRoot),
    generatedAt: new Date().toISOString(),
    matrix,
    slices,
    counts: {
      requirements: matrix.summary.total,
      byStatus: matrix.summary.byStatus,
      changes: listNamed(projectRoot, ".brain/changes", "CHG-").length,
      feedback: listNamed(projectRoot, ".brain/feedback", "FB-").length,
      decisions: listNamed(projectRoot, ".brain/decisions", "ADR-").length,
      versioned: versioned.length,
      prompts: promptCount(projectRoot),
      notes: listNotes(projectRoot).length,
      refs: listRefs(projectRoot).length,
      openQuestions: matrix.rows.reduce(
        (n, row) => n + row.openQuestions.length,
        0,
      ),
    },
    changes: listNamed(projectRoot, ".brain/changes", "CHG-"),
    feedback: listNamed(projectRoot, ".brain/feedback", "FB-"),
    decisions: listNamed(projectRoot, ".brain/decisions", "ADR-"),
    notes: listNotes(projectRoot),
    refs: listRefs(projectRoot),
    prompts: parsePromptLog(projectRoot),
    help: report(projectRoot),
    history,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

function truncate(text, max) {
  const value = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : max)}…`;
}

function recordParts(item) {
  const base = path.basename(item.file || "");
  const fromFile = (base.match(/^(CHG|FB|ADR)-\d+/i) || [])[0];
  const fromTitle = (String(item.title).match(/^(CHG|FB|ADR)-\d+/i) || [])[0];
  const id = (fromFile || fromTitle || "").toUpperCase();
  const rest = String(item.title)
    .replace(new RegExp(`^${id}\\s*[—–-]\\s*`, "i"), "")
    .trim();
  return { id, rest: rest || item.title };
}

function recordNumber(item) {
  const { id } = recordParts(item);
  const match = id.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function highestFirst(items) {
  return [...items].sort((a, b) => recordNumber(b) - recordNumber(a));
}

function renderHtml(data) {
  const s = data.counts.byStatus;
  const max = Math.max(1, ...STATUS_ORDER.map((st) => s[st] || 0));
  const bars = STATUS_ORDER.map((st) => {
    const n = s[st] || 0;
    const pct = Math.round((n / max) * 100);
    return `<div class="bar-row"><span class="bar-label">${escapeHtml(st)}</span><span class="bar"><i class="${escapeHtml(st)}" style="width:${pct}%"></i></span><span class="bar-n">${n}</span></div>`;
  }).join("");

  const filters = [
    `<button type="button" class="chip on" data-status="" aria-pressed="true">All <b>${data.counts.requirements}</b></button>`,
    ...STATUS_ORDER.map((st) => {
      const n = s[st] || 0;
      return `<button type="button" class="chip" data-status="${escapeHtml(st)}" aria-pressed="false">${escapeHtml(st)} <b>${n}</b></button>`;
    }),
  ].join("");

  const reqRows = data.matrix.rows
    .map((row) => {
      const q = row.openQuestions.length
        ? `${row.openQuestions.length} open`
        : "—";
      const ev = row.evidence.length ? `${row.evidence.length} test(s)` : "—";
      return `<tr data-status="${escapeHtml(row.status)}"><td><code>${escapeHtml(row.id)}</code></td><td>${escapeHtml(row.title)}</td><td><span class="pill ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span></td><td>v${row.version}</td><td>${escapeHtml(ev)}</td><td class="${row.openQuestions.length ? "warn-cell" : ""}">${escapeHtml(q)}</td></tr>`;
    })
    .join("");

  const hist = data.history.length
    ? data.history
        .map((h) => {
          const full = h.summary || "";
          return `<li class="hist"><div><code>${escapeHtml(h.id)}</code> <span class="ver">v${h.from} → v${h.to}</span></div><p title="${escapeHtml(full)}">${escapeHtml(truncate(full, 140) || "No summary.")}</p></li>`;
        })
        .join("")
    : '<li class="empty">No versioned requirements yet.</li>';

  const slices = data.slices;
  const sliceRows = slices.slices
    .map((slice) => {
      const ids = slice.members
        .map(
          (m) =>
            `<code class="${m.missing ? "gone" : escapeHtml(m.status)}" title="${escapeHtml(m.missing ? "not in the requirement record" : m.status)}">${escapeHtml(m.id)}</code>`,
        )
        .join(" ");
      const branch = slice.branch
        ? `<code class="branch">${escapeHtml(slice.branch)}</code>`
        : "—";
      return `<tr data-slice-state="${escapeHtml(slice.state)}"><td>${escapeHtml(String(slice.id))}</td><td>${escapeHtml(slice.name)}<p class="why">${escapeHtml(truncate(slice.why, 150))}</p></td><td class="ids">${ids}</td><td>${branch}</td><td><span class="pill slice-${escapeHtml(slice.state)}">${escapeHtml(slice.label)}</span><span class="of">${slice.doneCount}/${slice.total}</span></td><td class="next">${escapeHtml(slice.next || "")}</td></tr>`;
    })
    .join("");

  const planned = slices.slices.length > 0;
  const sliceNote = !slices.present
    ? `<p class="empty-note">No <code>${escapeHtml(slices.file)}</code> in this project. Requirement order is the client's; slice order is a delivery decision, and until it is written down there is nothing here to show.</p>`
    : slices.problems.length
      ? `<ul class="problems">${slices.problems.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>`
      : !planned
        ? `<p class="empty-note"><code>${escapeHtml(slices.file)}</code> is still the shipped template, so there is no task sequence against ${data.counts.requirements} requirement(s). <code>/resolve-ambiguities</code> writes the first sequence once requirements are <code>agreed</code>. If you already resolved and this is still empty, run <code>/slice-add</code>. Do not hand-edit the file.</p>`
        : "";

  // Unplanned ids are worth naming once a plan exists and a few were left out.
  // Before that every requirement is unplanned, which is what the note above
  // already says — in one line rather than in a wall of a hundred ids.
  const UNPLANNED_SHOWN = 12;
  const shown = slices.unplanned.slice(0, UNPLANNED_SHOWN);
  const rest = slices.unplanned.length - shown.length;
  const unplanned =
    planned && slices.unplanned.length
      ? `<p class="empty-note">Not in any slice (${slices.unplanned.length}): ${shown.map((id) => `<code>${escapeHtml(id)}</code>`).join(" ")}${rest > 0 ? ` and ${rest} more` : ""}</p>`
      : "";

  const pager = (label) =>
    `<nav class="pager" aria-label="${escapeHtml(label)} pages">
      <button type="button" class="page-btn" data-dir="-1">Prev</button>
      <span class="page-label">1 / 1</span>
      <button type="button" class="page-btn" data-dir="1">Next</button>
    </nav>`;

  const list = (items, empty, pageSize) => {
    const rows = items.length
      ? items
          .map((i) => {
            const { id, rest } = recordParts(i);
            return `<li>${id ? `<code>${escapeHtml(id)}</code>` : ""}<span title="${escapeHtml(i.title)}">${escapeHtml(truncate(rest, 110))}</span></li>`;
          })
          .join("")
      : `<li class="empty">${empty}</li>`;
    return `<div class="paged" data-page-size="${pageSize}">
      <ul class="records">${rows}</ul>
      ${pager("Records")}
    </div>`;
  };

  const stat = (n, label, extra = "") =>
    `<div class="stat${extra}"><b>${n}</b><span>${label}</span></div>`;

  const noteItems = (data.notes || [])
    .map((n) => {
      const files = (n.files || []).length
        ? `<p class="note-files">${n.files
            .map((f) => `<code>${escapeHtml(f)}</code>`)
            .join(" ")}</p>`
        : "";
      return `<li class="note"><code>${escapeHtml(n.id)}</code><div><p>${escapeHtml(n.text)}</p>${files}</div></li>`;
    })
    .join("");

  const promptItems = (data.prompts || [])
    .map(
      (p) =>
        `<li class="note"><span class="ver">${escapeHtml(formatStamp(p.at) === p.at ? p.at : formatStamp(p.at))}</span><div><p>${escapeHtml(p.text)}</p></div></li>`,
    )
    .join("");

  const refRows = (data.refs || [])
    .map((r) => {
      const href = `ref/${escapeHtml(r.filename)}`;
      const icon =
        r.kind === "image"
          ? `<img class="thumb" data-kind="image" src="${href}" alt="">`
          : `<span class="file-icon" data-kind="${escapeHtml(r.kind)}" aria-hidden="true"></span>`;
      return `<tr><td>${escapeHtml(r.serial)}</td><td class="file-cell">${icon}<a href="${href}">${escapeHtml(r.filename)}</a></td><td>${escapeHtml(r.type)}</td></tr>`;
    })
    .join("");

  const help = data.help || {};
  const nextCard = `<article class="next-card">
      <h2>Where you are</h2>
      <p class="next-where">${escapeHtml(help.where || "No requirements yet.")}</p>
      <h2>Next</h2>
      <p class="next-cmd"><code>${escapeHtml(help.next || "/help")}</code></p>
      ${help.avoid ? `<p class="next-avoid">${escapeHtml(help.avoid)}</p>` : ""}
      <p class="empty-note">Same as <code>/help</code>.</p>
    </article>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Project dashboard</title>
<style>
  :root {
    --bg: #efe8dc;
    --ink: #1c1917;
    --muted: #6b635a;
    --card: #fffaf2;
    --line: #ddd4c6;
    --draft: #78716c;
    --agreed: #0369a1;
    --in_progress: #c2410c;
    --verified: #15803d;
    --signed_off: #0f766e;
    --warn: #9a3412;
    --warn-bg: #fff1e4;
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  html { -webkit-font-smoothing: antialiased; height: 100%; }
  body {
    margin: 0;
    min-height: 100%;
    color: var(--ink);
    background: var(--bg);
    font: 14px/1.45 "Segoe UI", system-ui, sans-serif;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.2rem;
    padding: 1.1rem clamp(1rem, 3vw, 2.5rem) 0.95rem;
    border-bottom: 1px solid var(--line);
    background: #f7f1e6;
  }
  header p { margin: 0; color: var(--muted); font-size: 12px; }
  h1 { margin: 0; font-size: 1.7rem; letter-spacing: -0.03em; text-wrap: balance; }
  main {
    flex: 1;
    width: min(1680px, 96vw);
    margin: 0 auto;
    padding: 1.15rem 0 2rem;
    display: flex;
    flex-direction: column;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 8px;
  }
  .stat {
    background: var(--card);
    border: 1px solid var(--line);
    padding: 10px 12px;
    border-radius: 8px;
    text-align: center;
  }
  .stat b {
    display: block;
    font-size: 1.55rem;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
  }
  .stat span { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  .stat.warn { background: var(--warn-bg); border-color: #efd3ba; }
  .stat.warn b { color: var(--warn); }
  h2 {
    margin: 0 0 0.65rem;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted);
    text-align: center;
  }
  .board {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    margin-top: 1.15rem;
  }
  .board-main { display: flex; flex-direction: column; min-width: 0; }
  .box {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0.85rem 0.95rem 0.75rem;
    display: flex;
    flex-direction: column;
    flex: 0 0 auto;
    height: auto;
    min-width: 0;
  }
  .box h2 { text-align: left; }
  .box .records li:last-child { border-bottom: 0; }
  .box .count {
    color: var(--muted);
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
  }
  .box .paged,
  .box .records {
    flex: 0 0 auto;
    height: auto;
  }
  .tabs {
    display: flex;
    gap: 6px;
    margin-top: 1.15rem;
    border-bottom: 1px solid var(--line);
  }
  .tab {
    appearance: none;
    background: none;
    border: 1px solid transparent;
    border-bottom: 0;
    border-radius: 8px 8px 0 0;
    padding: 8px 14px;
    margin-bottom: -1px;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    cursor: pointer;
  }
  .tab b { font-variant-numeric: tabular-nums; font-weight: 700; }
  .tab:hover { color: var(--ink); }
  .tab.on {
    background: var(--card);
    border-color: var(--line);
    border-bottom: 1px solid var(--card);
    color: var(--ink);
  }
  .tab-panel { display: flex; flex-direction: column; min-height: 0; }
  .tab-panel[hidden] { display: none; }
  .tab-panel.grow { flex: 1; }
  .tab-panel.grow .paged { flex: 1; }
  h2.spaced { margin-top: 1.25rem; }
  .cols3 { display: grid; gap: 0.85rem; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: start; }
  .split { display: grid; gap: 18px; grid-template-columns: minmax(240px, 0.9fr) 1.1fr; }
  @media (max-width: 980px) {
    .stats { grid-template-columns: repeat(4, 1fr); }
    .split { grid-template-columns: 1fr; }
    .cols3 { grid-template-columns: 1fr; }
    .others-grid { grid-template-columns: 1fr; }
    .tabs { flex-wrap: wrap; }
  }
  @media (max-width: 640px) {
    .stats { grid-template-columns: repeat(2, 1fr); }
    header { padding-left: 1rem; padding-right: 1rem; }
    main { width: 94vw; }
  }
  .status-chart {
    height: 175px;
    overflow: auto;
  }
  .change-history {
    height: 175px;
    overflow: auto;
  }
  .bar-row { display: grid; grid-template-columns: 6.5rem 1fr 1.6rem; gap: 8px; align-items: center; margin: 8px 0; line-height: 1.6; }
  .bar-label { font-size: 12px; color: var(--muted); line-height: 1.6; }
  .bar { height: 21px; background: #e7dfd2; border-radius: 99px; overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: inherit; }
  .bar i.draft { background: var(--draft); }
  .bar i.agreed { background: var(--agreed); }
  .bar i.in_progress { background: var(--in_progress); }
  .bar i.verified { background: var(--verified); }
  .bar i.signed_off { background: var(--signed_off); }
  .bar-n { font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }
  .filters { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
  .chip {
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--ink);
    border-radius: 99px;
    padding: 4px 10px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    min-height: 32px;
  }
  .chip b { font-variant-numeric: tabular-nums; }
  .chip.on { background: var(--ink); color: #fffaf2; border-color: var(--ink); }
  .search { color: var(--muted); font-size: 12px; display: flex; align-items: center; gap: 6px; }
  .search input {
    border: 1px solid var(--line);
    background: var(--card);
    border-radius: 6px;
    padding: 6px 8px;
    font: inherit;
    min-width: 16rem;
  }
  .table-wrap {
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--card);
    min-height: min(42vh, 28rem);
  }
  .tab-panel[data-panel="reqs"] .table-wrap {
    max-height: none;
    min-height: 0;
    overflow: visible;
  }
  .paged { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .pager {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    min-height: 40px;
  }
  .box .pager { min-height: 32px; margin-top: 2px; }
  .box .page-btn { min-height: 32px; padding: 4px 10px; }
  .pager[hidden] { display: none; }
  .page-btn {
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--ink);
    border-radius: 6px;
    padding: 6px 12px;
    font: inherit;
    min-height: 36px;
    min-width: 4.5rem;
    cursor: pointer;
  }
  .page-btn:disabled { opacity: 0.45; cursor: default; }
  .page-label { font-variant-numeric: tabular-nums; font-size: 12px; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    font-weight: 600;
    background: #f7f1e6;
    position: sticky;
    top: 0;
  }
  tr:last-child td { border-bottom: 0; }
  tbody tr:hover { background: #fff6e8; }
  code {
    font: 12px/1.3 ui-monospace, "Cascadia Code", Consolas, monospace;
    color: #3f3a34;
  }
  .pill {
    display: inline-block;
    padding: 1px 7px;
    font-size: 11px;
    border-radius: 99px;
    font-weight: 600;
  }
  .pill.draft { background: #f0ece6; color: var(--draft); }
  .pill.agreed { background: #e0f2fe; color: var(--agreed); }
  .pill.in_progress { background: #ffedd5; color: var(--in_progress); }
  .pill.verified { background: #dcfce7; color: var(--verified); }
  .pill.signed_off { background: #ccfbf1; color: var(--signed_off); }
  .pill.slice-blocked { background: #fee2e2; color: #b42318; }
  .pill.slice-not_started { background: #f0ece6; color: var(--draft); }
  .pill.slice-in_progress { background: #ffedd5; color: var(--in_progress); }
  .pill.slice-done { background: #dcfce7; color: var(--verified); }
  table.slices .why { margin: 2px 0 0; font-size: 11px; color: var(--muted); }
  table.slices .ids { line-height: 1.9; }
  table.slices .ids code { padding: 1px 5px; border-radius: 4px; background: #f0ece6; }
  table.slices .ids code.verified, table.slices .ids code.signed_off { background: #dcfce7; }
  table.slices .ids code.in_progress { background: #ffedd5; }
  table.slices .ids code.draft { background: #fee2e2; }
  table.slices .ids code.gone { background: #fee2e2; text-decoration: line-through; }
  table.slices .of { margin-left: 6px; font-size: 11px; color: var(--muted); }
  table.slices .next { font-size: 11px; color: var(--muted); max-width: 22rem; }
  code.branch { font-size: 11px; color: var(--muted); }
  .empty-note { margin: 0 0 10px; font-size: 12px; color: var(--muted); }
  .problems { margin: 0 0 10px; font-size: 12px; color: var(--warn); }
  .problems li { padding: 2px 0; }
  .warn-cell { color: var(--warn); font-weight: 600; }
  ul { margin: 0; padding: 0; list-style: none; }
  .records li, .hist {
    display: grid;
    grid-template-columns: 5.4rem 1fr;
    gap: 8px;
    padding: 7px 0;
    border-bottom: 1px solid var(--line);
  }
  .records li.is-off { display: none !important; }
  .hist { grid-template-columns: 1fr; }
  .hist p { margin: 2px 0 0; color: #44403c; text-wrap: pretty; }
  .ver { color: var(--muted); font-size: 12px; }
  .empty { color: var(--muted); margin: 0; }
  .note {
    display: grid;
    grid-template-columns: 6.2rem 1fr;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  .note p { margin: 0; text-wrap: pretty; }
  .note-files { margin-top: 4px; }
  .file-cell {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .thumb {
    width: 22px;
    height: 22px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid var(--line);
    background: #fff;
  }
  .file-icon {
    width: 22px;
    height: 22px;
    flex: none;
    display: inline-block;
    position: relative;
    border: 1.5px solid var(--muted);
    border-radius: 3px;
    background: #fff;
  }
  .file-icon[data-kind="pdf"] { border-color: #b3261e; }
  .file-icon[data-kind="pdf"]::after {
    content: "P";
    position: absolute;
    inset: 0;
    font-size: 11px;
    font-weight: 700;
    color: #b3261e;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .file-icon[data-kind="text"]::after {
    content: "";
    position: absolute;
    left: 4px; right: 4px; top: 5px;
    border-top: 1.5px solid var(--muted);
    box-shadow: 0 4px 0 var(--muted), 0 8px 0 var(--muted);
    height: 0;
  }
  .file-icon[data-kind="file"]::after {
    content: "";
    position: absolute;
    left: 5px; right: 5px; top: 6px; bottom: 6px;
    border: 1.5px solid var(--muted);
  }
  table.refs .file-cell a { color: inherit; }
  .add-file {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 8px;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: #fff;
    font-size: 13px;
    cursor: pointer;
  }
  .add-file input { display: none; }
  .others-grid {
    display: grid;
    gap: 0.85rem;
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }
  .next-card {
    grid-column: 1 / -1;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px 16px;
  }
  .next-card h2 { text-align: left; margin-bottom: 6px; }
  .next-card h2 + h2 { margin-top: 12px; }
  .next-where, .next-cmd, .next-avoid { margin: 0; }
  .next-cmd {
    font-size: 1.05rem;
    font-weight: 600;
  }
  .next-cmd code {
    padding: 2px 6px;
    border-radius: 4px;
    background: #f0ece6;
  }
  .next-avoid { margin-top: 8px; color: var(--warn); font-size: 12px; }
  .tab-panel[data-panel="others"] .table-wrap {
    min-height: 0;
    max-height: 220px;
  }
  .tab-panel[data-panel="others"] .box .records {
    max-height: 180px;
    overflow: auto;
  }
  .tab-panel[data-panel="others"] [data-kind="prompts"] .records {
    max-height: none;
    overflow: visible;
  }
</style>
</head>
<body>
<header>
  <h1>Project dashboard</h1>
  <p title="${escapeHtml(data.generatedAt)}">${escapeHtml(formatStamp(data.generatedAt))}</p>
</header>
<main>
  <div class="stats">
    ${stat(data.counts.requirements, "Requirements")}
    ${stat(data.counts.changes, "Change records")}
    ${stat(data.counts.feedback, "Feedback")}
    ${stat(data.counts.decisions, "Decisions")}
    ${stat(data.counts.versioned, "Versioned REQs")}
    ${stat(data.counts.openQuestions, "Open questions", data.counts.openQuestions ? " warn" : "")}
    ${stat(data.counts.prompts, "Logged prompts")}
  </div>

  <div class="tabs" role="tablist" aria-label="Dashboard sections">
    <button type="button" role="tab" class="tab on" data-tab="reqs" aria-selected="true">Requirements <b>${data.counts.requirements}</b></button>
    <button type="button" role="tab" class="tab" data-tab="slices" aria-selected="false">Task Sequence <b>${slices.slices.length}</b></button>
    <button type="button" role="tab" class="tab" data-tab="records" aria-selected="false">Records <b>${data.counts.feedback + data.counts.decisions + data.counts.changes}</b></button>
    <button type="button" role="tab" class="tab" data-tab="others" aria-selected="false">Others</button>
  </div>

  <div class="board">
    <div class="board-main">
      <section class="tab-panel grow" data-panel="reqs" role="tabpanel">
        <div class="split">
          <section>
            <h2>Status</h2>
            <div class="status-chart">
            ${bars}
            </div>
          </section>
          <section>
            <h2>Change history</h2>
            <div class="change-history">
            <ul>${hist}</ul>
            </div>
          </section>
        </div>
        <h2 class="spaced">Requirements</h2>
        <div class="toolbar">
          <div class="filters" role="group" aria-label="Filter by status">${filters}</div>
          <label class="search">Search <input type="search" id="q" placeholder="REQ, title…"></label>
        </div>
        <div class="paged" data-page-size="10" data-kind="reqs">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Id</th><th>Title</th><th>Status</th><th>Ver</th><th>Evidence</th><th>Questions</th></tr></thead>
              <tbody>${reqRows || '<tr><td colspan="6">No requirements yet.</td></tr>'}</tbody>
            </table>
          </div>
          ${pager("Requirements")}
        </div>
      </section>

      <section class="tab-panel" data-panel="slices" role="tabpanel" hidden>
        <h2>Task Sequence <span class="count">${slices.slices.length}</span></h2>
        ${sliceNote}
        <div class="table-wrap">
          <table class="slices">
            <thead><tr><th>#</th><th>Slice</th><th>Covers</th><th>Branch</th><th>Status</th><th>Next</th></tr></thead>
            <tbody>${sliceRows || '<tr><td colspan="5">No slices defined.</td></tr>'}</tbody>
          </table>
        </div>
        ${unplanned}
      </section>

      <section class="tab-panel" data-panel="records" role="tabpanel" hidden>
        <div class="cols3" aria-label="Project records">
          <section class="box">
            <h2>Feedback <span class="count">${data.counts.feedback}</span></h2>
            ${list(highestFirst(data.feedback), "None yet.", 8)}
          </section>
          <section class="box">
            <h2>Decisions <span class="count">${data.counts.decisions}</span></h2>
            ${list(highestFirst(data.decisions), "None yet.", 8)}
          </section>
          <section class="box">
            <h2>Change records <span class="count">${data.counts.changes}</span></h2>
            ${list(highestFirst(data.changes), "None yet.", 8)}
          </section>
        </div>
      </section>

      <section class="tab-panel" data-panel="others" role="tabpanel" hidden>
        <div class="others-grid">
          ${nextCard}
          <section class="box">
            <h2>Notes <span class="count">${data.counts.notes || 0}</span></h2>
            <p class="empty-note">Polish. Saved with <code>/note</code>. Not a REQ.</p>
            <ul class="records">${noteItems || '<li class="empty">None yet.</li>'}</ul>
          </section>
          <section class="box">
            <h2>Files <span class="count">${data.counts.refs || 0}</span></h2>
            <p class="empty-note">Use <strong>Add file</strong>, or drop anything in <code>.brain/docs/inbox/</code> then <code>/dashboard</code>.</p>
            <label class="add-file">Add file<input type="file" id="ref-upload"></label>
            <div class="table-wrap">
              <table class="refs">
                <thead><tr><th>Serial</th><th>Filename</th><th>Type</th></tr></thead>
                <tbody>${refRows || '<tr><td colspan="3">None yet.</td></tr>'}</tbody>
              </table>
            </div>
          </section>
        </div>
        <h2 class="spaced">Logged prompts <span class="count">${data.counts.prompts}</span></h2>
        <p class="empty-note">Chat that changed files. From the prompt hook, not the brain.</p>
        <div class="paged" data-page-size="10" data-kind="prompts">
          <ul class="records">${promptItems || '<li class="empty">None yet.</li>'}</ul>
          ${pager("Logged prompts")}
        </div>
      </section>
    </div>
  </div>
</main>
<script>
(function () {
  function bindPager(box, items) {
    const size = Number(box.getAttribute("data-page-size")) || 10;
    const pager = box.querySelector(".pager");
    if (!pager) return { refresh() {} };
    let page = 0;
    function refresh() {
      const visible = items.filter((el) => el.dataset.match !== "0");
      const pages = Math.max(1, Math.ceil(visible.length / size));
      if (page > pages - 1) page = pages - 1;
      visible.forEach((el, i) => {
        const off = i < page * size || i >= (page + 1) * size;
        el.hidden = off;
        el.classList.toggle("is-off", off);
      });
      items.filter((el) => el.dataset.match === "0").forEach((el) => {
        el.hidden = true;
        el.classList.add("is-off");
      });
      pager.querySelector(".page-label").textContent = visible.length
        ? page + 1 + " / " + pages
        : "0 / 0";
      pager.querySelector('[data-dir="-1"]').disabled = page <= 0;
      pager.querySelector('[data-dir="1"]').disabled = page >= pages - 1;
      pager.hidden = visible.length <= size;
    }
    pager.querySelectorAll(".page-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        page += Number(btn.getAttribute("data-dir"));
        refresh();
      });
    });
    refresh();
    return { reset() { page = 0; refresh(); }, refresh };
  }

  const reqBox = document.querySelector('[data-kind="reqs"]');
  const rows = Array.from(document.querySelectorAll("tbody tr[data-status]"));
  const reqPager = reqBox ? bindPager(reqBox, rows) : { reset() {} };
  const chips = Array.from(document.querySelectorAll(".chip"));
  const q = document.getElementById("q");
  let status = "";
  function apply() {
    const needle = (q.value || "").toLowerCase();
    rows.forEach((tr) => {
      const okStatus = !status || tr.getAttribute("data-status") === status;
      const okText = !needle || tr.textContent.toLowerCase().includes(needle);
      tr.dataset.match = okStatus && okText ? "1" : "0";
    });
    reqPager.reset();
  }
  chips.forEach((btn) => {
    btn.addEventListener("click", () => {
      status = btn.getAttribute("data-status") || "";
      chips.forEach((other) => {
        const on = other === btn;
        other.classList.toggle("on", on);
        other.setAttribute("aria-pressed", on ? "true" : "false");
      });
      apply();
    });
  });
  if (q) q.addEventListener("input", apply);
  apply();

  document.querySelectorAll('.paged:not([data-kind="reqs"])').forEach((box) => {
    bindPager(box, Array.from(box.querySelectorAll("li")));
  });

  const tabs = Array.from(document.querySelectorAll(".tab"));
  const panels = Array.from(document.querySelectorAll(".tab-panel"));
  function show(name) {
    tabs.forEach((t) => {
      const on = t.getAttribute("data-tab") === name;
      t.classList.toggle("on", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    panels.forEach((p) => {
      p.hidden = p.getAttribute("data-panel") !== name;
    });
  }
  tabs.forEach((t) => {
    t.addEventListener("click", () => show(t.getAttribute("data-tab")));
  });
  const upload = document.getElementById("ref-upload");
  upload?.addEventListener("change", async () => {
    const file = upload.files && upload.files[0];
    if (!file) return;
    if (location.protocol !== "http:" && location.protocol !== "https:") {
      alert("Run /dashboard --open so Add file can save into docs/ref.");
      upload.value = "";
      return;
    }
    const res = await fetch("/upload?name=" + encodeURIComponent(file.name), {
      method: "POST",
      body: await file.arrayBuffer(),
    });
    if (!res.ok) {
      alert("Could not save the file.");
      upload.value = "";
      return;
    }
    location.reload();
  });
  // Keyboard: a tablist is arrow-navigable, not tab-through-every-button.
  document.querySelector(".tabs")?.addEventListener("keydown", (event) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = tabs[(i + step + tabs.length) % tabs.length];
    next.focus();
    show(next.getAttribute("data-tab"));
  });
})();
</script>
</body>
</html>
`;
}

function quoteWin(value) {
  return `"${String(value).replace(/"/g, "")}"`;
}

function openCommand(target, platform = process.platform) {
  const isUrl = /^https?:\/\//i.test(target);
  const value = isUrl ? target : path.resolve(target);
  if (platform === "win32") {
    return {
      command: "cmd",
      args: ["/c", "start", '""', quoteWin(value)],
      options: {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        windowsVerbatimArguments: true,
      },
    };
  }
  return {
    command: platform === "darwin" ? "open" : "xdg-open",
    args: [value],
    options: { detached: true, stdio: "ignore" },
  };
}

function openFile(target) {
  const spec = openCommand(target);
  const child = execFile(spec.command, spec.args, spec.options);
  child.unref();
}

function writeDashboard(projectRoot, outFile) {
  drainInbox(projectRoot);
  const data = collect(projectRoot);
  const dest =
    outFile || path.join(projectRoot, ".claude", "reports", "dashboard.html");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, renderHtml(data));
  const jsonDest = dest.replace(/\.html$/i, ".json");
  fs.writeFileSync(jsonDest, `${JSON.stringify(data, null, 2)}\n`);
  stageRefs(projectRoot, path.join(path.dirname(dest), "ref"));
  return { dest, jsonDest, data };
}

const MAX_UPLOAD = 20 * 1024 * 1024;

function dashPort(projectRoot) {
  let n = 0;
  for (const ch of path.resolve(projectRoot)) {
    n = (n * 33 + ch.charCodeAt(0)) >>> 0;
  }
  return 18000 + (n % 1000);
}

function dashboardUrl(projectRoot) {
  return `http://127.0.0.1:${dashPort(projectRoot)}/dashboard.html`;
}

function contentType(file) {
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".pdf": "application/pdf",
    }[path.extname(file).toLowerCase()] || "application/octet-stream"
  );
}

function saveUpload(projectRoot, filename, body, outFile) {
  const base = safeBase(filename);
  if (!path.extname(base)) throw new Error("not a file name");
  if (!body || body.length > MAX_UPLOAD) throw new Error("file too large");
  const inbox = inboxDir(projectRoot);
  fs.mkdirSync(inbox, { recursive: true });
  fs.writeFileSync(path.join(inbox, base), body);
  return writeDashboard(projectRoot, outFile);
}

function listenDashboard(projectRoot, dest, port) {
  const root = path.resolve(path.dirname(dest));
  const bound = port == null ? dashPort(projectRoot) : port;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${bound}`);
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    if (req.method === "POST" && url.pathname === "/upload") {
      const chunks = [];
      let size = 0;
      let tooLarge = false;
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_UPLOAD) {
          if (!tooLarge) {
            tooLarge = true;
            res.writeHead(413);
            res.end("too large");
          }
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        if (tooLarge || res.writableEnded) return;
        try {
          saveUpload(
            projectRoot,
            url.searchParams.get("name") || "upload.bin",
            Buffer.concat(chunks),
            dest,
          );
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, refs: listRefs(projectRoot) }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end(err.message);
        }
      });
      return;
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/") rel = "/dashboard.html";
    const file = path.normalize(path.join(root, rel));
    const fromRoot = path.relative(root, file);
    if (!fromRoot || fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": contentType(file) });
    fs.createReadStream(file).pipe(res);
  });
  server.listen(bound, "127.0.0.1");
  return server;
}

function spawnServe(projectRoot) {
  const child = spawn(
    process.execPath,
    [
      path.resolve(__filename),
      "--project",
      path.resolve(projectRoot),
      "--serve",
    ],
    { detached: true, stdio: "ignore", windowsHide: true },
  );
  child.unref();
}

function pause(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* wait for --serve to bind */
  }
}

function openDashboard(projectRoot) {
  spawnServe(projectRoot);
  pause(400);
  const url = dashboardUrl(projectRoot);
  openFile(url);
  return url;
}

function parseArgs(argv) {
  const options = {
    project: process.cwd(),
    out: null,
    open: false,
    serve: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg === "--open") options.open = true;
    else if (arg === "--serve") options.serve = true;
    else if (arg === "--project") {
      i += 1;
      options.project = argv[i];
    } else if (arg === "--out") {
      i += 1;
      options.out = argv[i];
    } else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

function main(argv) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      process.stdout.write(
        "Usage: node scripts/dashboard.js [--project <path>] [--out <file>] [--open] [--serve]\n",
      );
      return EXIT_OK;
    }
    const { dest } = writeDashboard(options.project, options.out);
    if (options.serve) {
      const server = listenDashboard(options.project, dest);
      server.on("error", (err) => {
        if (err.code === "EADDRINUSE") process.exit(0);
        throw err;
      });
      process.stdout.write(`${dashboardUrl(options.project)}\n`);
      return null;
    }
    process.stdout.write(`${dest}\n`);
    if (options.open) openDashboard(options.project);
    return EXIT_OK;
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return EXIT_TOOL_ERROR;
  }
}

if (require.main === module) {
  const code = main(process.argv.slice(2));
  if (code !== null && code !== undefined) process.exitCode = code;
}

module.exports = {
  collect,
  renderHtml,
  writeDashboard,
  parseArgs,
  main,
  saveUpload,
  listenDashboard,
  dashPort,
  dashboardUrl,
  openCommand,
};
