import { NextResponse } from "next/server";
import {
  createPlaylist,
  listPlaylists,
  normalizePlaylistName,
} from "@/lib/playlists";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ playlists: listPlaylists() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
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
    return NextResponse.json({ playlist: createPlaylist(name) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
