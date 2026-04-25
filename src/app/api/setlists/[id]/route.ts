import { NextResponse } from "next/server";
import {
  deleteSetlist,
  getSetlist,
  normalizeSetlistName,
  updateSetlistName,
} from "@/lib/setlists";

export const dynamic = "force-dynamic";

function parseSetlistId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const id = parseSetlistId(rawId);
  if (!id) {
    return NextResponse.json({ error: "Invalid setlist id" }, { status: 400 });
  }

  try {
    const setlist = getSetlist(id);
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
  const id = parseSetlistId(rawId);
  if (!id) {
    return NextResponse.json({ error: "Invalid setlist id" }, { status: 400 });
  }

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
    const setlist = updateSetlistName(id, name);
    if (!setlist) {
      return NextResponse.json({ error: "Setlist not found" }, { status: 404 });
    }
    return NextResponse.json({ setlist });
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
  const id = parseSetlistId(rawId);
  if (!id) {
    return NextResponse.json({ error: "Invalid setlist id" }, { status: 400 });
  }

  try {
    if (!deleteSetlist(id)) {
      return NextResponse.json({ error: "Setlist not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
