import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
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

/**
 * Cached GET /artists/{id}/releases (all pages merged) for a library artist.
 */
export const discogsArtistReleases = sqliteTable("discogs_artist_releases", {
  libraryArtistName: text("library_artist_name").primaryKey(),
  discogsArtistId: integer("discogs_artist_id").notNull(),
  dataJson: text("data_json").notNull(),
  fetchedAt: integer("fetched_at", { mode: "number" }).notNull(),
});

export type DiscogsArtistReleasesRow = typeof discogsArtistReleases.$inferSelect;
export type NewDiscogsArtistReleasesRow = typeof discogsArtistReleases.$inferInsert;

/**
 * Cached Discogs release/master payload for tracklist display.
 * Key format: "{type}:{id}" where type is "release" or "master".
 */
export const discogsReleaseTracklists = sqliteTable("discogs_release_tracklists", {
  key: text("key").primaryKey(),
  discogsId: integer("discogs_id").notNull(),
  type: text("type").notNull(),
  dataJson: text("data_json").notNull(),
  fetchedAt: integer("fetched_at", { mode: "number" }).notNull(),
});

export type DiscogsReleaseTracklistRow =
  typeof discogsReleaseTracklists.$inferSelect;
export type NewDiscogsReleaseTracklistRow =
  typeof discogsReleaseTracklists.$inferInsert;

/** User-managed playlist containers. */
export const playlists = sqliteTable("playlists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

export type Playlist = typeof playlists.$inferSelect;
export type NewPlaylist = typeof playlists.$inferInsert;

/** Ordered MP3 filenames assigned to playlists. */
export const playlistTracks = sqliteTable(
  "playlist_tracks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    playlistId: integer("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    position: integer("position").notNull(),
    addedAt: integer("added_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("playlist_tracks_playlist_id_idx").on(table.playlistId),
    uniqueIndex("playlist_tracks_playlist_filename_uq").on(
      table.playlistId,
      table.filename,
    ),
  ],
);

export type PlaylistTrack = typeof playlistTracks.$inferSelect;
export type NewPlaylistTrack = typeof playlistTracks.$inferInsert;
