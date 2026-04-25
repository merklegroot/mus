import { NextResponse } from "next/server";
import {
  createSetlist,
  listSetlists,
  normalizeSetlistName,
} from "@/lib/setlists";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ setlists: listSetlists() });
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
      ? normalizeSetlistName((body as { name: unknown }).name)
      : null;
  if (!name) {
    return NextResponse.json(
      { error: "Setlist name must be 1-80 characters" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({ setlist: createSetlist(name) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
