import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { discogsReleaseTracklists } from "@/db/schema";
import { discogsFetchMasterById, discogsFetchReleaseById } from "@/lib/discogsApi";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asType(v: unknown): "release" | "master" | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  if (t === "release" || t === "master") return t;
  return null;
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

  const id = asInt((body as { id?: unknown }).id);
  const type = asType((body as { type?: unknown }).type);
  if (id == null || id <= 0) {
    return NextResponse.json({ error: "Missing numeric field id" }, { status: 400 });
  }
  if (!type) {
    return NextResponse.json(
      { error: "Missing field type ('release' or 'master')" },
      { status: 400 },
    );
  }

  const key = `${type}:${id}`;
  const db = getDb();

  try {
    const data =
      type === "release" ? await discogsFetchReleaseById(id) : await discogsFetchMasterById(id);

    const fetchedAt = Date.now();
    const dataJson = JSON.stringify(data);

    db.insert(discogsReleaseTracklists)
      .values({ key, discogsId: id, type, dataJson, fetchedAt })
      .onConflictDoUpdate({
        target: discogsReleaseTracklists.key,
        set: { discogsId: id, type, dataJson, fetchedAt },
      })
      .run();

    return NextResponse.json({ ok: true, key, id, type, fetchedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // If Discogs rejected us, surface as bad gateway like other routes.
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

