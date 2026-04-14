import { spawn } from "node:child_process";
import path from "node:path";
import { realpath } from "node:fs/promises";
import { NextResponse } from "next/server";
import { isAllowedYoutubeUrl } from "@/lib/youtubeUrl";

export const dynamic = "force-dynamic";

/** Long audio-only jobs (self-hosted / local dev). Serverless hosts often cap lower. */
export const maxDuration = 3600;

function ytDlpBinary(): string {
  const fromEnv = process.env.YT_DLP_PATH?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : "yt-dlp";
}

function runYtDlp(
  binary: string,
  args: string[],
  timeoutMs: number,
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const chunks: Buffer[] = [];
    const child = spawn(binary, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error("Download timed out"));
    }, timeoutMs);

    child.stderr?.on("data", (d: Buffer) => {
      chunks.push(d);
      if (chunks.reduce((a, b) => a + b.length, 0) > 512_000) {
        chunks.splice(0, chunks.length - 32);
      }
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stderr = Buffer.concat(chunks).toString("utf8").trim();
      resolve({ code, stderr });
    });
  });
}

export async function POST(request: Request) {
  const musicFolder = process.env.MUSIC_FOLDER?.trim();
  if (!musicFolder) {
    return NextResponse.json(
      { error: "MUSIC_FOLDER is not configured" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url =
    typeof body === "object" &&
    body !== null &&
    "url" in body &&
    typeof (body as { url: unknown }).url === "string"
      ? (body as { url: string }).url.trim()
      : "";

  if (!url || !isAllowedYoutubeUrl(url)) {
    return NextResponse.json(
      { error: "Enter a valid http(s) YouTube video URL" },
      { status: 400 },
    );
  }

  let outDir: string;
  try {
    outDir = await realpath(musicFolder);
  } catch {
    return NextResponse.json(
      { error: "Music folder not found" },
      { status: 500 },
    );
  }

  const outTemplate = path.join(outDir, "%(title)s [%(id)s].%(ext)s");
  const binary = ytDlpBinary();
  const args = [
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    "--restrict-filenames",
    "--no-playlist",
    "-o",
    outTemplate,
    url,
  ];

  const timeoutMs = Number.parseInt(
    process.env.YT_DLP_TIMEOUT_MS ?? "",
    10,
  );
  const waitMs =
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 45 * 60 * 1000;

  try {
    const { code, stderr } = await runYtDlp(binary, args, waitMs);
    if (code !== 0) {
      const tail = stderr.slice(-4000) || `yt-dlp exited with code ${code}`;
      return NextResponse.json({ error: tail }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
