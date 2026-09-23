#!/usr/bin/env node
"use strict";

/**
 * Copy attached files into .brain/docs/ref/. No note.
 *
 * Usage:
 *   node scripts/keep-ref.js --project <path> [--file <path>]...
 *
 * --file is optional. Files sitting in .brain/docs/inbox/ are always drained.
 */

const { keepFiles } = require("./lib/working");

const EXIT_OK = 0;
const EXIT_TOOL_ERROR = 2;

function parseArgs(argv) {
  const options = { project: process.cwd(), files: [], help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg === "--project") {
      i += 1;
      options.project = argv[i];
    } else if (arg === "--file") {
      i += 1;
      if (argv[i]) options.files.push(argv[i]);
    } else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

function main(argv) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      process.stdout.write(
        "Usage: node scripts/keep-ref.js --project <path> [--file <path>]...\n",
      );
      return EXIT_OK;
    }
    const copied = keepFiles(options.project, options.files);
    process.stdout.write(
      copied.length
        ? copied.map((name) => `.brain/docs/ref/${name}`).join("\n") + "\n"
        : "none\n",
    );
    return EXIT_OK;
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return EXIT_TOOL_ERROR;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { parseArgs, main };
