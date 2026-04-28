import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const dbFile = path.resolve(
  /* turbopackIgnore: true */ process.cwd(),
  process.env.DATABASE_PATH ?? path.join("data", "mus.db"),
);

const globalForSqlite = globalThis as typeof globalThis & {
  __mus_sqlite?: InstanceType<typeof Database>;
};

function ensureRuntimeMigrations(sqlite: InstanceType<typeof Database>): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS artist_setlist_preferences (
      artist_name TEXT PRIMARY KEY,
      excluded_from_setlists INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `);

  const tracksTable = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tracks'",
    )
    .get();
  if (!tracksTable) return;

  const trackColumns = sqlite
    .prepare("PRAGMA table_info(tracks)")
    .all() as Array<{ name: string }>;
  if (!trackColumns.some((column) => column.name === "excluded_from_setlists")) {
    sqlite.exec(
      "ALTER TABLE tracks ADD COLUMN excluded_from_setlists INTEGER NOT NULL DEFAULT 0",
    );
  }
}

function getSqlite(): InstanceType<typeof Database> {
  if (!globalForSqlite.__mus_sqlite) {
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    const sqlite = new Database(dbFile);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    ensureRuntimeMigrations(sqlite);
    globalForSqlite.__mus_sqlite = sqlite;
  }
  return globalForSqlite.__mus_sqlite;
}

export function getSqliteDatabase() {
  return getSqlite();
}

export function getDb() {
  return drizzle(getSqlite(), { schema });
}
