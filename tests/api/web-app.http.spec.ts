import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildTestApp } from '../support/build-test-app';

const INDEX = '<!doctype html><title>AI Travel Planner</title><div id="root"></div>';

function aBuiltWebApp(): string {
  const root = mkdtempSync(join(tmpdir(), 'trv-web-'));
  writeFileSync(join(root, 'index.html'), INDEX);
  return root;
}

describe('the application serving its web app', () => {
  // @covers REQ-TRV-058@v1
  test('starts, and gives the page for a shared link the same as any page of the app, so the browser can open it', async () => {
    const { app } = await buildTestApp({ webRoot: aBuiltWebApp() });

    const page = await app.inject({ method: 'GET', url: '/shared/k3Jx9QmZr2Vb7LwNfT5HcYa0DsUeGp8iOqXn1RhMtAo' });

    expect(page.statusCode).toBe(200);
    expect(page.body).toBe(INDEX);
  });

  // @covers REQ-TRV-058@v1
  test('answers an unknown address under /api with a plain 404 that does not repeat the address', async () => {
    const { app } = await buildTestApp({ webRoot: aBuiltWebApp() });

    const missing = await app.inject({ method: 'GET', url: '/api/shared-secret-token-in-an-unknown-path' });

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ code: 'NOT_FOUND' });
  });
});

describe('the application with no web app to serve', () => {
  // @covers REQ-TRV-058@v1
  test('answers an unknown address with the same plain 404, and does not repeat the address', async () => {
    const { app } = await buildTestApp();

    const missing = await app.inject({ method: 'GET', url: '/shared/k3Jx9QmZr2Vb7LwNfT5HcYa0DsUeGp8iOqXn1RhMtAo' });

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ code: 'NOT_FOUND' });
    expect(missing.body).not.toContain('k3Jx9Q');
  });
});
