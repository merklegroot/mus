import type { Stats } from "node:fs";
import { unlink } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { parseFile } from "music-metadata";
import { getDb, getSqliteDatabase } from "@/db/client";
import { artistSetlistPreferences, tracks } from "@/db/schema";
import { inferArtistTitleFromFilename } from "@/lib/inferArtistTitleFromFilename";
import { touchLibraryIndexStamp } from "@/lib/musicLibraryIndex";
import { ensureSongIdForFilename } from "@/lib/songs";
import { deleteSetlistTracksForFilename } from "@/lib/setlists";
import { resolveMusicMp3 } from "@/lib/resolveMusicMp3";

export const dynamic = "force-dynamic";

function joinArtist(artist: unknown): string | null {
  if (typeof artist === "string") return artist;
  if (Array.isArray(artist) && artist.every((a) => typeof a === "string")) {
    return artist.join(", ");
  }
  return null;
}

function joinComments(comment: unknown): string | null {
  if (typeof comment === "string") return comment.trim() || null;
  if (!Array.isArray(comment)) return null;
  const parts: string[] = [];
  for (const c of comment) {
    if (typeof c === "string") {
      const t = c.trim();
      if (t) parts.push(t);
      continue;
    }
    if (typeof c === "object" && c !== null && "text" in c) {
      const t = typeof (c as { text: unknown }).text === "string" ? (c as { text: string }).text.trim() : "";
      if (t) parts.push(t);
    }
  }
  if (parts.length === 0) return null;
  return parts.join("\n");
}

function trackNumberFromFilename(filename: string): number | null {
  // Common pattern: "01 - Title.mp3"
  const m = /^(\d{1,3})\s*-\s+/.exec(filename);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizeTrackNumber(n: number | null): number | null {
  if (n == null) return null;
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t <= 0) return null;
  // Some rips carry a bogus ID3v1 track byte (commonly 63) that doesn't correspond to album order.
  // Treat it as "missing" so the UI/API don't surface misleading track numbers.
  if (t === 63) return null;
  return t;
}

