import { fromMidi, get, pitchClass } from "@tonaljs/note";

/**
 * Parse a key label (e.g. `C`, `Am`, `F#m`, `Bb`) and return the chroma (0–11)
 * of its tonic pitch class. Major/minor only affects the label text—the root
 * letter is used for semitone distance.
 */
export function keyLabelToRootChroma(keyLabel: string): number | null {
  const t = keyLabel.trim();
  if (!t) return null;
  const m = t.match(/^([A-Ga-g])([#b♯♭]?)/);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = m[2].replace("♯", "#").replace("♭", "b");
  const name = `${letter}${acc}`;
  const n = get(`${name}4`);
  if (!n || n.empty) return null;
  return n.chroma;
}

/** True when both strings are non-empty and each has a parseable tonic root. */
export function transposeBothKeysParseable(
  sourceKey: string,
  destKey: string,
): boolean {
  const s = sourceKey.trim();
  const d = destKey.trim();
  if (!s || !d) return false;
  return keyLabelToRootChroma(s) !== null && keyLabelToRootChroma(d) !== null;
}

/** Minor key if there is a trailing minor indicator after the root (e.g. Am, A m). */
export function isMinorKeyLabel(keyLabel: string): boolean {
  const t = keyLabel.trim();
  if (!t) return false;
  const m = t.match(/^([A-G][#b♯♭]?)([\s\S]*)$/i);
  if (!m) return false;
  const rest = m[2].trim().toLowerCase();
  return rest.startsWith("m");
}

/**
 * Move the source key label by an integer semitone offset on the tonic;
 * preserves major vs minor spelling from the source label.
 */
export function transposeKeyLabelBySteps(
  sourceKey: string,
  semitoneSteps: number,
): string | null {
  const fromChroma = keyLabelToRootChroma(sourceKey);
  if (fromChroma === null) return null;
  if (!Number.isFinite(semitoneSteps)) return null;
  const minor = isMinorKeyLabel(sourceKey);
  const newChroma = (((fromChroma + semitoneSteps) % 12) + 12) % 12;
  const n = get(fromMidi(60 + newChroma));
  if (!n || n.empty) return null;
  const root = pitchClass(n.name);
  return minor ? `${root}m` : root;
}

/**
 * Shortest signed distance in semitones between two key roots (same notion as
 * shifting a chord chart by changing key centers).
 */
export function shortestSemitoneStepsBetweenKeys(
  sourceKey: string,
  destKey: string,
): number | null {
  const from = keyLabelToRootChroma(sourceKey);
  const to = keyLabelToRootChroma(destKey);
  if (from === null || to === null) return null;
  let d = to - from;
  if (d > 6) d -= 12;
  if (d < -6) d += 12;
  return d;
}
