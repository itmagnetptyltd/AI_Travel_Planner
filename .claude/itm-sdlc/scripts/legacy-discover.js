#!/usr/bin/env node
"use strict";

/**
 * legacy-discover.js — first-time inventory of an existing (legacy) repo.
 *
 * Walks the live tree and writes a recovered draft brain: inventory, observed
 * constraints, glossary names from disk, BRIEF facts, and one draft REQ per
 * install module. Never status `agreed`. Never one REQ per controller.
 * Never moves folders. Never copies .env or config values.
 *
 * Usage:
 *   node scripts/legacy-discover.js [options]
 *
 * Options:
 *   --project <path>   project root (default: cwd)
 *   --write            write draft brain files (refused if REQs already exist)
 *   --json             machine-readable output
 *   -h, --help
 *
 * Exit codes:
 *   0  reported (and wrote, if --write)
 *   2  could not run, or --write refused
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const yaml = require("js-yaml");
const { globSync } = require("glob");

const { detectAdapters, loadAdapters } = require("./lib/adapters");
const {
  DEFAULT_PATTERNS,
  loadRequirementFiles,
  flatten,
} = require("./lib/requirements");

const EXIT_OK = 0;
const EXIT_TOOL = 2;

const SKIP_DIRS = new Set([
  ".git",
  ".claude",
  ".brain",
  ".github",
  ".cursor",
  ".vs",
  ".idea",
  ".agents",
  ".codex",
  "bin",
  "obj",
  "node_modules",
  "dist",
  "coverage",
  "TestResults",
]);

const GLOB_IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.claude/**",
  "**/.brain/**",
  "**/.github/**",
  "**/.cursor/**",
  "**/.vs/**",
  "**/.idea/**",
  "**/.agents/**",
  "**/.codex/**",
  "**/bin/**",
  "**/obj/**",
  "**/dist/**",
  "**/coverage/**",
  "**/TestResults/**",
];

const QUESTION =
  "This area was inferred from the existing codebase, not from a client brief. What must it still do in production?";
const UNSCOPED_QUESTION =
  "These folders exist on disk but are not in the install --modules list. Which of them are in scope for this project?";
const BRD_QUESTION =
  "No BRD or SRS file was found in the repository. Is the README plus Documentation/ the source of truth until a BRD exists?";

function parseArgs(argv) {
  const options = {
    project: process.cwd(),
    write: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg === "--write") options.write = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--project") {
      i += 1;
      if (!argv[i]) throw new Error("--project requires a value");
      options.project = path.resolve(argv[i]);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function loadInstallState(project) {
  const file = path.join(project, ".brain", "install-state.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function hasGit(project) {
  if (fs.existsSync(path.join(project, ".git"))) return true;
  const r = spawnSync(
    "git",
    ["-C", project, "rev-parse", "--is-inside-work-tree"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  return r.status === 0 && String(r.stdout).trim() === "true";
}

function posixRel(project, abs) {
  return path.relative(project, abs).replace(/\\/g, "/");
}

function listAreas(project) {
  if (!fs.existsSync(project)) return [];
  return fs
    .readdirSync(project, { withFileTypes: true })
    .filter(
      (e) =>
        e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith("."),
    )
    .map((e) => ({ name: e.name }));
}

function globFiles(project, pattern) {
  return globSync(pattern, {
    cwd: project,
    nodir: true,
    ignore: GLOB_IGNORE,
    absolute: true,
    windowsPathsNoEscape: true,
  });
}

function readLimited(file, max = 64_000) {
  try {
    const stat = fs.statSync(file);
    if (stat.size > max) return null;
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function parseCsproj(text, relPath) {
  const sdk = (text.match(/Sdk="([^"]+)"/) || [])[1] || "";
  const tfm =
    (text.match(/<TargetFrameworks?>([^<]+)<\/TargetFrameworks?>/) || [])[1] ||
    "";
  return {
    path: relPath,
    kind: "csproj",
    name: path.basename(relPath, ".csproj"),
    sdk,
    framework: tfm,
  };
}

function parsePackage(text, relPath) {
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  const deps = {
    ...(json.dependencies || {}),
    ...(json.devDependencies || {}),
  };
  const names = Object.keys(deps);
  let ui = "";
  if (names.some((n) => n === "react" || n.startsWith("react-dom")))
    ui = "react";
  if (names.some((n) => n === "@angular/core" || n.startsWith("@angular/"))) {
    ui = "angular";
  }
  return {
    path: relPath,
    kind: "package",
    name: json.name || path.basename(path.dirname(relPath)),
    ui,
  };
}

function parseCompose(text, relPath) {
  let doc;
  try {
    doc = yaml.load(text);
  } catch {
    return { path: relPath, services: [] };
  }
  const services =
    doc && doc.services && typeof doc.services === "object"
      ? Object.keys(doc.services).sort()
      : [];
  return { path: relPath, services };
}

function firstHeading(text) {
  const line =
    String(text)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) || "";
  return line.replace(/^#+\s*/, "").slice(0, 120);
}

