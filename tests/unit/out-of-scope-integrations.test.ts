import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildTestApp } from '../support/build-test-app';
import { FEATURE_NAMES, wordsInName } from '../support/out-of-scope-words';
import { sourceFilesUnder } from '../support/service-layer-boundaries';

/**
 * What the application is built from and what it can reach, for the nine features that are not part of this build (BRD §28).
 * A library, an address, a route, a file or a folder for one of them is a decision, so it fails here until a requirement says otherwise.
 */
const ROOT = '.';
const packageSchema = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional(),
  scripts: z.record(z.string(), z.string()).optional(),
});
const packageJson = packageSchema.parse(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')));
const DEPENDENCIES = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies, ...packageJson.peerDependencies, ...packageJson.optionalDependencies });
const namesMatching = (pattern: RegExp): string[] => DEPENDENCIES.filter((name) => pattern.test(name));

const LIBRARIES = {
  weather: /weather|meteo|accuweather|darksky|tomorrow\.io/i,
  'flights and hotels': /amadeus|skyscanner|sabre|travelport|duffel|hotelbeds|tripadvisor|kiwi\.com/i,
  maps: /leaflet|mapbox|maplibre|googlemaps|google-maps|openlayers|react-map-gl|mapkit|^ol$|here-maps/i,
  calendars: /^ics$|ical|caldav|fullcalendar|googleapis|microsoft-graph/i,
  languages: /i18n|intl|formatjs|lingui|polyglot|translate|deepl/i,
  voice: /speech|voice|whisper|elevenlabs|deepgram|assemblyai|recordrtc|wavesurfer/i,
  'a mobile application': /react-native|^@?expo(-|\/|$)|@capacitor|cordova|@ionic|nativescript|flutter|@tauri-apps/i,
  'booking and payment': /viator|getyourguide|airbnb|expedia|booking|stripe|paypal|braintree|adyen|square/i,
} as const;

describe('what the application is built from', () => {
  // @covers REQ-TRV-082@v1
  it('has no weather library', () => {
    expect(namesMatching(LIBRARIES.weather)).toEqual([]);
  });

  // @covers REQ-TRV-083@v1
  it('has no flight or hotel library', () => {
    expect(namesMatching(LIBRARIES['flights and hotels'])).toEqual([]);
  });

  // @covers REQ-TRV-084@v1
  it('has no map library', () => {
    expect(namesMatching(LIBRARIES.maps)).toEqual([]);
  });

  // @covers REQ-TRV-085@v1
  it('has no calendar library', () => {
    expect(namesMatching(LIBRARIES.calendars)).toEqual([]);
  });

  // @covers REQ-TRV-086@v1
  it('has no library for other languages', () => {
    expect(namesMatching(LIBRARIES.languages)).toEqual([]);
  });

  // @covers REQ-TRV-087@v1
  it('has no speech or voice library', () => {
    expect(namesMatching(LIBRARIES.voice)).toEqual([]);
  });

  // @covers REQ-TRV-088@v1
  it('has no library for building a mobile application', () => {
    expect(namesMatching(LIBRARIES['a mobile application'])).toEqual([]);
  });

  // @covers REQ-TRV-090@v1
  it('has no booking provider and no way to take a payment', () => {
    expect(namesMatching(LIBRARIES['booking and payment'])).toEqual([]);
  });
});

