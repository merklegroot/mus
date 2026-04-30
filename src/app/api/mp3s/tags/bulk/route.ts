import { NextResponse } from "next/server";
import { applyId3PatchToFile, parseId3PatchFromUnknown } from "@/lib/id3TagPatch";
import { resolveMusicMp3 } from "@/lib/resolveMusicMp3";

export const dynamic = "force-dynamic";

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string" && item.trim() !== "") out.push(item);
  }
  return out;
}

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const filenames = asStringArray(obj.filenames);
  if (!filenames || filenames.length === 0) {
    return NextResponse.json({ error: "filenames must be a non-empty string array" }, { status: 400 });
  }

  const patch = parseId3PatchFromUnknown(obj.patch);

  const results: { filename: string; ok: boolean; error?: string }[] = [];
  for (const name of filenames) {
    const resolved = await resolveMusicMp3(name);
    if (!resolved.ok) {
      results.push({ filename: name, ok: false, error: resolved.error });
      continue;
    }
    try {
      await applyId3PatchToFile({
        filename: resolved.segment,
        absolutePath: resolved.absolutePath,
        patch,
      });
      results.push({ filename: name, ok: true });
    } catch (e) {
      results.push({
        filename: name,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  const status = failCount === 0 ? 200 : okCount === 0 ? 500 : 207;
  return NextResponse.json({ ok: failCount === 0, okCount, failCount, results }, { status });
}

