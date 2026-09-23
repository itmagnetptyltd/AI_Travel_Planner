"use strict";

/**
 * Informal working notes and reference files.
 *
 * Not FB / CHG / REQ. A developer polish, a screenshot, the words they typed
 * instead of the long loop. Lives under `.brain/docs/`.
 */

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const REF_DIR = path.join(".brain", "docs", "ref");
const INBOX_DIR = path.join(".brain", "docs", "inbox");
const COMMANDS_FILE = path.join(".brain", "docs", "commands.yaml");

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

function refDir(projectRoot) {
  return path.join(projectRoot, REF_DIR);
}

function inboxDir(projectRoot) {
  return path.join(projectRoot, INBOX_DIR);
}

function commandsPath(projectRoot) {
  return path.join(projectRoot, COMMANDS_FILE);
}

function fileType(name) {
  const ext = path.extname(name).toLowerCase();
  if (IMAGE_EXT.has(ext)) return "Image";
  if (ext === ".pdf") return "PDF";
  if (ext === ".md" || ext === ".txt") return "Text";
  return "File";
}

function iconKind(type) {
  return String(type || "File").toLowerCase();
}

function listRefs(projectRoot) {
  const dir = refDir(projectRoot);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => !name.startsWith("README") && !name.startsWith("."))
    .sort()
    .map((name, index) => {
      const serial =
        (name.match(/^(\d{3})-/) || [])[1] ||
        String(index + 1).padStart(3, "0");
      const type = fileType(name);
      return {
        serial,
        filename: name,
        type,
        kind: iconKind(type),
        path: `${REF_DIR.replace(/\\/g, "/")}/${name}`,
      };
    });
}

function listNotes(projectRoot) {
  const file = commandsPath(projectRoot);
  if (!fs.existsSync(file)) return [];
  let doc;
  try {
    doc = yaml.load(fs.readFileSync(file, "utf8"), {
      schema: yaml.CORE_SCHEMA,
    });
  } catch {
    return [];
  }
  if (!Array.isArray(doc)) return [];
  return doc
    .filter((row) => row && typeof row === "object")
    .map((row) => ({
      id: String(row.id || ""),
      at: String(row.at || ""),
      text: String(row.text || ""),
      files: Array.isArray(row.files) ? row.files.map(String) : [],
    }))
    .reverse();
}