function unique(values) {
  return [...new Set(values)];
}

function classifyDoc(relPath) {
  const base = path.basename(relPath).toLowerCase();
  const stem = base.replace(/\.[^.]+$/, "");
  if (
    /(^|[-_. ])(brd|srs|frd)($|[-_. ])/.test(stem) ||
    /business[-_. ]?req/.test(stem)
  ) {
    return "brd";
  }
  if (base === "readme.md") return "readme";
  const posix = relPath.replace(/\\/g, "/").toLowerCase();
  if (posix.includes("design-specification") || /\/design\//.test(posix)) {
    return "design";
  }
  if (stem.includes("overview")) return "overview";
  return "doc";
}

function skipDoc(relPath) {
  const p = relPath.replace(/\\/g, "/").toLowerCase();
  if (p.includes("/api/")) return true;
  if (p.includes("node_modules")) return true;
  if (p.includes("/bin/") || p.includes("/obj/")) return true;
  return false;
}

function walkDocuments(project) {
  const found = unique([
    ...globFiles(project, "README.md"),
    ...globFiles(project, "**/*BRD*.md"),
    ...globFiles(project, "**/*BRD*.pdf"),
    ...globFiles(project, "**/*BRD*.docx"),
    ...globFiles(project, "**/*SRS*.md"),
    ...globFiles(project, "**/*SRS*.pdf"),
    ...globFiles(project, "**/*SRS*.docx"),
    ...globFiles(project, "Documentation/**/*.md"),
    ...globFiles(project, "docs/*.md"),
    ...globFiles(project, "docs/*.pdf"),
    ...globFiles(project, "docs/*.docx"),
  ])
    .map((abs) => posixRel(project, abs))
    .filter((relPath) => !skipDoc(relPath));

  return found.sort().map((relPath) => {
    const abs = path.join(project, relPath);
    const kind = classifyDoc(relPath);
    let title = path.basename(relPath);
    if (path.extname(relPath).toLowerCase() === ".md") {
      const text = readLimited(abs, 8000);
      if (text) title = firstHeading(text) || title;
    }
    return { path: relPath, kind, title };
  });
}

function shouldCopyDoc(doc) {
  if (doc.kind === "brd") return true;
  if (doc.kind === "readme" && !doc.path.includes("/")) return true;
  const p = doc.path.replace(/\\/g, "/");
  if (p.startsWith("Documentation/articles/")) return true;
  if (/^docs\/[^/]+\.(md|pdf|docx)$/i.test(p)) return true;
  return false;
}

function copyHarvestedDocs(project, documents) {
  const destDir = path.join(project, ".brain", "docs", "ref");
  fs.mkdirSync(destDir, { recursive: true });
  const copied = [];
  for (const doc of documents.filter(shouldCopyDoc)) {
    const src = path.join(project, doc.path);
    if (!fs.existsSync(src)) continue;
    let size = 0;
    try {
      size = fs.statSync(src).size;
    } catch {
      continue;
    }
    if (size > 1_000_000) continue;
    const destName = `legacy-${doc.path.replace(/[\\/]/g, "-")}`;
    fs.copyFileSync(src, path.join(destDir, destName));
    copied.push({ ...doc, ref: `.brain/docs/ref/${destName}` });
  }
  return copied;
}

