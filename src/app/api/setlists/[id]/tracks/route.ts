import { NextResponse } from "next/server";
import {
  addSetlistTrack,
  normalizeSetlistTrackNotes,
  removeSetlistTrack,
  updateSetlistTrackNotes,
} from "@/lib/setlists";
import { resolveMusicMp3 } from "@/lib/resolveMusicMp3";

export const dynamic = "force-dynamic";

function parseSetlistId(raw: string): number | null {
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

function notesFromBody(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("notes" in body)) {
    return null;
  }
  return normalizeSetlistTrackNotes((body as { notes: unknown }).notes);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const setlistId = parseSetlistId(rawId);
  if (!setlistId) {
    return NextResponse.json({ error: "Invalid setlist id" }, { status: 400 });
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
    const setlist = addSetlistTrack(setlistId, resolved.segment);
    if (!setlist) {
      return NextResponse.json({ error: "Setlist not found" }, { status: 404 });
    }
    return NextResponse.json({ setlist });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("UNIQUE constraint failed") ? 409 : 500;
    return NextResponse.json(
      {
        error:
          status === 409 ? "That song is already in this setlist" : message,
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
  const setlistId = parseSetlistId(rawId);
  if (!setlistId) {
    return NextResponse.json({ error: "Invalid setlist id" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const filename = searchParams.get("filename")?.trim();
  if (!filename) {
    return NextResponse.json({ error: "Filename is required" }, { status: 400 });
  }

  try {
    const setlist = removeSetlistTrack(setlistId, filename);
    if (!setlist) {
      return NextResponse.json({ error: "Setlist not found" }, { status: 404 });
    }
    return NextResponse.json({ setlist });
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
  const setlistId = parseSetlistId(rawId);
  if (!setlistId) {
    return NextResponse.json({ error: "Invalid setlist id" }, { status: 400 });
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

  const notes = notesFromBody(body);
  if (notes === null) {
    return NextResponse.json(
      { error: "Notes must be 5000 characters or fewer" },
      { status: 400 },
    );
  }

  try {
    const setlist = updateSetlistTrackNotes(setlistId, filename, notes);
    if (!setlist) {
      return NextResponse.json({ error: "Setlist not found" }, { status: 404 });
    }
    return NextResponse.json({ setlist });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
