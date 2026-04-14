import { open, readFile } from "node:fs/promises";

const ID3V1_LEN = 128;
const ID3V1_TRACK_OFFSET = 126;
/**
 * If an ID3v1 trailer exists, keep it in sync with the ID3v2 TRCK value.
 *
 * Why: `music-metadata` parses both ID3v2 + ID3v1, and its post-processing can end up
 * preferring the ID3v1 track byte even after TRCK is updated.
 */
export async function syncId3v1TrackNumberIfPresent(
  absolutePath: string,
  trackNo: number | null,
): Promise<void> {
  const buf = await readFile(absolutePath);
  if (buf.length < ID3V1_LEN) return;

  const trailerOffset = buf.length - ID3V1_LEN;
  if (buf.subarray(trailerOffset, trailerOffset + 3).toString("latin1") !== "TAG") {
    return;
  }

  if (trackNo != null) {
    if (!Number.isFinite(trackNo) || trackNo < 0 || trackNo > 255) {
      throw new Error("Track number must be between 0 and 255 for ID3v1");
    }
  }

  const fd = await open(absolutePath, "r+");
  try {
    const pos = (await fd.stat()).size - ID3V1_LEN + ID3V1_TRACK_OFFSET;
    const byte = trackNo == null ? 0 : trackNo;
    const b = Buffer.alloc(1, byte);
    await fd.write(b, 0, 1, pos);
  } finally {
    await fd.close();
  }
}
