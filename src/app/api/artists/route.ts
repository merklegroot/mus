import { and, asc, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { tracks } from "@/db/schema";
import { inferArtistTitleFromFilename } from "@/lib/inferArtistTitleFromFilename";
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
    if (listed.ok) {
      for (const filename of listed.names) {
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
    merged.sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ artists: merged });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
