import { NextResponse } from "next/server";
import { listSongFilenames } from "@/lib/songs";
import { resolveMusicMp3 } from "@/lib/resolveMusicMp3";
import { transposeSongPrimaryMp3 } from "@/lib/transposeSongAudio";

export const dynamic = "force-dynamic";

/** Pitch-shift + encode can take a while on large files (local / long-running server). */
export const maxDuration = 900;

function parseSongId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function POST(
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const obj =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const semitonesRaw = obj.semitones;
  const destinationKeyLabel =
    typeof obj.destinationKeyLabel === "string"
      ? obj.destinationKeyLabel.trim() || null
      : null;

  if (typeof semitonesRaw !== "number" || !Number.isFinite(semitonesRaw)) {
    return NextResponse.json(
      { error: "semitones must be a finite number" },
      { status: 400 },
    );
  }

  const semitones = Math.round(semitonesRaw);
  if (semitones < -48 || semitones > 48) {
    return NextResponse.json(
      { error: "semitones must be between -48 and 48" },
      { status: 400 },
    );
  }

  if (semitones === 0) {
    return NextResponse.json(
      { error: "semitones cannot be 0 (nothing to transpose)" },
      { status: 400 },
    );
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
    const result = await transposeSongPrimaryMp3({
      sourceFilename: resolved.segment,
      sourceAbsolutePath: resolved.absolutePath,
      songId,
      semitones,
      destinationKeyLabel,
    });

    return NextResponse.json({
      ok: true,
      outputFilename: result.outputFilename,
      newTitle: result.newTitle,
      semitones: result.semitones,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
