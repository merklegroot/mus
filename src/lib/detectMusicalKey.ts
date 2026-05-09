import { readFile } from "node:fs/promises";
import decodeMp3 from "@audio/decode-mp3";
import { chroma, key } from "pitch-detection";

const FRAME_SIZE = 4096;
const HOP_SIZE = 2048;
/** Limit decode/analysis to keep requests bounded on large files */
const MAX_ANALYSIS_SECONDS = 120;

export type DetectMusicalKeyResult = {
  /** Key label from Krumhansl–Schmuckler (e.g. `C`, `F#m`) */
  label: string;
  /** Pearson correlation of the winning profile (typically in [-1, 1]) */
  confidence: number;
};

function mixToMono(channelData: Float32Array[]): Float32Array {
  if (channelData.length === 0) {
    throw new Error("No audio channels");
  }
  if (channelData.length === 1) {
    return channelData[0];
  }
  const len = channelData[0].length;
  const mono = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (let c = 0; c < channelData.length; c++) {
      sum += channelData[c][i];
    }
    mono[i] = sum / channelData.length;
  }
  return mono;
}

/**
 * Decode an MP3 buffer and estimate musical key from spectral chroma (NNLS)
 * averaged across sliding windows (Krumhansl–Schmuckler).
 */
export async function detectMusicalKeyFromMp3Buffer(
  buffer: Uint8Array,
): Promise<DetectMusicalKeyResult> {
  const audio = await decodeMp3(buffer);
  const fs = audio.sampleRate;
  const mono = mixToMono(audio.channelData);

  if (mono.length === 0) {
    throw new Error("Empty audio");
  }

  const maxSamples = Math.floor(MAX_ANALYSIS_SECONDS * fs);
  const samples =
    mono.length > maxSamples ? mono.subarray(0, maxSamples) : mono;

  if (samples.length < FRAME_SIZE) {
    throw new Error("Audio too short to analyze");
  }

  const frames: Float64Array[] = [];
  for (let i = 0; i + FRAME_SIZE <= samples.length; i += HOP_SIZE) {
    frames.push(
      chroma(samples.subarray(i, i + FRAME_SIZE), {
        fs,
        method: "nnls",
      }),
    );
  }

  if (frames.length === 0) {
    throw new Error("Could not extract audio frames");
  }

  const result = key(frames);
  return {
    label: result.label,
    confidence: result.confidence,
  };
}

export async function detectMusicalKeyFromMp3Path(
  absolutePath: string,
): Promise<DetectMusicalKeyResult> {
  const buf = await readFile(absolutePath);
  return detectMusicalKeyFromMp3Buffer(buf);
}
