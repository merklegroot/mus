import path from "node:path";
import { rename, stat } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { tracks } from "@/db/schema";
import { resolveMusicMp3 } from "@/lib/resolveMusicMp3";
import { touchLibraryIndexStamp } from "@/lib/musicLibraryIndex";

export const dynamic = "force-dynamic";

function isSafeBasename(name: string): boolean {
  if (!name || name.length > 512) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) return false;
  return name === name.trim();
}

function extLowerCommon(filename: string): string {
  const ext = path.extname(filename);
  return ext ? ext.slice(1).toLowerCase() : "";
}

export async function POST(
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

  const newFilename =
    typeof body === "object" &&
    body !== null &&
    "newFilename" in body &&
    typeof (body as { newFilename: unknown }).newFilename === "string"
      ? (body as { newFilename: string }).newFilename
      : "";

  if (!isSafeBasename(newFilename)) {
    return NextResponse.json(
      { error: "Provide a safe basename (no paths)" },
      { status: 400 },
    );
  }

  const fromExt = extLowerCommon(resolved.segment);
  const toExt = extLowerCommon(newFilename);
  if (!fromExt || fromExt !== toExt) {
    return NextResponse.json(
      { error: `Extension must be .${fromExt}` },
      { status: 400 },
    );
  }

  // For now we only support mp3 files in the library.
  if (fromExt !== "mp3") {
    return NextResponse.json({ error: "Unsupported extension" }, { status: 400 });
  }

  if (newFilename === resolved.segment) {
    return NextResponse.json({ ok: true, filename: newFilename });
  }

  const dir = path.dirname(resolved.absolutePath);
  const targetPath = path.join(dir, newFilename);

  // Avoid clobbering an existing file.
  const exists = await stat(targetPath).then(() => true).catch(() => false);
  if (exists) {
    return NextResponse.json(
      { error: "A file with that name already exists" },
      { status: 409 },
    );
  }

  try {
    await rename(resolved.absolutePath, targetPath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const st = await stat(targetPath).catch(() => null);
  if (!st?.isFile()) {
    return NextResponse.json(
      { error: "Rename failed" },
      { status: 500 },
    );
  }

  // Update cached rows keyed by filename.
  try {
    const db = getDb();
    const now = Date.now();
    db.update(tracks)
      .set({
        filename: newFilename,
        sizeBytes: st.size,
        mtimeMs: Math.trunc(st.mtimeMs),
        updatedAt: now,
      })
      .where(eq(tracks.filename, resolved.segment))
      .run();
  } catch {
    /* cache is optional */
  }

  // Nudge list caching so it refreshes quickly.
  touchLibraryIndexStamp();

  return NextResponse.json({ ok: true, filename: newFilename });
}

