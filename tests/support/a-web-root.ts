import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { onTestFinished } from 'vitest';

const SCRIPT_BYTES = 400_000;
const STYLE_BYTES = 30_000;

/** A folder holding a built web app the size of a real one: a page that names a script and a stylesheet, each served from /assets. */
export async function aWebRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'trv-web-'));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'assets'));
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Travel Planner</title>' +
      '<script type="module" crossorigin src="/assets/index-abc123.js"></script>' +
      '<link rel="stylesheet" crossorigin href="/assets/index-abc123.css"></head><body><div id="root"></div></body></html>',
  );
  await writeFile(join(root, 'assets', 'index-abc123.js'), `/* ${'x'.repeat(SCRIPT_BYTES)} */`);
  await writeFile(join(root, 'assets', 'index-abc123.css'), `/* ${'y'.repeat(STYLE_BYTES)} */`);
  return root;
}
