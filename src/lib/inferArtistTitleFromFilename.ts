/**
 * Heuristic artist/title inference from an MP3 filename (no network, no DB).
 * Tuned for common YouTube rip / store-style names, not guaranteed correct.
 */

export type FilenameInterpretation = {
  artist: string | null;
  title: string | null;
  method: string;
};

export type FilenameInferenceResult = {
  /** Original basename including .mp3 */
  filename: string;
  /** Extension removed, before noise stripping */
  stem: string;
  /** After removing common bracket suffixes / tags */
  cleanStem: string;
  /** Distinct guesses (first is primary) */
  interpretations: FilenameInterpretation[];
  primary: FilenameInterpretation;
};

function stripExtension(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".mp3")) return name.slice(0, -4);
  return name;
}

function stripBracketNoise(s: string): string {
  let t = s.trim();
  const tailPatterns = [
    /\s*\([^)]*official[^)]*\)/gi,
    /\s*\([^)]*lyrics?[^)]*\)/gi,
    /\s*\([^)]*remaster[^)]*\)/gi,
    /\s*\([^)]*audio[^)]*\)/gi,
    /\s*\([^)]*video[^)]*\)/gi,
    /\s*\([^)]*mv[^)]*\)/gi,
    /\s*\([^)]*full\s*album[^)]*\)/gi,
    /\s*\[[^\]]*\]/g,
    /\s*【[^】]*】/g,
  ];
  for (const p of tailPatterns) {
    t = t.replace(p, "").trim();
  }
  // After stripping bracket suffixes (e.g. YouTube IDs), strip trailing generic tags.
  t = t.replace(/\s+(official\s+audio|official\s+video|lyrics?|audio|video)\s*$/gi, "").trim();
  // Also strip trailing "remaster" tags when they appear as plain suffixes.
  // Examples: "Song Remastered", "Song Remastered 2007", "Song - Remaster 2011"
  t = t
    .replace(/\s*[-–—]?\s*remaster(?:ed)?(?:\s+\d{4})?\s*$/gi, "")
    .trim();
  return t.replace(/\s{2,}/g, " ").trim();
}

function nonEmpty(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t && t.length > 0 ? t : null;
}

function tripleNumberedArtistTitle(
  s: string,
): FilenameInterpretation | null {
  const m = /^(\d+)\s*-\s*(.+?)\s+-\s+(.+)$/.exec(s);
  if (!m) return null;
  const artist = nonEmpty(m[2]);
  const title = nonEmpty(m[3]);
  if (!artist || !title) return null;
  return {
    artist,
    title,
    method: "leading-track-number-then-artist-dash-title",
  };
}

/** "Left - Right" when left is not only digits (avoids "03 - Song" → artist 03). */
function dashSplitMeaningful(s: string): FilenameInterpretation | null {
  const idx = s.indexOf(" - ");
  if (idx <= 0) return null;
  const left = s.slice(0, idx).trim();
  const right = s.slice(idx + 3).trim();
  if (/^\d+$/.test(left)) return null;
  const artist = nonEmpty(left);
  const title = nonEmpty(right);
  if (!artist || !title) return null;
  return {
    artist,
    title,
    method: "split-on-dash-artist-first",
  };
}

function dashSplitSwapped(s: string): FilenameInterpretation | null {
  const idx = s.indexOf(" - ");
  if (idx <= 0) return null;
  const left = s.slice(0, idx).trim();
  const right = s.slice(idx + 3).trim();
  if (/^\d+$/.test(left)) return null;
  const a = nonEmpty(left);
  const b = nonEmpty(right);
  if (!a || !b) return null;
  return {
    artist: b,
    title: a,
    method: "split-on-dash-title-first",
  };
}

function pipeSplit(s: string): FilenameInterpretation | null {
  const idx = s.indexOf(" | ");
  if (idx <= 0) return null;
  const a = nonEmpty(s.slice(0, idx));
  const b = nonEmpty(s.slice(idx + 3));
  if (!a || !b) return null;
  return {
    artist: a,
    title: b,
    method: "split-on-pipe",
  };
}

function uniqByArtistTitle(
  list: FilenameInterpretation[],
): FilenameInterpretation[] {
  const seen = new Set<string>();
  const out: FilenameInterpretation[] = [];
  for (const it of list) {
    const key = `${it.artist ?? ""}\u0000${it.title ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

export function inferArtistTitleFromFilename(
  filename: string,
): FilenameInferenceResult {
  const stem = stripExtension(filename.trim());
  // Many sources use underscores as spaces (e.g. YouTube rips). Normalize early so the
  // later split heuristics (" - ", " | ") and noise stripping can work.
  const normalizedStem = stem.replace(/_/g, " ").replace(/\s{2,}/g, " ").trim();
  const cleanStem = stripBracketNoise(normalizedStem);
  const interpretations: FilenameInterpretation[] = [];

  const triple = tripleNumberedArtistTitle(cleanStem);
  if (triple) interpretations.push(triple);

  const numbered = /^(\d+)\s*-\s*(.+)$/.exec(cleanStem);
  const core = numbered
    ? stripBracketNoise(numbered[2].trim())
    : cleanStem;

  const pipe = pipeSplit(core);
  if (pipe) interpretations.push(pipe);

  const dash = dashSplitMeaningful(core);
  if (dash) interpretations.push(dash);

  const dashRev = dashSplitSwapped(core);
  if (dashRev) interpretations.push(dashRev);

  if (!dash && !dashRev && !pipe && numbered) {
    const only = nonEmpty(core);
    if (only) {
      interpretations.push({
        artist: null,
        title: only,
        method: "leading-track-number-then-title-only",
      });
    }
  }

  const onlyStem = nonEmpty(cleanStem);
  if (onlyStem && interpretations.length === 0) {
    interpretations.push({
      artist: null,
      title: onlyStem,
      method: "whole-stem-as-title",
    });
  }

  const merged = uniqByArtistTitle(interpretations);

  const primary =
    merged[0] ??
    ({
      artist: null,
      title: onlyStem,
      method: "unknown",
    } satisfies FilenameInterpretation);

  return {
    filename: filename.trim(),
    stem,
    cleanStem,
    interpretations: merged,
    primary,
  };
}
