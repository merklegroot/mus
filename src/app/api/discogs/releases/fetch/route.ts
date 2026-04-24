import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { discogsArtistReleases, discogsArtists } from "@/db/schema";
import {
  discogsFetchAllArtistReleases,
  discogsFetchMasterById,
  discogsFetchReleaseById,
} from "@/lib/discogsApi";

export const dynamic = "force-dynamic";
/** Enriching masters (master + main release per candidate) can take a long time. */
export const maxDuration = 300;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Discogs GET /masters/{id} returns `main_release` as an object `{ id, resource_url, ... }`,
 * not a bare number. Older clients sometimes assumed a number; without this we never fetch formats.
 */
function mainReleaseIdFromMaster(master: Record<string, unknown>): number | null {
  const mr = master.main_release;
  if (typeof mr === "number" && Number.isFinite(mr)) return Math.trunc(mr);
  if (isRecord(mr)) {
    const id = asInt(mr.id);
    if (id != null && id > 0) return id;
  }
  if (typeof mr === "string") {
    const fromUrl = /\/releases\/(\d+)/.exec(mr);
    if (fromUrl) {
      const n = Number.parseInt(fromUrl[1], 10);
      return Number.isFinite(n) ? n : null;
    }
    return asInt(mr);
  }
  return null;
}

function looksLikeNonStudioTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (!t) return true;

  // Common "bootleg show" patterns: dates, venues, cities, radio specials, etc.
  const month =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
  const hasMonth = month.test(t);
  const hasDateish =
    /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(t) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(t) ||
    /\b\d{1,2}(?:st|nd|rd|th)?\b/.test(t);
  const hasCityComma = /,\s*[a-z]{2}\b/.test(t) || /,\s*(usa|uk|au|nz|ca|de|fr|it|es)\b/.test(t);
  const noiseWords =
    /\b(live|tour|bootleg|festival|radio|sampler|vault|box set|soundtrack|motion picture)\b/i.test(
      t,
    );
  return (hasMonth && hasDateish) || hasCityComma || noiseWords;
}

async function enrichMastersWithFormats(
  releases: unknown[],
): Promise<{ releases: unknown[]; mastersFetched: number }> {
  // Only enrich "Main" masters that do not obviously look like show/bootleg titles.
  const targets: Array<{ idx: number; id: number; title: string }> = [];
  for (let i = 0; i < releases.length; i += 1) {
    const r = releases[i];
    if (!isRecord(r)) continue;
    if (typeof r.type !== "string" || typeof r.role !== "string" || typeof r.title !== "string") {
      continue;
    }
    if (r.type !== "master" || r.role !== "Main") continue;
    const id = asInt(r.id);
    if (id == null || id <= 0) continue;
    if (looksLikeNonStudioTitle(r.title)) continue;
    // Avoid refetch if already has formats.
    if ("formats" in r) continue;
    targets.push({ idx: i, id, title: r.title });
  }

  const out = releases.slice();
  let fetched = 0;

  // Concurrency-limited fetch to be kind to Discogs.
  const CONCURRENCY = 4;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const chunk = targets.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (t) => {
        try {
          const master = await discogsFetchMasterById(t.id);
          if (!isRecord(master)) {
            return { ok: false as const, t, error: "Invalid master response" };
          }
          const mainReleaseId = mainReleaseIdFromMaster(master);
          if (mainReleaseId == null || mainReleaseId <= 0) {
            return { ok: false as const, t, error: "Master missing main_release" };
          }
          const release = await discogsFetchReleaseById(mainReleaseId);
          return { ok: true as const, t, master, release };
        } catch (e) {
          return { ok: false as const, t, error: e instanceof Error ? e.message : String(e) };
        }
      }),
    );
    for (const r of results) {
      if (!r.ok) continue;
      if (!isRecord(r.release)) continue;

      const base = out[r.t.idx];
      if (!isRecord(base)) continue;

      // Release responses include `formats` with `descriptions` (Album/LP/Single/etc).
      if ("formats" in r.release) {
        base.formats = (r.release as Record<string, unknown>).formats;
      }

      // Also populate simple `format` string for display if missing.
      if (base.format == null) {
        const relFormats = (r.release as Record<string, unknown>).formats;
        if (Array.isArray(relFormats)) {
          const parts: string[] = [];
          for (const f of relFormats) {
            if (!isRecord(f)) continue;
            const d = f.descriptions;
            if (Array.isArray(d)) {
              for (const x of d) {
                if (typeof x === "string" && x.trim()) parts.push(x.trim());
              }
            }
          }
          if (parts.length) base.format = [...new Set(parts)].join(", ");
        }
      }

      // Prefer year from master/year or release/year when the list item is missing.
      const yearFromMaster = asInt((r.master as Record<string, unknown>).year);
      const yearFromRelease = asInt((r.release as Record<string, unknown>).year);
      const year = yearFromMaster ?? yearFromRelease;
      if (year != null && base.year == null) {
        base.year = year;
      }

      fetched += 1;
    }
  }

  return { releases: out, mastersFetched: fetched };
}

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
    const enriched = await enrichMastersWithFormats(releases);
    const dataJson = JSON.stringify({
      releases: enriched.releases,
      items,
      pagesFetched,
      perPage,
      mastersFetched: enriched.mastersFetched,
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
      mastersFetched: enriched.mastersFetched,
      fetchedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
