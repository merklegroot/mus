import { NextResponse } from "next/server";
import { detectMusicalKeyFromMp3Path } from "@/lib/detectMusicalKey";
import { listSongFilenames } from "@/lib/songs";
import { resolveMusicMp3 } from "@/lib/resolveMusicMp3";

export const dynamic = "force-dynamic";
/** Allow slow decode + DSP on large library files (local / long-running servers). */
export const maxDuration = 120;

function parseSongId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function POST(
  _request: Request,
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

  const primaryName = filenames[0];
  const resolved = await resolveMusicMp3(encodeURIComponent(primaryName));

  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  try {
    const { label, confidence } = await detectMusicalKeyFromMp3Path(
      resolved.absolutePath,
    );
    return NextResponse.json({
      key: label,
      confidence,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
