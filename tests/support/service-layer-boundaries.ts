import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface SourceFile {
  readonly path: string;
  readonly content: string;
}

interface ProviderLayer {
  readonly name: string;
  /** The only directory allowed to mention the provider. */
  readonly layer: string;
  readonly patterns: readonly RegExp[];
}

export const PROVIDER_LAYERS: readonly ProviderLayer[] = [
  { name: 'AI provider', layer: 'src/server/ai/', patterns: [/@anthropic-ai\//, /anthropic\.com/] },
  { name: 'email provider', layer: 'src/server/email/', patterns: [/nodemailer/] },
];

const SOURCE_FILE = /\.(ts|tsx)$/;

export function sourceFilesUnder(root: string, directory = 'src'): SourceFile[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(root, path);
    return SOURCE_FILE.test(entry.name)
      ? [{ path: relative('.', path).split(sep).join('/'), content: readFileSync(join(root, path), 'utf8') }]
      : [];
  });
}

/** Files outside a provider's own layer that mention it. */
export function referencesOutsideTheirLayer(files: readonly SourceFile[], layer: ProviderLayer): string[] {
  return files
    .filter((file) => !file.path.startsWith(layer.layer))
    .filter((file) => layer.patterns.some((pattern) => pattern.test(file.content)))
    .map((file) => file.path);
}

/** Files inside a provider's own layer that mention it. */
export function referencesInsideTheirLayer(files: readonly SourceFile[], layer: ProviderLayer): string[] {
  return files
    .filter((file) => file.path.startsWith(layer.layer))
    .filter((file) => layer.patterns.some((pattern) => pattern.test(file.content)))
    .map((file) => file.path);
}
