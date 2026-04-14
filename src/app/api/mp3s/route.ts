import { NextResponse } from "next/server";
import { listMusicLibraryMp3Names } from "@/lib/musicLibraryIndex";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await listMusicLibraryMp3Names();
    if (!result.ok) {
      const status =
        result.error === "MUSIC_FOLDER is not configured" ? 400 : 500;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ mp3s: result.names });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
