import { NextResponse } from "next/server";
import {
  getSongKey,
  getSongLyrics,
  listSongFilenames,
  setSongKey,
  setSongLyrics,
} from "@/lib/songs";

export const dynamic = "force-dynamic";

function parseSongId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function parseLyrics(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return null;
  const normalized = raw.replace(/\r\n/g, "\n");
  return normalized.trim() === "" ? null : normalized;
}

function parseKey(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t === "" ? null : t;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const songId = parseSongId(rawId);
  if (!songId) {
    return NextResponse.json({ error: "Invalid song id" }, { status: 400 });
  }

  // If the song exists only implicitly via a filename (older links), allow
  // an escape hatch: /api/songs/<filename> isn't a thing, but the UI only uses ids.
  const filenames = listSongFilenames(songId);
  if (filenames.length === 0) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }

  return NextResponse.json({
    songId,
    filenames,
    // Convenience: first known file for this song.
    primaryFilename: filenames[0] ?? null,
    lyrics: getSongLyrics(songId),
    key: getSongKey(songId),
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const songId = parseSongId(rawId);
  if (!songId) {
    return NextResponse.json({ error: "Invalid song id" }, { status: 400 });
  }

  const filenames = listSongFilenames(songId);
  if (filenames.length === 0) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const hasLyrics = Object.prototype.hasOwnProperty.call(record, "lyrics");
  const hasKey = Object.prototype.hasOwnProperty.call(record, "key");
  if (!hasLyrics && !hasKey) {
    return NextResponse.json(
      { error: "Provide lyrics and/or key to update" },
      { status: 400 },
    );
  }

  if (hasLyrics) {
    setSongLyrics(songId, parseLyrics(record.lyrics));
  }
  if (hasKey) {
    setSongKey(songId, parseKey(record.key));
  }

  return NextResponse.json({
    songId,
    lyrics: getSongLyrics(songId),
    key: getSongKey(songId),
  });
}

