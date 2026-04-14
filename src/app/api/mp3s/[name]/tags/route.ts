import { NextResponse } from "next/server";
import NodeID3 from "node-id3";
import { resolveMusicMp3 } from "@/lib/resolveMusicMp3";
import { syncId3v1TrackNumberIfPresent } from "@/lib/syncId3v1Track";

export const dynamic = "force-dynamic";

function asNullableString(v: unknown): string | null {
  if (v === null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function optionalStringField(obj: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in obj)) return undefined;
  const v = obj[key];
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function asNullableInt(v: unknown): number | null {
  if (v === null) return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const n = Math.trunc(v);
    if (n === 63) return null;
    return n;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n)) return n === 63 ? null : n;
  }
  return null;
}

function optionalIntField(obj: Record<string, unknown>, key: string): number | null | undefined {
  if (!(key in obj)) return undefined;
  return asNullableInt(obj[key]);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;
  const resolved = await resolveMusicMp3(name);

  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  const title = optionalStringField(obj, "title");
  const artist = optionalStringField(obj, "artist");
  const album = optionalStringField(obj, "album");
  const genre = optionalStringField(obj, "genre");
  const year = optionalIntField(obj, "year");
  const trackNumber = optionalIntField(obj, "trackNumber");
  const comments = optionalStringField(obj, "comments");

  // node-id3 uses string values; track number uses "TRCK" format.
  const tags = {
    title: title === undefined ? undefined : title ?? undefined,
    artist: artist === undefined ? undefined : artist ?? undefined,
    album: album === undefined ? undefined : album ?? undefined,
    genre: genre === undefined ? undefined : genre ?? undefined,
    year: year === undefined ? undefined : year != null ? String(year) : "",
    TRCK:
      trackNumber === undefined
        ? undefined
        : trackNumber != null
          ? String(trackNumber)
          : "",
    comment:
      comments === undefined
        ? undefined
        : comments === null
          ? { language: "eng", text: "" }
          : { language: "eng", text: comments },
  } as unknown as NodeID3.Tags;

  try {
    const ok = NodeID3.update(tags, resolved.absolutePath);
    if (!ok) {
      return NextResponse.json({ error: "Failed to update ID3 tags" }, { status: 500 });
    }

    // Keep ID3v1 trailer (if present) consistent with TRCK, otherwise some readers
    // (including parts of music-metadata's mapping) can keep showing the old track.
    if (trackNumber !== undefined) {
      await syncId3v1TrackNumberIfPresent(resolved.absolutePath, trackNumber);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

