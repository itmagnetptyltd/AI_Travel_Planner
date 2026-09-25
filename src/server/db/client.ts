import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export type TrvDatabase = BetterSQLite3Database<typeof schema>;

const MIGRATIONS_FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations');
const IN_MEMORY = ':memory:';

export interface OpenedDatabase {
  readonly db: TrvDatabase;
  readonly close: () => void;
}

/**
 * Opens (or creates) the SQLite database and applies every pending migration.
 * Pass ':memory:' for a throwaway database.
 */
export function openDatabase(path: string): OpenedDatabase {
  if (path !== IN_MEMORY) {
    mkdirSync(dirname(resolve(path)), { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  // SQLite's lower() and LIKE fold ASCII only, so "Île-de-France" would never match "île-de-france". This folds any script.
  sqlite.function('ulower', { deterministic: true }, (text: unknown) => (typeof text === 'string' ? text.toLowerCase() : text));
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, close: () => sqlite.close() };
}
