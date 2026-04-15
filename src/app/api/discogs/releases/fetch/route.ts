import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { discogsArtistReleases, discogsArtists } from "@/db/schema";
import { discogsFetchAllArtistReleases } from "@/lib/discogsApi";

export const dynamic = "force-dynamic";
/** Large discographies can require many sequential requests. */
export const maxDuration = 120;

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

  const db = getDb();
  const artistRow = db
    .select()
    .from(discogsArtists)
    .where(eq(discogsArtists.libraryArtistName, libraryArtistName))
    .get();

  if (!artistRow) {
    return NextResponse.json(
      {
        error:
          "Load the artist profile from Discogs first (artist page or home), then fetch releases.",
      },
      { status: 409 },
    );
  }

  try {
    const { releases, items, pagesFetched, perPage } = await discogsFetchAllArtistReleases(
      artistRow.discogsId,
    );
    const dataJson = JSON.stringify({
      releases,
      items,
      pagesFetched,
      perPage,
    });
    const fetchedAt = Date.now();

    db.insert(discogsArtistReleases)
      .values({
        libraryArtistName,
        discogsArtistId: artistRow.discogsId,
        dataJson,
        fetchedAt,
      })
      .onConflictDoUpdate({
        target: discogsArtistReleases.libraryArtistName,
        set: {
          discogsArtistId: artistRow.discogsId,
          dataJson,
          fetchedAt,
        },
      })
      .run();

    return NextResponse.json({
      libraryArtistName,
      discogsArtistId: artistRow.discogsId,
      releaseCount: releases.length,
      itemsReported: items,
      pagesFetched,
      fetchedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
