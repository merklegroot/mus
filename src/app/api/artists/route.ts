import { and, asc, inArray, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { tracks } from "@/db/schema";
import { inferArtistTitleFromFilename } from "@/lib/inferArtistTitleFromFilename";
import { mergedArtistForFilename } from "@/lib/mergedArtistForFilename";
import { listMusicLibraryMp3Names } from "@/lib/musicLibraryIndex";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const rows = db
      .selectDistinct({ artist: tracks.artist })
      .from(tracks)
      .where(
        and(
          isNotNull(tracks.artist),
          sql`trim(${tracks.artist}) != ''`,
        ),
      )
      .orderBy(asc(tracks.artist))
      .all();

    const fromId3 = rows
      .map((r) => r.artist?.trim())
      .filter((a): a is string => typeof a === "string" && a.length > 0);

    const fromFilenames: string[] = [];
    const listed = await listMusicLibraryMp3Names();
    let hasUnknownArtistSong = false;
    if (listed.ok) {
      const metaByFile = new Map<string, { artist: string | null }>();
      const chunkSize = 400;
      for (let i = 0; i < listed.names.length; i += chunkSize) {
        const slice = listed.names.slice(i, i + chunkSize);
        const metaRows = db
          .select({ filename: tracks.filename, artist: tracks.artist })
          .from(tracks)
          .where(inArray(tracks.filename, slice))
          .all();
        for (const r of metaRows) {
          metaByFile.set(r.filename, { artist: r.artist });
        }
      }
      for (const filename of listed.names) {
        const row = metaByFile.get(filename);
        const merged = mergedArtistForFilename(filename, row?.artist);
        if (merged == null) hasUnknownArtistSong = true;
        const guess = inferArtistTitleFromFilename(filename).primary.artist?.trim();
        if (guess) fromFilenames.push(guess);
      }
    }

    const seen = new Set<string>();
    const merged: string[] = [];
    const pushUnique = (a: string) => {
      if (seen.has(a)) return;
      seen.add(a);
      merged.push(a);
    };
    for (const a of fromId3) pushUnique(a);
    for (const a of fromFilenames) pushUnique(a);
    if (hasUnknownArtistSong) pushUnique("Unknown");
    merged.sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ artists: merged });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
