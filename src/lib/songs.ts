import { getSqliteDatabase } from "@/db/client";

export type SongIdentity = {
  songId: number;
  filename: string;
};

export function ensureSongIdForFilename(filename: string): number {
  const sqlite = getSqliteDatabase();
  const trimmed = filename.trim();
  if (!trimmed) throw new Error("Filename is required");

  const existing = sqlite
    .prepare("SELECT song_id AS songId FROM song_files WHERE filename = ?")
    .get(trimmed) as { songId?: number } | undefined;
  if (existing?.songId && Number.isSafeInteger(existing.songId)) {
    return existing.songId;
  }

  const now = Date.now();
  return sqlite.transaction(() => {
    const again = sqlite
      .prepare("SELECT song_id AS songId FROM song_files WHERE filename = ?")
      .get(trimmed) as { songId?: number } | undefined;
    if (again?.songId && Number.isSafeInteger(again.songId)) {
      return again.songId;
    }

    const insertSong = sqlite.prepare(
      "INSERT INTO songs (created_at, updated_at) VALUES (?, ?)",
    );
    const songRes = insertSong.run(now, now);
    const songId = Number(songRes.lastInsertRowid);
    if (!Number.isSafeInteger(songId) || songId <= 0) {
      throw new Error("Failed to create song");
    }

    sqlite
      .prepare(
        "INSERT INTO song_files (filename, song_id, added_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run(trimmed, songId, now, now);
    return songId;
  })();
}

export function renameSongFile(oldFilename: string, newFilename: string): void {
  const sqlite = getSqliteDatabase();
  const from = oldFilename.trim();
  const to = newFilename.trim();
  if (!from || !to) return;

  sqlite.transaction(() => {
    const existing = sqlite
      .prepare("SELECT song_id AS songId FROM song_files WHERE filename = ?")
      .get(from) as { songId?: number } | undefined;
    if (!existing?.songId) return;

    const now = Date.now();
    sqlite
      .prepare(
        "UPDATE song_files SET filename = ?, updated_at = ? WHERE filename = ?",
      )
      .run(to, now, from);
  })();
}

export function listSongFilenames(songId: number): string[] {
  const sqlite = getSqliteDatabase();
  const rows = sqlite
    .prepare(
      `
        SELECT filename
        FROM song_files
        WHERE song_id = ?
        ORDER BY added_at ASC, filename COLLATE NOCASE ASC
      `,
    )
    .all(songId) as Array<{ filename: string }>;
  return rows
    .map((r) => r.filename)
    .filter((f) => typeof f === "string" && f.trim() !== "");
}

export function songIdForFilename(filename: string): number | null {
  const sqlite = getSqliteDatabase();
  const trimmed = filename.trim();
  if (!trimmed) return null;
  const row = sqlite
    .prepare("SELECT song_id AS songId FROM song_files WHERE filename = ?")
    .get(trimmed) as { songId?: number } | undefined;
  const id = row?.songId;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null;
}

