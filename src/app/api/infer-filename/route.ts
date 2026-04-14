import { NextResponse } from "next/server";
import { inferArtistTitleFromFilename } from "@/lib/inferArtistTitleFromFilename";

export const dynamic = "force-dynamic";

function isSafeMp3Basename(name: string): boolean {
  if (!name || name.length > 512) return false;
  if (!name.toLowerCase().endsWith(".mp3")) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) {
    return false;
  }
  return name === name.trim();
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const filename =
    typeof body === "object" &&
    body !== null &&
    "filename" in body &&
    typeof (body as { filename: unknown }).filename === "string"
      ? (body as { filename: string }).filename
      : "";

  if (!filename || !isSafeMp3Basename(filename)) {
    return NextResponse.json(
      { error: "Provide a single .mp3 basename (no paths)" },
      { status: 400 },
    );
  }

  const result = inferArtistTitleFromFilename(filename);
  return NextResponse.json(result);
}