function parsePromptLog(projectRoot) {
  const file = path.join(projectRoot, ".claude", "prompt-changes.md");
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8");
  return text
    .split(/^## /m)
    .slice(1)
    .map((part) => {
      const at = part.split(/\n/, 1)[0].trim();
      const prompt = (part.match(/^Prompt:\s*(.*)$/m) || [])[1] || "";
      return { at, text: prompt.trim() };
    })
    .reverse();
}

function nextSerial(projectRoot) {
  const used = listRefs(projectRoot).map((row) => Number(row.serial) || 0);
  const max = used.length ? Math.max(...used) : 0;
  return String(max + 1).padStart(3, "0");
}

function nextNoteId(notesNewestFirst) {
  const chronological = notesNewestFirst.slice().reverse();
  const last = chronological[chronological.length - 1];
  const n = last && last.id ? Number(String(last.id).replace(/\D/g, "")) : 0;
  return `NOTE-${String((Number.isFinite(n) ? n : 0) + 1).padStart(4, "0")}`;
}

function safeBase(name) {
  const base = path.basename(name).replace(/[^A-Za-z0-9._-]+/g, "-");
  return base.replace(/^-+|-+$/g, "") || "file";
}

function isToolkitRoot(projectRoot) {
  const root = path.resolve(projectRoot);
  return (
    fs.existsSync(path.join(root, "install.js")) &&
    fs.existsSync(path.join(root, "templates", "brain-scaffold"))
  );
}

function cursorProjectSlug(projectRoot) {
  const resolved = path.resolve(projectRoot);
  const win = /^([A-Za-z]):[\\/](.*)$/.exec(resolved);
  if (win) return `${win[1].toLowerCase()}-${win[2].replace(/[\\/]+/g, "-")}`;
  return resolved.replace(/^[\\/]+/, "").replace(/[\\/]+/g, "-");
}

function decodeFolderUri(uri) {
  let text = String(uri || "").trim();
  if (/^file:/i.test(text)) {
    try {
      text = decodeURIComponent(text.replace(/^file:\/\//i, ""));
    } catch {
      text = text.replace(/^file:\/\//i, "");
    }
    if (/^\/[A-Za-z]:/.test(text)) text = text.slice(1);
  }
  return text;
}

function sameProjectPath(a, b) {
  try {
    return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
  } catch {
    return false;
  }
}

function cursorStorageRoots(home) {
  return [
    path.join(home, "AppData", "Roaming", "Cursor", "User", "workspaceStorage"),
    path.join(
      home,
      "Library",
      "Application Support",
      "Cursor",
      "User",
      "workspaceStorage",
    ),
    path.join(home, ".config", "Cursor", "User", "workspaceStorage"),
  ];
}

function cursorAssetDirs(projectRoot) {
  const os = require("node:os");
  const home = os.homedir();
  const root = path.resolve(projectRoot);
  const slug = cursorProjectSlug(root);
  const dirs = [];
  const projectDir = path.join(home, ".cursor", "projects", slug);
  if (fs.existsSync(projectDir)) dirs.push(projectDir);
  for (const storage of cursorStorageRoots(home)) {
    if (!fs.existsSync(storage)) continue;
    let hashes;
    try {
      hashes = fs.readdirSync(storage);
    } catch {
      continue;
    }
    for (const hash of hashes) {
      const folderFile = path.join(storage, hash, "workspace.json");
      let folder = "";
      try {
        const doc = JSON.parse(fs.readFileSync(folderFile, "utf8"));
        folder = decodeFolderUri(doc.folder || "");
      } catch {
        continue;
      }
      if (!folder || !sameProjectPath(folder, root)) continue;
      const images = path.join(storage, hash, "images");
      if (fs.existsSync(images)) dirs.push(images);
    }
  }
  return dirs;
}

function listRecentFiles(dirs, sinceMs, skip) {
  const skipRe = skip || /\.(jsonl?|md)$/i;
  const found = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (name.startsWith(".")) continue;
      const full = path.join(dir, name);
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full);
      else if (
        st.isFile() &&
        st.mtimeMs >= sinceMs &&
        path.extname(name) &&
        !skipRe.test(name)
      ) {
        found.push(full);
      }
    }
  }
  for (const dir of dirs || []) walk(dir);
  return found;
}

function copyToRef(projectRoot, sources) {
  if (isToolkitRoot(projectRoot)) {
    throw new Error(
      "docs/ref is on the client project (the app with .brain/), not the itm-sdlc toolkit. Pass --project <app>.",
    );
  }
  const destDir = refDir(projectRoot);
  fs.mkdirSync(destDir, { recursive: true });
  const copied = [];
  let serial = nextSerial(projectRoot);
  for (const source of sources || []) {
    const abs = path.resolve(source);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      throw new Error(`not a file: ${source}`);
    }
    const destName = `${serial}-${safeBase(abs)}`;
    fs.copyFileSync(abs, path.join(destDir, destName));
    copied.push(destName);
    serial = String(Number(serial) + 1).padStart(3, "0");
  }
  return copied;
}

function listInbox(projectRoot) {
  const dir = inboxDir(projectRoot);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => !name.startsWith("README") && !name.startsWith("."))
    .map((name) => path.join(dir, name))
    .filter((file) => {
      try {
        return fs.statSync(file).isFile();
      } catch {
        return false;
      }
    });
}

function drainInbox(projectRoot) {
  fs.mkdirSync(inboxDir(projectRoot), { recursive: true });
  const sources = listInbox(projectRoot);
  if (!sources.length) return [];
  const copied = copyToRef(projectRoot, sources);
  for (const source of sources) {
    try {
      fs.unlinkSync(source);
    } catch {
      /* still copied */
    }
  }
  return copied;
}

function keepFiles(projectRoot, sources) {
  return [...copyToRef(projectRoot, sources || []), ...drainInbox(projectRoot)];
}

function writeNotes(projectRoot, chronological) {
  const dest = commandsPath(projectRoot);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(
    dest,
    yaml.dump(chronological, { lineWidth: 88, noRefs: true, quotingType: '"' }),
  );
}

function stageRefs(projectRoot, destDir) {
  const dest = path.resolve(destDir);
  const source = path.resolve(refDir(projectRoot));
  if (dest === source) return listRefs(projectRoot).map((row) => row.filename);
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(dest)) {
    if (name.startsWith(".")) continue;
    fs.rmSync(path.join(dest, name), { force: true, recursive: true });
  }
  const copied = [];
  for (const row of listRefs(projectRoot)) {
    const src = path.join(projectRoot, row.path);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(dest, row.filename));
    copied.push(row.filename);
  }
  return copied;
}

module.exports = {
  REF_DIR,
  INBOX_DIR,
  COMMANDS_FILE,
  refDir,
  inboxDir,
  commandsPath,
  fileType,
  iconKind,
  listRefs,
  listNotes,
  parsePromptLog,
  nextSerial,
  nextNoteId,
  safeBase,
  isToolkitRoot,
  cursorProjectSlug,
  cursorAssetDirs,
  listRecentFiles,
  copyToRef,
  listInbox,
  drainInbox,
  keepFiles,
  writeNotes,
  stageRefs,
};