describe('what the application is made of, by name', () => {
  const files = sourceFilesUnder(ROOT);
  const namedAfterAFeature = (names: readonly string[]): string[] => names.filter((name) => wordsInName(name).some((word) => FEATURE_NAMES.test(word)));

  // @covers REQ-TRV-082@v1
  // @covers REQ-TRV-084@v1
  // @covers REQ-TRV-085@v1
  // @covers REQ-TRV-090@v1
  it('has no file named for weather, a map, a calendar, booking, payment, voice or a language', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(namedAfterAFeature(files.map((file) => file.path))).toEqual([]);
  });

  // @covers REQ-TRV-082@v1
  // @covers REQ-TRV-083@v1
  // @covers REQ-TRV-084@v1
  // @covers REQ-TRV-085@v1
  // @covers REQ-TRV-090@v1
  it('serves no route named for weather, flights, hotels, a map, a calendar, booking, payment, voice or a language', async () => {
    const { app } = await buildTestApp();
    const routes = app.printRoutes({ commonPrefix: false });

    expect(routes).toContain('/api/trips');
    expect(wordsInName(routes).filter((word) => FEATURE_NAMES.test(word))).toEqual([]);
  });

  // @covers REQ-TRV-082@v1
  // @covers REQ-TRV-083@v1
  // @covers REQ-TRV-084@v1
  // @covers REQ-TRV-085@v1
  // @covers REQ-TRV-090@v1
  it('has a web app that asks the server for nothing named for one of those features, however late and from whichever component', () => {
    const paths = sourceFilesUnder(ROOT, 'src/web').flatMap((file) => [...file.content.matchAll(/['"`](\/api\/[^'"`?#]*)/g)].map((match) => match[1] ?? ''));

    expect(new Set(paths).size).toBeGreaterThan(10);
    expect(namedAfterAFeature(paths)).toEqual([]);
  });
});

describe('what the application can reach', () => {
  const files = sourceFilesUnder(ROOT);
  /** Addresses that may appear in `src/`, each with the reason. The AI provider's own library holds its address, so none is needed for it. */
  const ALLOWED_ADDRESSES: readonly { readonly address: RegExp; readonly reason: string }[] = [
    { address: /^http:\/\/www\.w3\.org\/\d{4}\//, reason: 'an XML namespace, which is a name and is never fetched' },
  ];
  const withoutComments = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const addressesIn = (text: string): string[] => (text.match(/https?:\/\/[^\s'"`)>]+/g) ?? []).filter((found) => !ALLOWED_ADDRESSES.some(({ address }) => address.test(found)));

  // @covers REQ-TRV-082@v1
  // @covers REQ-TRV-083@v1
  // @covers REQ-TRV-084@v1
  // @covers REQ-TRV-085@v1
  // @covers REQ-TRV-090@v1
  it('names no address of any service, so no weather, flight, hotel, map, calendar or booking provider can be called', () => {
    const named = files.flatMap((file) => addressesIn(withoutComments(file.content)).map((address) => `${file.path}: ${address}`));

    expect(named).toEqual([]);
  });

  // @covers REQ-TRV-084@v1
  // @covers REQ-TRV-090@v1
  it('loads nothing from another address in the page the browser is given', () => {
    const page = readFileSync(join(ROOT, 'src', 'web', 'index.html'), 'utf8');

    expect(addressesIn(page)).toEqual([]);
    expect(page).not.toMatch(/<(script|link|iframe|img)\b[^>]*(src|href)="(https?:)?\/\//i);
  });

  // @covers REQ-TRV-084@v1
  // @covers REQ-TRV-082@v1
  // @covers REQ-TRV-083@v1
  // @covers REQ-TRV-090@v1
  it('tells the browser to load and call only its own address, which would stop an embedded map, tile server, widget or provider', async () => {
    const { app } = await buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    const policy = String(response.headers['content-security-policy']);
    const directive = (name: string) => policy.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `));
    expect(directive('default-src')).toBe("default-src 'self'");
    for (const name of ['script-src', 'img-src', 'frame-src', 'child-src', 'connect-src', 'media-src', 'object-src', 'frame-ancestors']) {
      expect(directive(name) ?? '').not.toMatch(/https?:|\*/);
    }
  });
});

describe('what is delivered', () => {
  const SKIPPED = new Set(['node_modules', '.git', 'dist', 'coverage', 'test-results', '.e2e', 'data', '.claude', '.brain']);
  const NATIVE_NAMES = new Set(['android', 'ios', 'app.json', 'eas.json', 'capacitor.config.ts', 'capacitor.config.json', 'ionic.config.json', 'config.xml', 'metro.config.js', 'pubspec.yaml', 'react-native.config.js', 'Podfile', 'build.gradle', 'AndroidManifest.xml']);
  const workflows = existsSync(join(ROOT, '.github', 'workflows'))
    ? readdirSync(join(ROOT, '.github', 'workflows')).map((name) => readFileSync(join(ROOT, '.github', 'workflows', name), 'utf8'))
    : [];
  const MOBILE_BUILD = /\b(react-native|expo|eas build|cap (sync|add|build)|cordova|gradlew|xcodebuild|flutter (build|run)|fastlane|testflight)\b/i;

  /** Every file and folder under `folder`, to a few levels down, except the ones that are not the project's own. */
  function namesUnder(folder: string, depth = 0): string[] {
    if (depth > 4) return [];
    return readdirSync(folder).flatMap((name) => {
      if (SKIPPED.has(name)) return [];
      const path = join(folder, name);
      return [path, ...(statSync(path).isDirectory() ? namesUnder(path, depth + 1) : [])];
    });
  }

  // @covers REQ-TRV-088@v1
  it('holds no native mobile project, anywhere in the repository: no Android or iOS folder, and none of their configuration files', () => {
    const found = namesUnder(ROOT).filter((path) => NATIVE_NAMES.has(path.split(/[\\/]/).at(-1) ?? ''));

    expect(found).toEqual([]);
  });

  // @covers REQ-TRV-088@v1
  it('has no command that builds a mobile application', () => {
    expect(Object.entries(packageJson.scripts ?? {}).filter(([, command]) => MOBILE_BUILD.test(command))).toEqual([]);
  });

  // @covers REQ-TRV-088@v1
  it('has no automated job that builds a mobile application', () => {
    expect(workflows.length).toBeGreaterThan(0);
    for (const workflow of workflows) expect(workflow).not.toMatch(MOBILE_BUILD);
  });
});
