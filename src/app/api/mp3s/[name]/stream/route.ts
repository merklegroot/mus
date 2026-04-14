import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { parseBytesRange } from "@/lib/parseBytesRange";
import { resolveMusicMp3 } from "@/lib/resolveMusicMp3";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
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

  const { absolutePath, stats } = resolved;
  const fileSize = stats.size;
  const rangeHeader = request.headers.get("range");

  if (rangeHeader) {
    const range = parseBytesRange(rangeHeader, fileSize);
    if (!range) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}` },
      });
    }

    const { start, end } = range;
    const chunkSize = end - start + 1;
    const stream = createReadStream(absolutePath, {
      start,
      end,
      signal: request.signal,
    });
    const body = Readable.toWeb(stream) as unknown as ReadableStream;

    return new Response(body, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const stream = createReadStream(absolutePath, {
    signal: request.signal,
  });
  const body = Readable.toWeb(stream) as unknown as ReadableStream;

  return new Response(body, {
    headers: {
      "Content-Length": String(fileSize),
      "Content-Type": "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
