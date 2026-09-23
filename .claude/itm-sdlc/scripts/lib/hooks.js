"use strict";

/**
 * Shared helpers for the two shipped hooks: format, and prompt-change log.
 * No script here hardcodes an extension; adapters own those.
 */

const fs = require("node:fs");
const path = require("node:path");

const TDD_PROMPT = /^\s*\/tdd(?:\s|$)/i;

function readStdinJson(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function fileFromPayload(payload) {
  const value =
    payload.file_path ||
    payload.filePath ||
    payload.path ||
    payload.file ||
    payload.uri ||
    "";
  return stripFileUrl(value);
}

function promptFromPayload(payload) {
  return String(
    payload.prompt || payload.prompt_text || payload.text || "",
  ).trim();
}

const PATH_IN_TEXT =
  /(?:file:\/\/\/?)?(?:[A-Za-z]:[\\/]|\/)[^\s"'<>]+\.(?:png|jpe?g|gif|webp|svg|pdf|docx?|xlsx?|pptx?|zip)$/gi;

function stripFileUrl(value) {
  let text = String(value || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
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

function pathFromAttachment(entry) {
  if (typeof entry === "string") return stripFileUrl(entry);
  if (!entry || typeof entry !== "object") return "";
  return stripFileUrl(
    entry.path ||
      entry.file_path ||
      entry.filePath ||
      entry.uri ||
      entry.url ||
      entry.localPath ||
      entry.filename ||
      "",
  );
}

function isAbsolutePath(file) {
  return path.isAbsolute(file) || /^[A-Za-z]:[\\/]/.test(file);
}

function keepablePath(file, allowRelative) {
  const raw = stripFileUrl(file);
  if (!raw || !path.extname(raw)) return "";
  if (!allowRelative && !isAbsolutePath(raw)) return "";
  const resolved = path.resolve(raw);
  const blocked = `${path.sep}node_modules${path.sep}`;
  const git = `${path.sep}.git${path.sep}`;
  if (resolved.includes(blocked) || resolved.includes(git)) return "";
  try {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }
  } catch {
    return "";
  }
  return "";
}

function attachmentsFromPayload(payload, seen, depth) {
  const walked = seen || new Set();
  const level = depth ?? 0;
  if (!payload || level > 8) return [];
  if (typeof payload === "string") {
    const fromPath = keepablePath(payload, false);
    if (fromPath) return [fromPath];
    const found = [];
    for (const match of payload.matchAll(PATH_IN_TEXT)) {
      const file = keepablePath(match[0], false);
      if (file) found.push(file);
    }
    return found;
  }
  if (typeof payload !== "object" || walked.has(payload)) return [];
  walked.add(payload);
  const found = [];
  if (Array.isArray(payload)) {
    for (const item of payload) {
      found.push(...attachmentsFromPayload(item, walked, level + 1));
    }
    return [...new Set(found)];
  }
  const direct = keepablePath(pathFromAttachment(payload), true);
  if (direct) found.push(direct);
  for (const value of Object.values(payload)) {
    found.push(...attachmentsFromPayload(value, walked, level + 1));
  }
  return [...new Set(found)];
}

function extensionsOf(adapter) {
  const found = [];
  for (const glob of adapter.sourceGlobs ?? []) {
    const match = /\*\.([A-Za-z0-9]+)$/.exec(glob);
    if (match) found.push(`.${match[1].toLowerCase()}`);
  }
  return found;
}

function adapterForFile(file, adapters) {
  const ext = path.extname(file).toLowerCase();
  if (!ext) return null;
  return (
    adapters.find((adapter) => extensionsOf(adapter).includes(ext)) ?? null
  );
}

function formatCommand(file, adapter) {
  const template = adapter?.commands?.format;
  if (!template || !template.includes("{file}")) return null;
  return template.replaceAll("{file}", `"${file.replaceAll('"', '\\"')}"`);
}

function isTddPrompt(prompt) {
  return TDD_PROMPT.test(prompt);
}

function innerPrompt(prompt) {
  const raw = String(prompt || "");
  const query = raw.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
  let text = (query ? query[1] : raw).trim();
  text = text.replace(/^<timestamp>[\s\S]*?<\/timestamp>\s*/i, "").trim();
  return text;
}

function shouldKeepPrompt(prompt) {
  const text = innerPrompt(prompt);
  if (text.length < 12) return false;
  if (/^\s*\//.test(text)) return false;
  return true;
}

function projectPaths(projectRoot) {
  const root = path.resolve(projectRoot);
  const vendored = path.join(root, ".claude", "itm-sdlc");
  const useVendored = fs.existsSync(vendored);
  return {
    root,
    stateDir: useVendored
      ? path.join(vendored, ".hook-state")
      : path.join(root, ".cursor", "hook-state"),
    logFile: useVendored
      ? path.join(root, ".claude", "prompt-changes.md")
      : path.join(root, ".cursor", "prompt-changes.md"),
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

module.exports = {
  TDD_PROMPT,
  readStdinJson,
  fileFromPayload,
  promptFromPayload,
  extensionsOf,
  adapterForFile,
  formatCommand,
  isTddPrompt,
  innerPrompt,
  shouldKeepPrompt,
  projectPaths,
  ensureDir,
  writeJson,
  readJson,
  attachmentsFromPayload,
};
