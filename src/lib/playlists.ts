import { getSqliteDatabase } from "@/db/client";

export type PlaylistTrackEntry = {
  id: number;
  filename: string;
  position: number;
  addedAt: number;
};

export type PlaylistSummary = {
  id: number;
  name: string;
  createdAt: number;
  updatedAt: number;
  trackCount: number;
};

export type PlaylistDetails = PlaylistSummary & {
  tracks: PlaylistTrackEntry[];
};

type PlaylistSummaryRow = {
  id: number;
  name: string;
  createdAt: number;
  updatedAt: number;
  trackCount: number;
};

type PlaylistTrackRow = {
  id: number;
  filename: string;
  position: number;
  addedAt: number;
};

export function ensurePlaylistTables(): void {
  getSqliteDatabase().exec(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      position INTEGER NOT NULL,
      added_at INTEGER NOT NULL,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS playlist_tracks_playlist_id_idx
      ON playlist_tracks(playlist_id);

    CREATE UNIQUE INDEX IF NOT EXISTS playlist_tracks_playlist_filename_uq
      ON playlist_tracks(playlist_id, filename);
  `);
}

export function normalizePlaylistName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 80) return null;
  return trimmed;
}

function playlistSummaryFromRow(row: PlaylistSummaryRow): PlaylistSummary {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    trackCount: row.trackCount,
  };
}

export function listPlaylists(): PlaylistSummary[] {
  ensurePlaylistTables();
  const rows = getSqliteDatabase()
    .prepare(`
      SELECT
        p.id,
        p.name,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt,
        COUNT(pt.id) AS trackCount
      FROM playlists p
      LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
      GROUP BY p.id
      ORDER BY p.name COLLATE NOCASE ASC, p.id ASC
    `)
    .all() as PlaylistSummaryRow[];
  return rows.map(playlistSummaryFromRow);
}

export function getPlaylist(id: number): PlaylistDetails | null {
  ensurePlaylistTables();
  const sqlite = getSqliteDatabase();
  const row = sqlite
    .prepare(`
      SELECT
        p.id,
        p.name,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt,
        COUNT(pt.id) AS trackCount
      FROM playlists p
      LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
      WHERE p.id = ?
      GROUP BY p.id
    `)
    .get(id) as PlaylistSummaryRow | undefined;
  if (!row) return null;

  const tracks = sqlite
    .prepare(`
      SELECT id, filename, position, added_at AS addedAt
      FROM playlist_tracks
      WHERE playlist_id = ?
      ORDER BY position ASC, id ASC
    `)
    .all(id) as PlaylistTrackRow[];

  return {
    ...playlistSummaryFromRow(row),
    tracks,
  };
}

export function createPlaylist(name: string): PlaylistDetails {
  ensurePlaylistTables();
  const now = Date.now();
  const result = getSqliteDatabase()
    .prepare(
      "INSERT INTO playlists (name, created_at, updated_at) VALUES (?, ?, ?)",
    )
    .run(name, now, now);
  const id = Number(result.lastInsertRowid);
  const playlist = getPlaylist(id);
  if (!playlist) {
    throw new Error("Failed to create playlist");
  }
  return playlist;
}

export function updatePlaylistName(
  id: number,
  name: string,
): PlaylistDetails | null {
  ensurePlaylistTables();
  const result = getSqliteDatabase()
    .prepare("UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?")
    .run(name, Date.now(), id);
  if (result.changes === 0) return null;
  return getPlaylist(id);
}

export function deletePlaylist(id: number): boolean {
  ensurePlaylistTables();
  const result = getSqliteDatabase()
    .prepare("DELETE FROM playlists WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

export function addPlaylistTrack(
  playlistId: number,
  filename: string,
): PlaylistDetails | null {
  ensurePlaylistTables();
  const sqlite = getSqliteDatabase();
  return sqlite.transaction(() => {
    const playlist = getPlaylist(playlistId);
    if (!playlist) return null;
    const row = sqlite
      .prepare(
        "SELECT COALESCE(MAX(position), -1) + 1 AS nextPosition FROM playlist_tracks WHERE playlist_id = ?",
      )
      .get(playlistId) as { nextPosition: number };
    const now = Date.now();
    sqlite
      .prepare(
        "INSERT INTO playlist_tracks (playlist_id, filename, position, added_at) VALUES (?, ?, ?, ?)",
      )
      .run(playlistId, filename, row.nextPosition, now);
    sqlite
      .prepare("UPDATE playlists SET updated_at = ? WHERE id = ?")
      .run(now, playlistId);
    return getPlaylist(playlistId);
  })();
}

export function removePlaylistTrack(
  playlistId: number,
  filename: string,
): PlaylistDetails | null {
  ensurePlaylistTables();
  const sqlite = getSqliteDatabase();
  return sqlite.transaction(() => {
    const playlist = getPlaylist(playlistId);
    if (!playlist) return null;
    sqlite
      .prepare("DELETE FROM playlist_tracks WHERE playlist_id = ? AND filename = ?")
      .run(playlistId, filename);
    const remaining = sqlite
      .prepare(`
        SELECT id
        FROM playlist_tracks
        WHERE playlist_id = ?
        ORDER BY position ASC, id ASC
      `)
      .all(playlistId) as Array<{ id: number }>;
    const updatePosition = sqlite.prepare(
      "UPDATE playlist_tracks SET position = ? WHERE id = ?",
    );
    remaining.forEach((track, index) => {
      updatePosition.run(index, track.id);
    });
    sqlite
      .prepare("UPDATE playlists SET updated_at = ? WHERE id = ?")
      .run(Date.now(), playlistId);
    return getPlaylist(playlistId);
  })();
}

export function updatePlaylistTrackFilename(
  oldFilename: string,
  newFilename: string,
): void {
  ensurePlaylistTables();
  getSqliteDatabase()
    .prepare("UPDATE OR IGNORE playlist_tracks SET filename = ? WHERE filename = ?")
    .run(newFilename, oldFilename);
}

export function deletePlaylistTracksForFilename(filename: string): void {
  ensurePlaylistTables();
  getSqliteDatabase()
    .prepare("DELETE FROM playlist_tracks WHERE filename = ?")
    .run(filename);
}
