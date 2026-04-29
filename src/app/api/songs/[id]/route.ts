import { NextResponse } from "next/server";
import { listSongFilenames } from "@/lib/songs";

export const dynamic = "force-dynamic";

function parseSongId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
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
  });
}

