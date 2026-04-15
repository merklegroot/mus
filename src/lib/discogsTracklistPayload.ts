export type DiscogsTracklistItem = {
  position: string | null;
  title: string;
  duration: string | null;
  type: string | null;
};

export type ParsedDiscogsTracklistCache = {
  tracklist: DiscogsTracklistItem[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function parseTrackRow(raw: unknown): DiscogsTracklistItem | null {
  if (!isRecord(raw)) return null;
  const title = strOrNull(raw.title) ?? "—";
  return {
    position: strOrNull(raw.position),
    title,
    duration: strOrNull(raw.duration),
    type: strOrNull(raw.type_ ?? raw.type),
  };
}

export function parseStoredTracklistJson(
  dataJson: string,
): ParsedDiscogsTracklistCache | null {
  try {
    const raw = JSON.parse(dataJson) as unknown;
    if (!isRecord(raw)) return null;
    const t = raw.tracklist;
    if (!Array.isArray(t)) return null;
    const tracklist: DiscogsTracklistItem[] = [];
    for (const row of t) {
      const p = parseTrackRow(row);
      if (p) tracklist.push(p);
    }
    return { tracklist };
  } catch {
    return null;
  }
}

