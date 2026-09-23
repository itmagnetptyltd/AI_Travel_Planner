#!/usr/bin/env node
"use strict";

/**
 * Run belt B — real browser tests (Playwright / pytest-playwright).
 *
 * Usage:
 *   node scripts/run-browsertest.js [--project <path>] [--headed|--headless]
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { detectAdapters } = require("./lib/adapters");

const EXIT_OK = 0;
const EXIT_TOOL_ERROR = 2;

function parseArgs(argv) {
  const options = {
    project: process.cwd(),
    headed: true,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg === "--headed") options.headed = true;
    else if (arg === "--headless") options.headed = false;
    else if (arg === "--project") {
      i += 1;
      options.project = argv[i];
    } else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

function pythonExe(projectRoot) {
  const win = path.join(projectRoot, ".venv", "Scripts", "python.exe");
  const nix = path.join(projectRoot, ".venv", "bin", "python");
  if (fs.existsSync(win)) return win;
  if (fs.existsSync(nix)) return nix;
  return null;
}

function quote(value) {
  const text = String(value);
  if (/\s/.test(text) && !/^".*"$/.test(text)) return `"${text}"`;
  return text;
}

function browserCommand(base, options = {}) {
  let cmd = String(base || "").trim();
  if (!cmd) throw new Error("adapter has no commands.e2e");
  const python = options.python;
  if (python && /^pytest\b/.test(cmd)) cmd = `"${python}" -m ${cmd}`;
  if (options.headed && !/(^|\s)--headed(\s|$)/.test(cmd)) {
    cmd = `${cmd} --headed`;
  }
  return cmd;
}

function installChromium(projectRoot, adapter) {
  if (adapter.id === "python") {
    const py = pythonExe(projectRoot) || "python";
    spawnSync(`${quote(py)} -m playwright install chromium`, {
      cwd: projectRoot,
      shell: true,
      stdio: "inherit",
    });
    return;
  }
  if (adapter.id === "javascript" || adapter.id === "typescript") {
    spawnSync("npx --yes playwright install chromium", {
      cwd: projectRoot,
      shell: true,
      stdio: "inherit",
    });
  }
}

function runBrowserTests(projectRoot, headed) {
  const adapters = detectAdapters(projectRoot).filter(
    (adapter) => adapter.commands && adapter.commands.e2e,
  );
  if (!adapters.length) {
    throw new Error(
      "no adapter declared commands.e2e (belt B). This project has no browser-test command.",
    );
  }
  for (const adapter of adapters) {
    installChromium(projectRoot, adapter);
    const cmd = browserCommand(adapter.commands.e2e, {
      headed,
      python: adapter.id === "python" ? pythonExe(projectRoot) : null,
    });
    process.stdout.write(`Belt B (${adapter.id}): ${cmd}\n`);
    const result = spawnSync(cmd, {
      cwd: projectRoot,
      shell: true,
      stdio: "inherit",
    });
    const code = result.status == null ? 1 : result.status;
    if (code !== 0) return code;
  }
  return EXIT_OK;
}

function main(argv) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      process.stdout.write(
        "Usage: node scripts/run-browsertest.js [--project <path>] [--headed|--headless]\n",
      );
      return EXIT_OK;
    }
    return runBrowserTests(path.resolve(options.project), options.headed);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return EXIT_TOOL_ERROR;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  parseArgs,
  browserCommand,
  pythonExe,
  runBrowserTests,
  main,
};
