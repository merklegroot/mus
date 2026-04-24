import { NextResponse } from "next/server";
import {
  deletePlaylist,
  getPlaylist,
  normalizePlaylistName,
  updatePlaylistName,
} from "@/lib/playlists";

export const dynamic = "force-dynamic";

function parsePlaylistId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const id = parsePlaylistId(rawId);
  if (!id) {
    return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
  }

  try {
    const playlist = getPlaylist(id);
    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }
    return NextResponse.json({ playlist });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const id = parsePlaylistId(rawId);
  if (!id) {
    return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name =
    typeof body === "object" && body !== null && "name" in body
      ? normalizePlaylistName((body as { name: unknown }).name)
      : null;
  if (!name) {
    return NextResponse.json(
      { error: "Playlist name must be 1-80 characters" },
      { status: 400 },
    );
  }

  try {
    const playlist = updatePlaylistName(id, name);
    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }
    return NextResponse.json({ playlist });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const id = parsePlaylistId(rawId);
  if (!id) {
    return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
  }

  try {
    if (!deletePlaylist(id)) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
