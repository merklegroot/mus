import { dirname, join } from "node:path";
import NodeID3 from "node-id3";
import { realpath } from "node:fs/promises";
import { pickUniqueFilename, runFfmpegTransposeMp3 } from "@/lib/ffmpegTranspose";
import { syncTrackCacheAfterTagWrite } from "@/lib/id3TagPatch";
import { linkSongFileToSong } from "@/lib/songs";

function sanitizeFilenameBase(s: string): string {
  return s
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function stripMp3Ext(segment: string): string {
  return segment.replace(/\.mp3$/i, "");
}

function id3String(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function parseYearTag(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type TransposeSongAudioResult = {
  outputFilename: string;
  outputAbsolutePath: string;
  newTitle: string;
  semitones: number;
};

/**
 * Transcode the primary MP3 to a new file in the same folder,
 * pitch-shifted by `semitones` (tempo preserved). Copies ID3 where possible
 * and sets a title suffix naming the transposition.
 */
export async function transposeSongPrimaryMp3(args: {
  sourceFilename: string;
  sourceAbsolutePath: string;
  songId: number;
  semitones: number;
  destinationKeyLabel: string | null;
}): Promise<TransposeSongAudioResult> {
  const ratio = Math.pow(2, args.semitones / 12);
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new Error("Invalid transpose parameters");
  }

  const dir = dirname(args.sourceAbsolutePath);
  const stem = stripMp3Ext(args.sourceFilename);

  const prev = NodeID3.read(args.sourceAbsolutePath) ?? {};
  const stemPretty = stem.replace(/_/g, " ").trim();
  const originalTitle =
    id3String(prev.title) ?? (stemPretty !== "" ? stemPretty : stem);

  const keyPart =
    args.destinationKeyLabel && args.destinationKeyLabel.trim() !== ""
      ? `transposed to ${args.destinationKeyLabel.trim()}`
      : `${args.semitones >= 0 ? "+" : ""}${args.semitones} semitones`;

  const newTitle = `${originalTitle} [${keyPart}]`;

  const baseFilename = sanitizeFilenameBase(`${stem} [${keyPart}]`) + ".mp3";
  const uniqueSegment = await pickUniqueFilename(dir, baseFilename);
  const outputAbsolutePath = join(dir, uniqueSegment);

  await runFfmpegTransposeMp3({
    inputAbsolutePath: args.sourceAbsolutePath,
    outputAbsolutePath,
    semitones: args.semitones,
  });

  const merged = {
    ...(prev as Record<string, unknown>),
    title: newTitle,
  } as NodeID3.Tags;

  const writeResult = NodeID3.update(merged, outputAbsolutePath);
  if (writeResult !== true) {
    const msg =
      writeResult instanceof Error
        ? writeResult.message
        : "Failed to write ID3 tags to transposed file";
    throw new Error(msg);
  }

  await syncTrackCacheAfterTagWrite(uniqueSegment, outputAbsolutePath, {
    title: newTitle,
    artist: id3String(prev.artist),
    album: id3String(prev.album),
    genre: id3String(prev.genre),
    year: parseYearTag(prev.year),
  });

  linkSongFileToSong(args.songId, uniqueSegment);

  return {
    outputFilename: uniqueSegment,
    outputAbsolutePath,
    newTitle,
    semitones: args.semitones,
  };
}

export async function resolveMusicFolderRealpath(): Promise<string | null> {
  const raw = process.env.MUSIC_FOLDER?.trim();
  if (!raw) return null;
  try {
    return await realpath(raw);
  } catch {
    return null;
  }
}
