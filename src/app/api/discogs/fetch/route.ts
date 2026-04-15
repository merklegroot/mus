import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { discogsArtists } from "@/db/schema";
import {
  discogsFetchArtistById,
  discogsSearchArtists,
  parseSearchHits,
  pickArtistSearchHit,
} from "@/lib/discogsApi";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Expected object body" }, { status: 400 });
  }

  const rawArtist = (body as { artist?: unknown }).artist;
  if (typeof rawArtist !== "string") {
    return NextResponse.json({ error: "Missing string field artist" }, { status: 400 });
  }

  const libraryArtistName = rawArtist.trim();
  if (libraryArtistName === "") {
    return NextResponse.json({ error: "artist must be non-empty" }, { status: 400 });
  }

  try {
    const searchJson = await discogsSearchArtists(libraryArtistName);
    const hit = pickArtistSearchHit(parseSearchHits(searchJson), libraryArtistName);
    if (!hit) {
      return NextResponse.json(
        { error: "No Discogs artist results for that name" },
        { status: 404 },
      );
    }

    const artistJson = await discogsFetchArtistById(hit.id);
    const dataJson = JSON.stringify(artistJson);
    const fetchedAt = Date.now();

    const db = getDb();
    db.insert(discogsArtists)
      .values({
        libraryArtistName,
        discogsId: hit.id,
        dataJson,
        fetchedAt,
      })
      .onConflictDoUpdate({
        target: discogsArtists.libraryArtistName,
        set: {
          discogsId: hit.id,
          dataJson,
          fetchedAt,
        },
      })
      .run();

    const discogsName =
      typeof artistJson === "object" &&
      artistJson !== null &&
      "name" in artistJson &&
      typeof (artistJson as { name: unknown }).name === "string"
        ? (artistJson as { name: string }).name
        : hit.title;

    return NextResponse.json({
      libraryArtistName,
      discogsId: hit.id,
      discogsName,
      fetchedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
