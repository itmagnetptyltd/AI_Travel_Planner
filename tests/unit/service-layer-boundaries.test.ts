import { describe, expect, test } from 'vitest';
import {
  PROVIDER_LAYERS,
  referencesInsideTheirLayer,
  referencesOutsideTheirLayer,
  sourceFilesUnder,
} from '../support/service-layer-boundaries';

const sources = sourceFilesUnder('.');
const layerOf = (name: string) => {
  const layer = PROVIDER_LAYERS.find((candidate) => candidate.name === name);
  if (!layer) throw new Error(`No provider layer named ${name}`);
  return layer;
};

describe('the AI and email providers are reached only through their own service layers', () => {
  // @covers REQ-TRV-081@v1
  test('no code outside src/server/ai/ references the AI provider', () => {
    expect(referencesOutsideTheirLayer(sources, layerOf('AI provider'))).toEqual([]);
  });

  // @covers REQ-TRV-081@v1
  test('no code outside src/server/email/ references the email provider', () => {
    expect(referencesOutsideTheirLayer(sources, layerOf('email provider'))).toEqual([]);
  });

  // @covers REQ-TRV-081@v1
  test('the AI provider is reached from exactly one file in its own layer', () => {
    expect(referencesInsideTheirLayer(sources, layerOf('AI provider'))).toEqual(['src/server/ai/anthropic-ai-service.ts']);
  });

  // @covers REQ-TRV-081@v1
  test('the email provider is reached from exactly one file in its own layer', () => {
    expect(referencesInsideTheirLayer(sources, layerOf('email provider'))).toEqual(['src/server/email/smtp-email-service.ts']);
  });

  // @covers REQ-TRV-081@v1
  test('the check flags business-logic and UI files that import a provider library', () => {
    const offenders = [
      { path: 'src/server/plans/plan-service.ts', content: "import Anthropic from '@anthropic-ai/sdk';" },
      { path: 'src/web/pages/TripPage.tsx', content: "fetch('https://api.anthropic.com/v1/messages')" },
      { path: 'src/server/trips/trip-service.ts', content: "import nodemailer from 'nodemailer';" },
    ];

    expect(referencesOutsideTheirLayer(offenders, layerOf('AI provider'))).toEqual([
      'src/server/plans/plan-service.ts',
      'src/web/pages/TripPage.tsx',
    ]);
    expect(referencesOutsideTheirLayer(offenders, layerOf('email provider'))).toEqual(['src/server/trips/trip-service.ts']);
  });
});
