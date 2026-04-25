import { inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { tracks } from "@/db/schema";
import { mergedArtistForFilename } from "@/lib/mergedArtistForFilename";
import { listMusicLibraryMp3Names } from "@/lib/musicLibraryIndex";

export const dynamic = "force-dynamic";

type SongListEntry = {
  filename: string;
  /** ID3 artist when present, otherwise primary filename inference (same merge as track details). */
  artist: string | null;
  /** ID3 title when present, otherwise primary filename inference. */
  title: string | null;
  /** Cached ID3 album from DB (no filename inference). */
  album: string | null;
};

function id3AlbumOnly(album: string | null | undefined): string | null {
  if (typeof album !== "string" || album.trim() === "") return null;
  return album.trim();
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
    const metaByFile = new Map<
      string,
      { artist: string | null; title: string | null; album: string | null }
    >();
    const chunkSize = 400;
    for (let i = 0; i < names.length; i += chunkSize) {
      const slice = names.slice(i, i + chunkSize);
      const rows = db
        .select({
          filename: tracks.filename,
          artist: tracks.artist,
          title: tracks.title,
          album: tracks.album,
        })
        .from(tracks)
        .where(inArray(tracks.filename, slice))
        .all();
      for (const r of rows) {
        metaByFile.set(r.filename, {
          artist: r.artist,
          title: r.title,
          album: r.album,
        });
      }
    }

    const songs: SongListEntry[] = names.map((filename) => {
      const row = metaByFile.get(filename);
      return {
        filename,
        artist: mergedArtistForFilename(filename, row?.artist),
        title:
          typeof row?.title === "string" && row.title.trim() !== ""
            ? row.title.trim()
            : null,
        album: id3AlbumOnly(row?.album),
      };
    });

    return NextResponse.json({ mp3s: names, songs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
