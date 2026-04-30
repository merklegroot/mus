import { NextResponse } from "next/server";
import { applyId3PatchToFile, parseId3PatchFromUnknown } from "@/lib/id3TagPatch";
import { resolveMusicMp3 } from "@/lib/resolveMusicMp3";

export const dynamic = "force-dynamic";

export async function PATCH(
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

  const patch = parseId3PatchFromUnknown(body);

  try {
    await applyId3PatchToFile({
      filename: resolved.segment,
      absolutePath: resolved.absolutePath,
      patch,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

