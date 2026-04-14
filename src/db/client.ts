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

function getSqlite(): InstanceType<typeof Database> {
  if (!globalForSqlite.__mus_sqlite) {
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    const sqlite = new Database(dbFile);
    sqlite.pragma("journal_mode = WAL");
    globalForSqlite.__mus_sqlite = sqlite;
  }
  return globalForSqlite.__mus_sqlite;
}

export function getDb() {
  return drizzle(getSqlite(), { schema });
}