function extractSection(md, heading) {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, "im");
  const match = String(md).match(re);
  if (!match) return "";
  const rest = String(md).slice(match.index + match[0].length);
  const next = rest.search(/^##\s+/m);
  const body = (next < 0 ? rest : rest.slice(0, next)).trim();
  return body.slice(0, 2500);
}

function extractLead(md, maxChars = 1500) {
  const lines = String(md).split(/\r?\n/);
  const out = [];
  let started = false;
  for (const line of lines) {
    if (!started) {
      if (/^#\s+/.test(line) || !line.trim()) continue;
      started = true;
    }
    if (/^##\s+/.test(line)) break;
    out.push(line);
    if (out.join("\n").length >= maxChars) break;
  }
  return out.join("\n").trim().slice(0, maxChars);
}

function writePicture(date, project, inventory, copied) {
  const readmeDoc = (inventory.documents || []).find(
    (d) => d.kind === "readme" && !d.path.includes("/"),
  );
  const readmeText = readmeDoc
    ? readLimited(path.join(project, readmeDoc.path), 40_000) || ""
    : "";
  const brds = (inventory.documents || []).filter((d) => d.kind === "brd");
  const lead = extractLead(readmeText);
  const architecture = extractSection(readmeText, "High-Level Architecture");
  const services = extractSection(readmeText, "Services");
  const structure = extractSection(readmeText, "Repository Structure");
  const later =
    /BRD|SRS/.test(readmeText) && /added later|can be added/i.test(readmeText);

  const lines = [
    `# Recovered project picture — ${date}`,
    "",
    "Inferred from documents **already in this repository**. **Not agreed.**",
    "Read this before `/decompose` on a new feature.",
    "",
    "## BRD / SRS",
    "",
  ];
  if (brds.length) {
    lines.push("Found in the repo (copied into `.brain/docs/ref/`):");
    lines.push("");
    for (const b of brds) {
      const hit = copied.find((c) => c.path === b.path);
      lines.push(
        `- \`${b.path}\`${hit ? ` → \`${hit.ref}\`` : ""} — ${b.title}`,
      );
    }
  } else {
    lines.push("**No BRD or SRS file** was found in this repository.");
    if (later) {
      lines.push("");
      lines.push(
        "The README says a business BRD/SRS can be added later. Until then the closest sources are README and Documentation/.",
      );
    }
  }
  lines.push("", "## What this system is", "");
  lines.push(lead || "_No README lead found._", "");
  if (architecture) {
    lines.push("## How it is put together", "", architecture, "");
  }
  if (structure) {
    lines.push("## Repository structure (from README)", "", structure, "");
  }
  if (services) {
    lines.push("## Services (from README)", "", services, "");
  }
  lines.push("## Harvested documents", "");
  if (!copied.length) {
    lines.push("None copied.", "");
  } else {
    for (const c of copied) {
      lines.push(`- \`${c.path}\` (${c.kind}) → \`${c.ref}\``);
    }
    lines.push("");
  }
  lines.push(
    "## Layout",
    "",
    `See \`inventory.yaml\` for ${inventory.projects.length} projects and compose services.`,
    "",
  );
  return lines.join("\n");
}

function walkInventory(project, modules = []) {
  const areas = listAreas(project);
  const solutions = globFiles(project, "**/*.sln").map((f) =>
    posixRel(project, f),
  );
  const projects = globFiles(project, "**/*.csproj").map((abs) => {
    const relPath = posixRel(project, abs);
    const text = readLimited(abs);
    if (text == null) {
      return {
        path: relPath,
        kind: "csproj",
        name: path.basename(relPath, ".csproj"),
        sdk: "",
        framework: "",
      };
    }
    return parseCsproj(text, relPath);
  });
  const packages = globFiles(project, "**/package.json").map((abs) => {
    const relPath = posixRel(project, abs);
    const text = readLimited(abs);
    if (text == null) {
      return {
        path: relPath,
        kind: "package",
        name: path.basename(path.dirname(relPath)),
        ui: "",
      };
    }
    return parsePackage(text, relPath);
  });
  const composeFiles = unique([
    ...globFiles(project, "**/docker-compose*.yml"),
    ...globFiles(project, "**/docker-compose*.yaml"),
  ]);
  const compose = composeFiles.map((abs) => {
    const relPath = posixRel(project, abs);
    const text = readLimited(abs);
    if (text == null) return { path: relPath, services: [] };
    return parseCompose(text, relPath);
  });
  const readmes = globFiles(project, "**/README.md")
    .map((abs) => posixRel(project, abs))
    .filter((relPath) => relPath.split("/").length <= 2)
    .map((relPath) => {
      const text = readLimited(path.join(project, relPath), 8000);
      return { path: relPath, title: text ? firstHeading(text) : "" };
    });
  const configFiles = globFiles(project, "**/appsettings*.json").map((abs) =>
    posixRel(project, abs),
  );

  const matchedNames = new Set();
  for (const module of modules) {
    const area = matchArea(module, areas);
    if (area) matchedNames.add(area.name);
  }
  const hasCode = new Set();
  for (const row of [...projects, ...packages]) {
    const top = row.path.split("/")[0];
    if (top && !top.endsWith(".csproj") && !top.endsWith(".json")) {
      hasCode.add(top);
    }
    if (row.path === path.basename(row.path)) {
      /* root-level file — not an area */
    }
  }
  const unscoped = areas
    .map((a) => a.name)
    .filter((name) => {
      if (matchedNames.has(name)) return false;
      if (modules.some((m) => m.toLowerCase() === name.toLowerCase())) {
        return false;
      }
      return hasCode.has(name);
    })
    .sort();

  return {
    solutions: solutions.sort(),
    projects,
    packages,
    compose,
    readmes,
    configFiles,
    areas,
    unscoped,
    documents: walkDocuments(project),
  };
}

function onlyLegacyDrafts(reqs) {
  if (!reqs.length) return false;
  return reqs.every((r) => {
    const source = String(r.source || "");
    return r.status === "draft" && source.includes("legacy-discover");
  });
}

function existingRequirements(project) {
  const { documents } = loadRequirementFiles(DEFAULT_PATTERNS, project);
  return flatten(documents)
    .map((row) => row.requirement)
    .filter((r) => r && r.id);
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function addMonthsUtc(dateIso, months) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function artifactsForModule(module, inventory) {
  const area = matchArea(module, inventory.areas);
  const prefixes = new Set();
  if (area) prefixes.add(`${area.name}/`);
  prefixes.add(`${module}/`);
  const want = [...prefixes].map((p) => p.toLowerCase());
  const hit = (relPath) =>
    want.some((p) => relPath.toLowerCase().startsWith(p));
  return {
    areaName: area ? area.name : module,
    projects: inventory.projects.filter((p) => hit(p.path)),
    packages: inventory.packages.filter((p) => hit(p.path)),
  };
}

function draftRequirement(module, observed) {
  const files = [
    ...observed.projects.map((p) => p.path),
    ...observed.packages.map((p) => p.path),
  ];
  const listed = files.length ? files.join(", ") : "no matching project files";
  const title = `Existing ${observed.areaName} area inferred from the repository — not yet client-agreed`;
  const clipped = title.length > 120 ? title.slice(0, 117) + "..." : title;
  return {
    id: `REQ-${module}-001`,
    title: clipped,
    module,
    priority: "must",
    status: "draft",
    version: 1,
    source: `legacy-discover ${todayUtc()}, inferred from folder ${observed.areaName}/ — not a client brief`,
    rationale: `Observed on disk (not a client brief): ${listed}. The client has not agreed this text.`,
    acceptance: [
      {
        given: "The production system as it exists today",
        when: `The ${observed.areaName} area is used`,
        then: `Observed artifacts remain the starting point: ${listed}. The client has not confirmed scope.`,
      },
    ],
    ambiguities: [QUESTION],
  };
}

function matchArea(module, areas) {
  const want = module.toLowerCase();
  return (
    areas.find((a) => a.name.toLowerCase() === want) ||
    areas.find((a) => a.name.toLowerCase().startsWith(want)) ||
    areas.find((a) => want.startsWith(a.name.toLowerCase()))
  );
}

function buildReport(project) {
  const state = loadInstallState(project);
  const reqs = existingRequirements(project);
  const adapters = detectAdapters(project, loadAdapters()).map((a) => a.id);
  const areas = listAreas(project);
  const git = hasGit(project);
  const modules = Array.isArray(state?.modules) ? state.modules : [];
  const firstTime = reqs.length === 0;
  const refresh = onlyLegacyDrafts(reqs);
  const inventory = walkInventory(project, modules);
  const legacy =
    git &&
    (adapters.length > 0 ||
      areas.length > 0 ||
      inventory.projects.length > 0 ||
      inventory.packages.length > 0);

  let refuse = null;
  if (!state)
    refuse =
      "itm-sdlc is not installed here (.brain/install-state.json missing)";
  else if (!firstTime && !refresh)
    refuse = `brain already has ${reqs.length} requirement(s) — use /decompose for new asks`;
  else if (!legacy)
    refuse =
      "no git history with source — this does not look like a legacy project";

  return {
    ok: refuse === null,
    refuse,
    firstTime,
    refresh,
    legacy,
    git,
    modules,
    adapters,
    areas,
    inventory,
    requirementCount: reqs.length,
  };
}

function writeInventoryYaml(inventory) {
  return yaml.dump(
    {
      recovered: true,
      agreed: false,
      solutions: inventory.solutions,
      projects: inventory.projects,
      packages: inventory.packages,
      compose: inventory.compose,
      readmes: inventory.readmes,
      configFiles: inventory.configFiles,
      areas: inventory.areas.map((a) => a.name),
      unscoped: inventory.unscoped,
      documents: inventory.documents || [],
    },
    { lineWidth: 100 },
  );
}

function writeConstraint(date, inventory) {
  const review = addMonthsUtc(date, 6);
  const lines = [
    "# Observed repository layout (inferred, not a client decision)",
    "",
    `- **Discovered:** ${date}`,
    `- **Review by:** ${review}`,
    "- **Source:** `/legacy-discover` walk of this repository. Not client words.",
    "- **Affects:** whole tree — recovered layout only",
    "",
    "## The constraint",
    "The live system is this tree as found. Folders were not moved into `src/`.",
    "",
    inventory.solutions.length
      ? `Solutions: ${inventory.solutions.join(", ")}.`
      : "No `.sln` files found.",
    "",
    inventory.projects.length
      ? `C# projects (${inventory.projects.length}): ${inventory.projects.map((p) => p.path).join(", ")}.`
      : "No `.csproj` files found.",
    "",
    inventory.packages.length
      ? `package.json (${inventory.packages.length}): ${inventory.packages.map((p) => p.path).join(", ")}.`
      : "No `package.json` files found.",
    "",
    inventory.compose.length
      ? inventory.compose
          .map(
            (c) =>
              `\`${c.path}\` services: ${c.services.join(", ") || "(none)"}.`,
          )
          .join("\n")
      : "No docker-compose files found.",
    "",
    inventory.configFiles.length
      ? `Config files present (values not copied): ${inventory.configFiles.join(", ")}.`
      : "No appsettings*.json files found.",
    "",
    inventory.unscoped.length
      ? `Folders with code that are not in --modules: ${inventory.unscoped.join(", ")}.`
      : "Every coded folder matched an install module.",
    "",
    "## How we know",
    "File names and project files on disk. Secrets and connection strings were not copied.",
    "",
    "## What we do about it",
    "Treat this as the starting map. The client still confirms scope. Next change goes through `/decompose`.",
    "",
  ];
  return lines.join("\n");
}

function writeGlossarySection(inventory) {
  const lines = [
    "",
    "## Recovered from repository (legacy-discover, not agreed)",
    "",
    "These names exist as folders or projects on disk. They are **not** client-defined glossary terms.",
    "",
  ];
  const names = unique([
    ...inventory.areas.map((a) => a.name),
    ...inventory.projects.map((p) => p.name),
  ]).sort();
  for (const name of names) {
    const projects = inventory.projects
      .filter(
        (p) =>
          p.name === name ||
          p.path.split("/")[0].toLowerCase() === name.toLowerCase(),
      )
      .map((p) => p.path);
    const extra = projects.length ? ` — ${projects.join(", ")}` : "";
    const unscoped = inventory.unscoped.some(
      (u) => u.toLowerCase() === name.toLowerCase(),
    )
      ? " (not in install --modules)"
      : "";
    lines.push(`- **${name}** — folder or project on disk${extra}${unscoped}`);
  }
  lines.push("");
  return lines.join("\n");
}

function writeBrief(date, inventory, copied = []) {
  const titles = inventory.readmes
    .map((r) => r.title)
    .filter(Boolean)
    .join("; ");
  const brds = (inventory.documents || []).filter((d) => d.kind === "brd");
  const lines = [
    "",
    `## Source brief — ${date} (legacy-discover)`,
    "",
    "Received: inferred from the existing repository. Not client words.",
    "",
    titles ? `> ${titles}` : "> No README title found.",
    "",
    "Read `.brain/picture.md` before a new feature. That is the recovered picture.",
    "",
    brds.length
      ? `BRD/SRS files found: ${brds.map((b) => b.path).join(", ")}.`
      : "No BRD or SRS file found in the repository.",
    "",
    copied.length
      ? `Harvested into docs/ref: ${copied.map((c) => c.ref).join(", ")}.`
      : "No documents copied into docs/ref.",
    "",
    "### Observed layout",
    "",
    `- Solutions: ${inventory.solutions.join(", ") || "none"}`,
    `- C# projects: ${inventory.projects.map((p) => p.path).join(", ") || "none"}`,
    `- package.json: ${inventory.packages.map((p) => p.path).join(", ") || "none"}`,
    `- Compose: ${inventory.compose.map((c) => `${c.path} [${c.services.join(", ")}]`).join("; ") || "none"}`,
    `- Unscoped folders (code present, not in --modules): ${inventory.unscoped.join(", ") || "none"}`,
    "",
    "Nothing here is agreed. See `.brain/picture.md` and `.brain/inventory.yaml`.",
    "",
  ];
  return lines.join("\n");
}

function writeBrain(project, report) {
  const date = todayUtc();
  const inventory = report.inventory || walkInventory(project, report.modules);
  const reqDir = path.join(project, ".brain", "requirements");
  const sessionDir = path.join(project, ".brain", "sessions");
  const constraintDir = path.join(project, ".brain", "constraints");
  fs.mkdirSync(reqDir, { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.mkdirSync(constraintDir, { recursive: true });

  const written = [];
  const drafts = [];

  const copied = copyHarvestedDocs(project, inventory.documents || []);
  for (const c of copied) written.push(c.ref);

  const picturePath = path.join(project, ".brain", "picture.md");
  fs.writeFileSync(picturePath, writePicture(date, project, inventory, copied));
  written.push(".brain/picture.md");

  const inventoryPath = path.join(project, ".brain", "inventory.yaml");
  fs.writeFileSync(
    inventoryPath,
    `# Recovered by /legacy-discover on ${date}. Not agreed.\n` +
      writeInventoryYaml(inventory),
  );
  written.push(".brain/inventory.yaml");

  const constraintPath = path.join(constraintDir, "observed-layout.md");
  fs.writeFileSync(constraintPath, writeConstraint(date, inventory));
  written.push(".brain/constraints/observed-layout.md");

  const glossaryPath = path.join(project, ".brain", "glossary.md");
  const glossaryBit = writeGlossarySection(inventory);
  if (!fs.existsSync(glossaryPath)) {
    fs.writeFileSync(
      glossaryPath,
      `# Glossary\n\nTerms recovered from disk. Not client-agreed.\n${glossaryBit}`,
    );
  } else if (
    !fs.readFileSync(glossaryPath, "utf8").includes("Recovered from repository")
  ) {
    fs.appendFileSync(glossaryPath, glossaryBit);
  }
  written.push(".brain/glossary.md");

  const indexPath = path.join(project, ".brain", "index.md");
  if (fs.existsSync(indexPath)) {
    const index = fs.readFileSync(indexPath, "utf8");
    if (!index.includes("picture.md")) {
      fs.appendFileSync(
        indexPath,
        `\n## Recovered picture (legacy-discover)\n\nRead \`picture.md\` before a new feature. Then \`inventory.yaml\`. Inferred from disk. Not client-agreed.\n`,
      );
      written.push(".brain/index.md");
    }
  }

  for (const module of report.modules) {
    const observed = artifactsForModule(module, inventory);
    const req = draftRequirement(module, observed);
    drafts.push(req);
    const file = path.join(reqDir, `${module.toLowerCase()}.yaml`);
    const body =
      `# Inferred by /legacy-discover on ${date}. All draft. None agreed.\n` +
      yaml.dump([req], { lineWidth: 100 });
    fs.writeFileSync(file, body);
    written.push(path.relative(project, file).replace(/\\/g, "/"));
  }

  const session = path.join(sessionDir, `${date}-legacy-discover.md`);
  const sessionBody = [
    `# Legacy discover — ${date}`,
    "",
    "Recovered from the repository. **Not** a client brief. Nothing here is `agreed`.",
    "",
    `- Adapters: ${report.adapters.join(", ") || "none"}`,
    `- Modules: ${report.modules.join(", ") || "none"}`,
    `- Areas: ${inventory.areas.map((a) => a.name).join(", ") || "none"}`,
    `- Solutions: ${inventory.solutions.join(", ") || "none"}`,
    `- Projects: ${inventory.projects.length}`,
    `- package.json: ${inventory.packages.length}`,
    `- Unscoped: ${inventory.unscoped.join(", ") || "none"}`,
    `- Documents: ${(inventory.documents || []).length}`,
    `- BRD/SRS: ${
      (inventory.documents || [])
        .filter((d) => d.kind === "brd")
        .map((d) => d.path)
        .join(", ") || "none found"
    }`,
    "",
    "Picture: `.brain/picture.md`. Map: `.brain/inventory.yaml`.",
    "",
    "Next: send the questions in `AMBIGUITIES.md` to the client. Then `/resolve-ambiguities`.",
    "Then `/decompose` only the next change — do not invent the rest of production.",
    "",
  ].join("\n");
  fs.writeFileSync(session, sessionBody);
  written.push(path.relative(project, session).replace(/\\/g, "/"));

  const briefPath = path.join(reqDir, "BRIEF.md");
  const briefBit = writeBrief(date, inventory, copied);
  const briefExisting = fs.existsSync(briefPath)
    ? fs.readFileSync(briefPath, "utf8")
    : "";
  const briefMarker = "## Source brief —";
  const briefIdx = briefExisting.indexOf(briefMarker);
  fs.writeFileSync(
    briefPath,
    briefIdx >= 0
      ? briefExisting.slice(0, briefIdx).trimEnd() + "\n" + briefBit
      : briefExisting + briefBit,
  );
  written.push(".brain/requirements/BRIEF.md");

  const ambPath = path.join(reqDir, "AMBIGUITIES.md");
  const ambBit = [
    "",
    `## ${QUESTION}`,
    "",
    `- **Affects:** ${drafts.map((d) => d.id).join(", ") || "none"}`,
    "- **Raised by:** `/legacy-discover` (inferred from layout, not the client).",
    "- **Question for the client:** For each inferred area, what must still be true in production, and which area do we decompose first?",
    "",
  ];
  if (!(inventory.documents || []).some((d) => d.kind === "brd")) {
    ambBit.push(
      `## ${BRD_QUESTION}`,
      "",
      "- **Affects:** recovered picture, next `/decompose`",
      "- **Raised by:** `/legacy-discover` (no BRD/SRS filename in the tree).",
      "- **Question for the client:** Confirm README + Documentation/ as the brief until a BRD is supplied.",
      "",
    );
  }
  if (inventory.unscoped.length) {
    ambBit.push(
      `## ${UNSCOPED_QUESTION}`,
      "",
      `- **Affects:** ${inventory.unscoped.join(", ")}`,
      "- **Raised by:** `/legacy-discover` (folders with code not in --modules).",
      `- **Question for the client:** Are ${inventory.unscoped.join(", ")} in scope?`,
      "",
    );
  }
  const ambExisting = fs.existsSync(ambPath)
    ? fs.readFileSync(ambPath, "utf8")
    : "";
  const ambIdx = ambExisting.indexOf(`## ${QUESTION}`);
  fs.writeFileSync(
    ambPath,
    ambIdx >= 0
      ? ambExisting.slice(0, ambIdx).trimEnd() + "\n" + ambBit.join("\n")
      : ambExisting + ambBit.join("\n"),
  );
  written.push(".brain/requirements/AMBIGUITIES.md");

  const ansPath = path.join(reqDir, "ANSWERS.md");
  if (
    !fs.existsSync(ansPath) ||
    !fs.readFileSync(ansPath, "utf8").includes(QUESTION)
  ) {
    const header = fs.existsSync(ansPath)
      ? ""
      : "# Answers\n\nPaste the client's reply under each question. Then `/resolve-ambiguities`.\n";
    fs.appendFileSync(ansPath, `${header}\n## ${QUESTION}\n\n\n`);
    written.push(".brain/requirements/ANSWERS.md");
  }

  return { written, drafts: drafts.map((d) => d.id), inventory };
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    process.exitCode = EXIT_TOOL;
    return;
  }

  if (options.help) {
    console.log(`Usage: node scripts/legacy-discover.js [--project <path>] [--write] [--json]

First-time inventory of a live/legacy repo after install.
Walks the tree. Writes a recovered draft brain. Never agrees anything.
Never moves source folders. Never copies secrets.
`);
    return;
  }

  const report = buildReport(options.project);

  if (options.write) {
    if (!report.ok) {
      if (options.json) {
        console.log(JSON.stringify({ ...report, written: [] }, null, 2));
      } else {
        console.error(`legacy-discover: refused — ${report.refuse}`);
      }
      process.exitCode = EXIT_TOOL;
      return;
    }
    const result = writeBrain(options.project, report);
    report.written = result.written;
    report.drafts = result.drafts;
    report.inventory = result.inventory;
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (!report.ok) {
    console.log(`legacy-discover: ${report.refuse}`);
    process.exitCode = report.refuse.includes("not installed")
      ? EXIT_TOOL
      : EXIT_OK;
    return;
  }

  const inv = report.inventory || { projects: [], packages: [], unscoped: [] };
  console.log("itm-sdlc | legacy-discover");
  console.log(`  first-time  ${report.firstTime}`);
  console.log(`  legacy      ${report.legacy}`);
  console.log(`  adapters    ${report.adapters.join(", ") || "none"}`);
  console.log(`  modules     ${report.modules.join(", ") || "none"}`);
  console.log(
    `  areas       ${(report.areas || []).map((a) => a.name).join(", ") || "none"}`,
  );
  console.log(`  projects    ${inv.projects.length}`);
  console.log(`  packages    ${inv.packages.length}`);
  console.log(`  unscoped    ${(inv.unscoped || []).join(", ") || "none"}`);
  if (report.written) {
    console.log(`  wrote       ${report.written.join(", ")}`);
    console.log(
      `  drafts      ${report.drafts.join(", ")}  (all draft — client has not agreed)`,
    );
  } else {
    console.log(
      "  (pass --write to create the recovered draft brain on a record branch)",
    );
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message || err);
    process.exitCode = EXIT_TOOL;
  }
}

module.exports = { buildReport, writeBrain, parseArgs, walkInventory };
