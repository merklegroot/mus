import { NextResponse } from "next/server";
import {
  addPlaylistTrack,
  removePlaylistTrack,
} from "@/lib/playlists";
import { resolveMusicMp3 } from "@/lib/resolveMusicMp3";

export const dynamic = "force-dynamic";

function parsePlaylistId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function filenameFromBody(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("filename" in body)) {
    return null;
  }
  const filename = (body as { filename: unknown }).filename;
  return typeof filename === "string" && filename.trim() !== ""
    ? filename.trim()
    : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const playlistId = parsePlaylistId(rawId);
  if (!playlistId) {
    return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const filename = filenameFromBody(body);
  if (!filename) {
    return NextResponse.json({ error: "Filename is required" }, { status: 400 });
  }

  const resolved = await resolveMusicMp3(filename);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  try {
    const playlist = addPlaylistTrack(playlistId, resolved.segment);
    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }
    return NextResponse.json({ playlist });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("UNIQUE constraint failed") ? 409 : 500;
    return NextResponse.json(
      {
        error:
          status === 409 ? "That song is already in this playlist" : message,
      },
      { status },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const playlistId = parsePlaylistId(rawId);
  if (!playlistId) {
    return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const filename = searchParams.get("filename")?.trim();
  if (!filename) {
    return NextResponse.json({ error: "Filename is required" }, { status: 400 });
  }

  try {
    const playlist = removePlaylistTrack(playlistId, filename);
    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }
    return NextResponse.json({ playlist });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
