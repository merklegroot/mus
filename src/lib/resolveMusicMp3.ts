import { join, sep } from "node:path";
import { realpath, stat } from "node:fs/promises";
import type { Stats } from "node:fs";

export type ResolveMusicMp3Result =
  | { ok: true; absolutePath: string; segment: string; stats: Stats }
  | { ok: false; status: number; error: string };

export async function resolveMusicMp3(
  nameParam: string,
): Promise<ResolveMusicMp3Result> {
  const musicFolder = process.env.MUSIC_FOLDER;
  if (!musicFolder) {
    return { ok: false, status: 400, error: "MUSIC_FOLDER is not configured" };
  }

  let segment: string;
  try {
    segment = decodeURIComponent(nameParam);
  } catch {
    return { ok: false, status: 400, error: "Invalid filename" };
  }

  if (!segment || segment.includes("\0") || /[/\\]/.test(segment)) {
    return { ok: false, status: 400, error: "Invalid filename" };
  }
  if (!segment.toLowerCase().endsWith(".mp3")) {
    return { ok: false, status: 400, error: "Invalid filename" };
  }

  let root: string;
  try {
    root = await realpath(musicFolder);
  } catch {
    return { ok: false, status: 500, error: "Music folder not found" };
  }

  const candidate = join(root, segment);
  let resolved: string;
  try {
    resolved = await realpath(candidate);
  } catch {
    return { ok: false, status: 404, error: "Not found" };
  }

  const prefix = root.endsWith(sep) ? root : root + sep;
  if (!resolved.startsWith(prefix)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const st = await stat(resolved).catch(() => null);
  if (!st?.isFile()) {
    return { ok: false, status: 404, error: "Not found" };
  }

  return { ok: true, absolutePath: resolved, segment, stats: st };
}
