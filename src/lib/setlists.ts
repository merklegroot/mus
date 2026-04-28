import { getSqliteDatabase } from "@/db/client";

export type SetlistTrackEntry = {
  id: number;
  filename: string;
  position: number;
  addedAt: number;
  notes: string;
};

export type SetlistSummary = {
  id: number;
  name: string;
  createdAt: number;
  updatedAt: number;
  trackCount: number;
};

export type SetlistDetails = SetlistSummary & {
  tracks: SetlistTrackEntry[];
};

type SetlistSummaryRow = {
  id: number;
  name: string;
  createdAt: number;
  updatedAt: number;
  trackCount: number;
};

type SetlistTrackRow = {
  id: number;
  filename: string;
  position: number;
  addedAt: number;
  notes: string;
};

export function ensureSetlistTables(): void {
  const sqlite = getSqliteDatabase();
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS setlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS setlist_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setlist_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      position INTEGER NOT NULL,
      added_at INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (setlist_id) REFERENCES setlists(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS setlist_tracks_setlist_id_idx
      ON setlist_tracks(setlist_id);

    CREATE UNIQUE INDEX IF NOT EXISTS setlist_tracks_setlist_filename_uq
      ON setlist_tracks(setlist_id, filename);
  `);

  const trackColumns = sqlite
    .prepare("PRAGMA table_info(setlist_tracks)")
    .all() as Array<{ name: string }>;
  if (!trackColumns.some((column) => column.name === "notes")) {
    sqlite.exec("ALTER TABLE setlist_tracks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
  }

  const oldSetlistsTable = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'playlists'",
    )
    .get();
  const oldTracksTable = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'playlist_tracks'",
    )
    .get();

  if (oldSetlistsTable) {
    sqlite.exec(`
      INSERT OR IGNORE INTO setlists (id, name, created_at, updated_at)
      SELECT id, name, created_at, updated_at
      FROM playlists;
    `);
  }

  if (oldTracksTable) {
    sqlite.exec(`
      INSERT OR IGNORE INTO setlist_tracks (id, setlist_id, filename, position, added_at)
      SELECT id, playlist_id, filename, position, added_at
      FROM playlist_tracks;
    `);
  }
}

export function normalizeSetlistName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 80) return null;
  return trimmed;
}

export function normalizeSetlistTrackNotes(notes: unknown): string | null {
  if (typeof notes !== "string") return null;
  const trimmed = notes.trim();
  if (trimmed.length > 5000) return null;
  return trimmed;
}

function setlistSummaryFromRow(row: SetlistSummaryRow): SetlistSummary {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    trackCount: row.trackCount,
  };
}

export function listSetlists(): SetlistSummary[] {
  ensureSetlistTables();
  const rows = getSqliteDatabase()
    .prepare(`
      SELECT
        p.id,
        p.name,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt,
        COUNT(pt.id) AS trackCount
      FROM setlists p
      LEFT JOIN setlist_tracks pt ON pt.setlist_id = p.id
      GROUP BY p.id
      ORDER BY p.name COLLATE NOCASE ASC, p.id ASC
    `)
    .all() as SetlistSummaryRow[];
  return rows.map(setlistSummaryFromRow);
}

export function getSetlist(id: number): SetlistDetails | null {
  ensureSetlistTables();
  const sqlite = getSqliteDatabase();
  const row = sqlite
    .prepare(`
      SELECT
        p.id,
        p.name,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt,
        COUNT(pt.id) AS trackCount
      FROM setlists p
      LEFT JOIN setlist_tracks pt ON pt.setlist_id = p.id
      WHERE p.id = ?
      GROUP BY p.id
    `)
    .get(id) as SetlistSummaryRow | undefined;
  if (!row) return null;

  const tracks = sqlite
    .prepare(`
      SELECT id, filename, position, added_at AS addedAt, notes
      FROM setlist_tracks
      WHERE setlist_id = ?
      ORDER BY position ASC, id ASC
    `)
    .all(id) as SetlistTrackRow[];

  return {
    ...setlistSummaryFromRow(row),
    tracks,
  };
}

export function createSetlist(name: string): SetlistDetails {
  ensureSetlistTables();
  const now = Date.now();
  const result = getSqliteDatabase()
    .prepare(
      "INSERT INTO setlists (name, created_at, updated_at) VALUES (?, ?, ?)",
    )
    .run(name, now, now);
  const id = Number(result.lastInsertRowid);
  const setlist = getSetlist(id);
  if (!setlist) {
    throw new Error("Failed to create setlist");
  }
  return setlist;
}

export function updateSetlistName(
  id: number,
  name: string,
): SetlistDetails | null {
  ensureSetlistTables();
  const result = getSqliteDatabase()
    .prepare("UPDATE setlists SET name = ?, updated_at = ? WHERE id = ?")
    .run(name, Date.now(), id);
  if (result.changes === 0) return null;
  return getSetlist(id);
}

export function deleteSetlist(id: number): boolean {
  ensureSetlistTables();
  const result = getSqliteDatabase()
    .prepare("DELETE FROM setlists WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

export function addSetlistTrack(
  setlistId: number,
  filename: string,
): SetlistDetails | null {
  ensureSetlistTables();
  const sqlite = getSqliteDatabase();
  return sqlite.transaction(() => {
    const setlist = getSetlist(setlistId);
    if (!setlist) return null;
    const row = sqlite
      .prepare(
        "SELECT COALESCE(MAX(position), -1) + 1 AS nextPosition FROM setlist_tracks WHERE setlist_id = ?",
      )
      .get(setlistId) as { nextPosition: number };
    const now = Date.now();
    sqlite
      .prepare(
        "INSERT INTO setlist_tracks (setlist_id, filename, position, added_at) VALUES (?, ?, ?, ?)",
      )
      .run(setlistId, filename, row.nextPosition, now);
    sqlite
      .prepare("UPDATE setlists SET updated_at = ? WHERE id = ?")
      .run(now, setlistId);
    return getSetlist(setlistId);
  })();
}

export function updateSetlistTrackNotes(
  setlistId: number,
  filename: string,
  notes: string,
): SetlistDetails | null {
  ensureSetlistTables();
  const sqlite = getSqliteDatabase();
  return sqlite.transaction(() => {
    const setlist = getSetlist(setlistId);
    if (!setlist) return null;
    const now = Date.now();
    sqlite
      .prepare(
        "UPDATE setlist_tracks SET notes = ? WHERE setlist_id = ? AND filename = ?",
      )
      .run(notes, setlistId, filename);
    sqlite
      .prepare("UPDATE setlists SET updated_at = ? WHERE id = ?")
      .run(now, setlistId);
    return getSetlist(setlistId);
  })();
}

export function removeSetlistTrack(
  setlistId: number,
  filename: string,
): SetlistDetails | null {
  ensureSetlistTables();
  const sqlite = getSqliteDatabase();
  return sqlite.transaction(() => {
    const setlist = getSetlist(setlistId);
    if (!setlist) return null;
    sqlite
      .prepare("DELETE FROM setlist_tracks WHERE setlist_id = ? AND filename = ?")
      .run(setlistId, filename);
    const remaining = sqlite
      .prepare(`
        SELECT id
        FROM setlist_tracks
        WHERE setlist_id = ?
        ORDER BY position ASC, id ASC
      `)
      .all(setlistId) as Array<{ id: number }>;
    const updatePosition = sqlite.prepare(
      "UPDATE setlist_tracks SET position = ? WHERE id = ?",
    );
    remaining.forEach((track, index) => {
      updatePosition.run(index, track.id);
    });
    sqlite
      .prepare("UPDATE setlists SET updated_at = ? WHERE id = ?")
      .run(Date.now(), setlistId);
    return getSetlist(setlistId);
  })();
}

export function updateSetlistTrackFilename(
  oldFilename: string,
  newFilename: string,
): void {
  ensureSetlistTables();
  getSqliteDatabase()
    .prepare("UPDATE OR IGNORE setlist_tracks SET filename = ? WHERE filename = ?")
    .run(newFilename, oldFilename);
}

export function deleteSetlistTracksForFilename(filename: string): void {
  ensureSetlistTables();
  getSqliteDatabase()
    .prepare("DELETE FROM setlist_tracks WHERE filename = ?")
    .run(filename);
}