function parseTrck(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  // Typical formats: "4", "4/11"
  const head = s.split("/")[0]?.trim() ?? "";
  const n = Number.parseInt(head, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return normalizeTrackNumber(n);
}

function trackNumberFromNative(meta: {
  native?: Record<string, Array<{ id: string; value: unknown }>>;
}): number | null {
  const native = meta.native;
  if (!native) return null;

  for (const tagType of Object.keys(native)) {
    const frames = native[tagType];
    if (!Array.isArray(frames)) continue;
    for (const f of frames) {
      if (!f || typeof f.id !== "string") continue;
      if (f.id === "TRCK" || f.id === "TRK") {
        const n = parseTrck(f.value);
        if (n != null) return n;
      }
    }
  }
  return null;
}

function trackNumberFromMeta(meta: {
  common?: { track?: { no?: unknown } };
  native?: Record<string, Array<{ id: string; value: unknown }>>;
}): number | null {
  const fromNative = trackNumberFromNative(meta);
  if (fromNative != null) return fromNative;

  const n = meta.common?.track?.no;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return normalizeTrackNumber(Math.trunc(n));
}

function resolveTrackNumber(
  filename: string,
  meta: {
    common?: { track?: { no?: unknown } };
    native?: Record<string, Array<{ id: string; value: unknown }>>;
  } | null,
): number | null {
  const fromName = normalizeTrackNumber(trackNumberFromFilename(filename));
  if (!meta) return fromName;

  const fromTags = trackNumberFromMeta(meta);
  if (fromTags != null) return fromTags;
  return fromName;
}

function fileFingerprint(stats: Stats) {
  return {
    size: stats.size,
    mtimeMs: Math.trunc(stats.mtimeMs),
  };
}

function booleanFieldFromBody(body: unknown, key: string): boolean | null {
  if (typeof body !== "object" || body === null || !(key in body)) return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : null;
}

function hasAnyCachedTags(row: {
  title: string | null;
  artist: string | null;
  album: string | null;
  genre: string | null;
  year: number | null;
  durationSec: number | null;
  bitrateKbps: number | null;
  codec: string | null;
}): boolean {
  return (
    row.title != null ||
    row.artist != null ||
    row.album != null ||
    row.genre != null ||
    row.year != null ||
    row.durationSec != null ||
    row.bitrateKbps != null ||
    row.codec != null
  );
}

function readCachedDetails(filename: string, stats: Stats) {
  try {
    const { size, mtimeMs } = fileFingerprint(stats);
    const db = getDb();
    const row = db
      .select()
      .from(tracks)
      .where(eq(tracks.filename, filename))
      .get();
    if (
      !row ||
      row.sizeBytes !== size ||
      row.mtimeMs !== mtimeMs
    ) {
      return null;
    }
    // Rows created by the library index may have null tags; in that case we should still
    // parse the file so the Details panel can show ID3 metadata.
    if (!hasAnyCachedTags(row)) return null;
    return row;
  } catch {
    return null;
  }
}

function readTrackExcludedFromSetlists(filename: string): boolean {
  try {
    const row = getDb()
      .select({ excludedFromSetlists: tracks.excludedFromSetlists })
      .from(tracks)
      .where(eq(tracks.filename, filename))
      .get();
    return row?.excludedFromSetlists ?? false;
  } catch {
    return false;
  }
}

function readArtistExcludedFromSetlists(artist: string | null): boolean {
  try {
    const row = getDb()
      .select({
        excludedFromSetlists: artistSetlistPreferences.excludedFromSetlists,
      })
      .from(artistSetlistPreferences)
      .where(eq(artistSetlistPreferences.artistName, artist ?? "Unknown"))
      .get();
    return row?.excludedFromSetlists ?? false;
  } catch {
    return false;
  }
}

function persistTrackSetlistVisibility(
  filename: string,
  stats: Stats,
  excludedFromSetlists: boolean,
) {
  const { size, mtimeMs } = fileFingerprint(stats);
  getSqliteDatabase()
    .prepare(
      `
        INSERT INTO tracks (
          filename,
          size_bytes,
          mtime_ms,
          excluded_from_setlists,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(filename) DO UPDATE SET
          size_bytes = excluded.size_bytes,
          mtime_ms = excluded.mtime_ms,
          excluded_from_setlists = excluded.excluded_from_setlists,
          updated_at = excluded.updated_at
      `,
    )
    .run(filename, size, mtimeMs, excludedFromSetlists ? 1 : 0, Date.now());
}

function persistTrackDetails(
  filename: string,
  stats: Stats,
  fields: {
    title: string | null;
    artist: string | null;
    album: string | null;
    genre: string | null;
    year: number | null;
    durationSec: number | null;
    bitrateKbps: number | null;
    codec: string | null;
  },
) {
  try {
    const { size, mtimeMs } = fileFingerprint(stats);
    const now = Date.now();
    const db = getDb();
    db.insert(tracks)
      .values({
        filename,
        sizeBytes: size,
        mtimeMs,
        title: fields.title,
        artist: fields.artist,
        album: fields.album,
        genre: fields.genre,
        year: fields.year,
        durationSec: fields.durationSec,
        bitrateKbps: fields.bitrateKbps,
        codec: fields.codec,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: tracks.filename,
        set: {
          sizeBytes: size,
          mtimeMs,
          title: fields.title,
          artist: fields.artist,
          album: fields.album,
          genre: fields.genre,
          year: fields.year,
          durationSec: fields.durationSec,
          bitrateKbps: fields.bitrateKbps,
          codec: fields.codec,
          updatedAt: now,
        },
      })
      .run();
  } catch {
    /* cache is optional */
  }
}

function jsonFromRow(
  songId: number,
  filename: string,
  stats: Stats,
  trackNumber: number | null,
  id3TrackNumber: number | null,
  filenameTrackNumber: number | null,
  comments: string | null,
  row: {
    title: string | null;
    titleSource: "id3" | "filename" | "none";
    artist: string | null;
    artistSource: "id3" | "filename" | "none";
    album: string | null;
    genre: string | null;
    year: number | null;
    durationSec: number | null;
    bitrateKbps: number | null;
    codec: string | null;
    excludedFromSetlists: boolean;
    artistExcludedFromSetlists: boolean;
  },
) {
  return {
    songId,
    filename,
    trackNumber,
    id3TrackNumber,
    filenameTrackNumber,
    comments,
    sizeBytes: stats.size,
    modified: new Date(stats.mtimeMs).toISOString(),
    title: row.title,
    titleSource: row.titleSource,
    artist: row.artist,
    artistSource: row.artistSource,
    album: row.album,
    genre: row.genre,
    year: row.year,
    durationSec: row.durationSec,
    bitrateKbps: row.bitrateKbps,
    codec: row.codec,
    excludedFromSetlists: row.excludedFromSetlists,
    artistExcludedFromSetlists: row.artistExcludedFromSetlists,
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;
  const resolved = await resolveMusicMp3(name);

  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  const { absolutePath, segment, stats } = resolved;
  const songId = ensureSongIdForFilename(segment);

  const cached = readCachedDetails(segment, stats);
  if (cached) {
    // Cached tag data does not currently include track number, so if the filename
    // doesn't have a track prefix, best-effort parse ID3 for track number only.
    let trackNumber: number | null = null;
    let id3TrackNumber: number | null = null;
    let filenameTrackNumber: number | null = null;
    let comments: string | null = null;
    try {
      const meta = await parseFile(absolutePath);
      filenameTrackNumber = normalizeTrackNumber(trackNumberFromFilename(segment));
      id3TrackNumber = trackNumberFromMeta(meta);
      trackNumber = resolveTrackNumber(segment, meta);
      comments = joinComments(meta.common.comment);
    } catch {
      /* optional */
    }
    const inferred = inferArtistTitleFromFilename(segment);
    const id3Title = cached.title;
    const id3Artist = cached.artist;
    const mergedTitle = id3Title ?? inferred.primary.title;
    const mergedArtist = id3Artist ?? inferred.primary.artist;
    const artistExcludedFromSetlists =
      readArtistExcludedFromSetlists(mergedArtist);
    return NextResponse.json(
      jsonFromRow(
        songId,
        segment,
        stats,
        trackNumber,
        id3TrackNumber,
        filenameTrackNumber,
        comments,
        {
          ...cached,
          title: mergedTitle,
          titleSource: id3Title ? "id3" : mergedTitle ? "filename" : "none",
          artist: mergedArtist,
          artistSource: id3Artist ? "id3" : mergedArtist ? "filename" : "none",
          excludedFromSetlists: cached.excludedFromSetlists,
          artistExcludedFromSetlists,
        },
      ),
    );
  }

  let title: string | null = null;
  let titleSource: "id3" | "filename" | "none" = "none";
  let artist: string | null = null;
  let artistSource: "id3" | "filename" | "none" = "none";
  let album: string | null = null;
  let genre: string | null = null;
  let year: number | null = null;
  let durationSec: number | null = null;
  let bitrateKbps: number | null = null;
  let codec: string | null = null;
  let trackNumber: number | null = null;
  let id3TrackNumber: number | null = null;
  let filenameTrackNumber: number | null = null;
  let comments: string | null = null;

  try {
    const meta = await parseFile(absolutePath);
    title = meta.common.title ?? null;
    titleSource = title ? "id3" : "none";
    artist = joinArtist(meta.common.artist) ?? joinArtist(meta.common.artists);
    artistSource = artist ? "id3" : "none";
    album = meta.common.album ?? null;
    genre = joinArtist(meta.common.genre);
    filenameTrackNumber = normalizeTrackNumber(trackNumberFromFilename(segment));
    id3TrackNumber = trackNumberFromMeta(meta);
    trackNumber = resolveTrackNumber(segment, meta);
    comments = joinComments(meta.common.comment);
    const y = meta.common.year;
    year = typeof y === "number" && Number.isFinite(y) ? y : null;
    const d = meta.format.duration;
    durationSec = typeof d === "number" && Number.isFinite(d) ? d : null;
    const br = meta.format.bitrate;
    bitrateKbps =
      typeof br === "number" && Number.isFinite(br)
        ? Math.round(br / 1000)
        : null;
    const codecId = meta.format.codec;
    codec = typeof codecId === "string" ? codecId : null;
  } catch {
    /* tags optional */
  }

  const inferred = inferArtistTitleFromFilename(segment);
  const mergedTitle = title ?? inferred.primary.title;
  const mergedArtist = artist ?? inferred.primary.artist;
  if (!title && mergedTitle) titleSource = "filename";
  if (!artist && mergedArtist) artistSource = "filename";

  const fields = {
    title,
    artist,
    album,
    genre,
    year,
    durationSec,
    bitrateKbps,
    codec,
  };

  persistTrackDetails(segment, stats, fields);
  const excludedFromSetlists = readTrackExcludedFromSetlists(segment);
  const artistExcludedFromSetlists =
    readArtistExcludedFromSetlists(mergedArtist);

  return NextResponse.json(
    jsonFromRow(
      songId,
      segment,
      stats,
      trackNumber,
      id3TrackNumber,
      filenameTrackNumber,
      comments,
      {
        ...fields,
        title: mergedTitle,
        titleSource,
        artist: mergedArtist,
        artistSource,
        excludedFromSetlists,
        artistExcludedFromSetlists,
      },
    ),
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;
  const resolved = await resolveMusicMp3(name);

  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const excludedFromSetlists = booleanFieldFromBody(
    body,
    "excludedFromSetlists",
  );
  if (excludedFromSetlists === null) {
    return NextResponse.json(
      { error: "excludedFromSetlists must be a boolean" },
      { status: 400 },
    );
  }

  try {
    persistTrackSetlistVisibility(
      resolved.segment,
      resolved.stats,
      excludedFromSetlists,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, excludedFromSetlists });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;
  const resolved = await resolveMusicMp3(name);

  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  const { absolutePath, segment } = resolved;

  try {
    await unlink(absolutePath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  try {
    const db = getDb();
    db.delete(tracks).where(eq(tracks.filename, segment)).run();
  } catch {
    /* cache is optional */
  }

  try {
    deleteSetlistTracksForFilename(segment);
  } catch {
    /* setlists are optional */
  }

  touchLibraryIndexStamp();

  return NextResponse.json({ ok: true });
}
