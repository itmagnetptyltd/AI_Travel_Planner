#!/usr/bin/env node
"use strict";

/**
 * Save an informal working note (polish, screenshot, the words they typed).
 * Not a requirement. Not a change record.
 *
 * Usage:
 *   node scripts/note.js --project <path> --text "..." [--file <path>]...
 */

const {
  listNotes,
  listRefs,
  nextNoteId,
  keepFiles,
  writeNotes,
} = require("./lib/working");

const EXIT_OK = 0;
const EXIT_TOOL_ERROR = 2;

function parseArgs(argv) {
  const options = { project: process.cwd(), text: "", files: [], help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg === "--project") {
      i += 1;
      options.project = argv[i];
    } else if (arg === "--text") {
      i += 1;
      options.text = argv[i] ?? "";
    } else if (arg === "--file") {
      i += 1;
      if (argv[i]) options.files.push(argv[i]);
    } else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

function addNote(projectRoot, text, files) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("missing --text");
  const copied = keepFiles(projectRoot, files);
  const notes = listNotes(projectRoot).slice().reverse();
  const row = {
    id: nextNoteId(listNotes(projectRoot)),
    at: new Date().toISOString(),
    text: trimmed,
    files: copied,
  };
  notes.push(row);
  writeNotes(projectRoot, notes);
  return { note: row, refs: listRefs(projectRoot) };
}

function formatReport(result) {
  const files = result.note.files.length
    ? result.note.files.join(", ")
    : "(none)";
  return [
    `Saved ${result.note.id}`,
    `  ${result.note.text}`,
    `  files: ${files}`,
    "",
    "Shown on the dashboard Others tab. Not a REQ. Not a CHG.",
    "",
  ].join("\n");
}

function main(argv) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      process.stdout.write(
        'Usage: node scripts/note.js --project <path> --text "..." [--file <path>]...\n',
      );
      return EXIT_OK;
    }
    const result = addNote(options.project, options.text, options.files);
    process.stdout.write(formatReport(result));
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
  parseArgs,
  addNote,
  main,
};
