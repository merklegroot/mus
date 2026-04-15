import {
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/**
 * Singleton row (id = 1): last full index fingerprint for MUSIC_FOLDER.
 * Used to skip DB writes and optionally skip disk reads (see LIBRARY_LIST_CACHE_TTL_MS).
 */
export const libraryState = sqliteTable("library_state", {
  id: integer("id").primaryKey(),
  musicFolderRealpath: text("music_folder_realpath").notNull(),
  contentFingerprint: text("content_fingerprint").notNull(),
  fileCount: integer("file_count").notNull(),
  indexedAt: integer("indexed_at", { mode: "number" }).notNull(),
});

/** Cached metadata for files under MUSIC_FOLDER (keyed by filename). */
export const tracks = sqliteTable("tracks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull().unique(),
  sizeBytes: integer("size_bytes").notNull(),
  mtimeMs: integer("mtime_ms").notNull(),
  title: text("title"),
  artist: text("artist"),
  album: text("album"),
  genre: text("genre"),
  year: integer("year"),
  durationSec: real("duration_sec"),
  bitrateKbps: integer("bitrate_kbps"),
  codec: text("codec"),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

export type Track = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;

/**
 * Cached Discogs artist payload for a library artist name (from tags / filename inference).
 * Keyed by the exact string shown in the Artists panel (trimmed).
 */
export const discogsArtists = sqliteTable("discogs_artists", {
  libraryArtistName: text("library_artist_name").primaryKey(),
  discogsId: integer("discogs_id").notNull(),
  dataJson: text("data_json").notNull(),
  fetchedAt: integer("fetched_at", { mode: "number" }).notNull(),
});

export type DiscogsArtistRow = typeof discogsArtists.$inferSelect;
export type NewDiscogsArtistRow = typeof discogsArtists.$inferInsert;
