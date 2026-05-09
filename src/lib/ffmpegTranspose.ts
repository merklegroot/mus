import { spawn } from "node:child_process";
import { join } from "node:path";

function ffmpegBinary(): string {
  const v = process.env.FFMPEG_PATH?.trim();
  return v && v.length > 0 ? v : "ffmpeg";
}

function ffprobeBinary(): string {
  const v = process.env.FFPROBE_PATH?.trim();
  return v && v.length > 0 ? v : "ffprobe";
}

export async function probeMp3SampleRate(
  absolutePath: string,
): Promise<number> {
  const ffprobe = ffprobeBinary();
  return new Promise((resolve, reject) => {
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    const child = spawn(
      ffprobe,
      [
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=sample_rate",
        "-of",
        "csv=p=0",
        absolutePath,
      ],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    child.stdout?.on("data", (d: Buffer) => outChunks.push(d));
    child.stderr?.on("data", (d: Buffer) => errChunks.push(d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `ffprobe exited ${code}: ${Buffer.concat(errChunks).toString("utf8").slice(-400)}`,
          ),
        );
        return;
      }
      const text = Buffer.concat(outChunks).toString("utf8").trim();
      const line = text.split("\n")[0]?.trim() ?? "";
      const sr = Number.parseInt(line, 10);
      if (!Number.isFinite(sr) || sr <= 0) {
        reject(new Error(`Could not read sample rate from ffprobe: ${text}`));
        return;
      }
      resolve(sr);
    });
  });
}

/**
 * Pitch-shift by `semitones` while preserving tempo (asetrate + atempo chain).
 */
export function buildPitchShiftAfFilter(
  sampleRate: number,
  semitones: number,
): string {
  const ratio = Math.pow(2, semitones / 12);
  const tempoTotal = 1 / ratio;
  const parts: string[] = [`asetrate=${sampleRate * ratio}`];
  let p = tempoTotal;
  const EPS = 1e-6;
  while (p > 2 + EPS) {
    parts.push("atempo=2");
    p /= 2;
  }
  while (p < 0.5 - EPS) {
    parts.push("atempo=0.5");
    p /= 0.5;
  }
  if (Math.abs(p - 1) > EPS) {
    parts.push(`atempo=${p}`);
  }
  return parts.join(",");
}

export async function runFfmpegTransposeMp3(args: {
  inputAbsolutePath: string;
  outputAbsolutePath: string;
  semitones: number;
}): Promise<void> {
  const sr = await probeMp3SampleRate(args.inputAbsolutePath);
  const af = buildPitchShiftAfFilter(sr, args.semitones);
  const ffmpeg = ffmpegBinary();

  await new Promise<void>((resolve, reject) => {
    const stderrChunks: Buffer[] = [];
    const child = spawn(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        args.inputAbsolutePath,
        "-vn",
        "-af",
        af,
        "-codec:a",
        "libmp3lame",
        "-q:a",
        "2",
        args.outputAbsolutePath,
      ],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    child.stderr?.on("data", (d: Buffer) => {
      stderrChunks.push(d);
      const total = stderrChunks.reduce((a, b) => a + b.length, 0);
      if (total > 512_000) stderrChunks.splice(0, stderrChunks.length - 16);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const tail = Buffer.concat(stderrChunks).toString("utf8").trim().slice(-2000);
      reject(new Error(`ffmpeg exited ${code}${tail ? `: ${tail}` : ""}`));
    });
  });
}

/** Pick `basename` or `stem (n).mp3` if the file already exists in `dir`. */
export async function pickUniqueFilename(
  dir: string,
  basename: string,
): Promise<string> {
  const { access, constants } = await import("node:fs/promises");
  let candidate = basename;
  let n = 0;
  const lower = basename.toLowerCase();
  const extIdx = lower.lastIndexOf(".mp3");
  const stem =
    extIdx > 0 ? basename.slice(0, extIdx) : basename.replace(/\.mp3$/i, "");
  const ext = ".mp3";

  async function exists(name: string): Promise<boolean> {
    try {
      await access(join(dir, name), constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  while (await exists(candidate)) {
    n += 1;
    candidate = `${stem} (${n})${ext}`;
  }
  return candidate;
}
