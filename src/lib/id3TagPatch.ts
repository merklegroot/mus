import { stat } from "node:fs/promises";
import { eq } from "drizzle-orm";
import NodeID3 from "node-id3";
import { getDb } from "@/db/client";
import { tracks } from "@/db/schema";
import { syncId3v1TrackNumberIfPresent } from "@/lib/syncId3v1Track";

export type ParsedId3Patch = {
  // undefined => do not touch
  // null => clear
  title: string | null | undefined;
  artist: string | null | undefined;
  album: string | null | undefined;
  genre: string | null | undefined;
  year: number | null | undefined;
  trackNumber: number | null | undefined;
  comments: string | null | undefined;
};

function optionalStringField(obj: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in obj)) return undefined;
  const v = obj[key];
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function asNullableInt(v: unknown): number | null {
  if (v === null) return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const n = Math.trunc(v);
    if (n === 63) return null;
    return n;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n)) return n === 63 ? null : n;
  }
  return null;
}

function optionalIntField(obj: Record<string, unknown>, key: string): number | null | undefined {
  if (!(key in obj)) return undefined;
  return asNullableInt(obj[key]);
}

export function parseId3PatchFromUnknown(body: unknown): ParsedId3Patch {
  const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  return {
    title: optionalStringField(obj, "title"),
    artist: optionalStringField(obj, "artist"),
    album: optionalStringField(obj, "album"),
    genre: optionalStringField(obj, "genre"),
    year: optionalIntField(obj, "year"),
    trackNumber: optionalIntField(obj, "trackNumber"),
    comments: optionalStringField(obj, "comments"),
  };
}

function nodeId3TagsFromPatch(patch: ParsedId3Patch): NodeID3.Tags {
  // node-id3 uses string values; track number uses "TRCK" format.
  return {
    title: patch.title === undefined ? undefined : patch.title ?? undefined,
    artist: patch.artist === undefined ? undefined : patch.artist ?? undefined,
    album: patch.album === undefined ? undefined : patch.album ?? undefined,
    genre: patch.genre === undefined ? undefined : patch.genre ?? undefined,
    year: patch.year === undefined ? undefined : patch.year != null ? String(patch.year) : "",
    TRCK:
      patch.trackNumber === undefined
        ? undefined
        : patch.trackNumber != null
          ? String(patch.trackNumber)
          : "",
    comment:
      patch.comments === undefined
        ? undefined
        : patch.comments === null
          ? { language: "eng", text: "" }
          : { language: "eng", text: patch.comments },
  } as unknown as NodeID3.Tags;
}

/** Keep SQLite cache in sync so GET /api/mp3s (album/artist lists) reflects ID3 edits immediately. */
export async function syncTrackCacheAfterTagWrite(
  filename: string,
  absolutePath: string,
  partial: Pick<ParsedId3Patch, "title" | "artist" | "album" | "genre" | "year">,
): Promise<void> {
  try {
    const st = await stat(absolutePath);
    const db = getDb();
    const existing = db.select().from(tracks).where(eq(tracks.filename, filename)).get();
    const sizeBytes = st.size;
    const mtimeMs = Math.trunc(st.mtimeMs);
    const now = Date.now();
    const merged = {
      title: partial.title === undefined ? existing?.title ?? null : partial.title,
      artist: partial.artist === undefined ? existing?.artist ?? null : partial.artist,
      album: partial.album === undefined ? existing?.album ?? null : partial.album,
      genre: partial.genre === undefined ? existing?.genre ?? null : partial.genre,
      year: partial.year === undefined ? existing?.year ?? null : partial.year,
      durationSec: existing?.durationSec ?? null,
      bitrateKbps: existing?.bitrateKbps ?? null,
      codec: existing?.codec ?? null,
    };
    db.insert(tracks)
      .values({
        filename,
        sizeBytes,
        mtimeMs,
        ...merged,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: tracks.filename,
        set: {
          sizeBytes,
          mtimeMs,
          ...merged,
          updatedAt: now,
        },
      })
      .run();
  } catch {
    /* cache is optional */
  }
}

export async function applyId3PatchToFile(args: {
  filename: string;
  absolutePath: string;
  patch: ParsedId3Patch;
}): Promise<void> {
  const tags = nodeId3TagsFromPatch(args.patch);
  const ok = NodeID3.update(tags, args.absolutePath);
  if (!ok) throw new Error("Failed to update ID3 tags");

  if (args.patch.trackNumber !== undefined) {
    await syncId3v1TrackNumberIfPresent(args.absolutePath, args.patch.trackNumber);
  }

  await syncTrackCacheAfterTagWrite(args.filename, args.absolutePath, {
    title: args.patch.title,
    artist: args.patch.artist,
    album: args.patch.album,
    genre: args.patch.genre,
    year: args.patch.year,
  });
}

