import { inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { tracks } from "@/db/schema";
import { inferArtistTitleFromFilename } from "@/lib/inferArtistTitleFromFilename";
import { listMusicLibraryMp3Names } from "@/lib/musicLibraryIndex";

export const dynamic = "force-dynamic";

type SongListEntry = {
  filename: string;
  /** ID3 artist when present, otherwise primary filename inference (same merge as track details). */
  artist: string | null;
};

function mergedArtistForFilename(
  filename: string,
  id3Artist: string | null | undefined,
): string | null {
  const id3 =
    typeof id3Artist === "string" && id3Artist.trim() !== ""
      ? id3Artist.trim()
      : null;
  const inferred =
    inferArtistTitleFromFilename(filename).primary.artist?.trim() || null;
  return id3 ?? inferred;
}

export async function GET() {
  try {
    const result = await listMusicLibraryMp3Names();
    if (!result.ok) {
      const status =
        result.error === "MUSIC_FOLDER is not configured" ? 400 : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    const names = result.names;
    if (names.length === 0) {
      return NextResponse.json({
        mp3s: [],
        songs: [] as SongListEntry[],
      });
    }

    const db = getDb();
    const artistByFile = new Map<string, string | null>();
    const chunkSize = 400;
    for (let i = 0; i < names.length; i += chunkSize) {
      const slice = names.slice(i, i + chunkSize);
      const rows = db
        .select({ filename: tracks.filename, artist: tracks.artist })
        .from(tracks)
        .where(inArray(tracks.filename, slice))
        .all();
      for (const r of rows) {
        artistByFile.set(r.filename, r.artist);
      }
    }

    const songs: SongListEntry[] = names.map((filename) => ({
      filename,
      artist: mergedArtistForFilename(filename, artistByFile.get(filename)),
    }));

    return NextResponse.json({ mp3s: names, songs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
