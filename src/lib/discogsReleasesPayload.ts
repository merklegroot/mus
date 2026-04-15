export type DiscogsReleaseListItem = {
  id: number;
  type: string;
  title: string;
  year: number | null;
  format: string | null;
  label: string | null;
  role: string | null;
  thumb: string | null;
};

export type ParsedDiscogsReleasesCache = {
  releases: DiscogsReleaseListItem[];
  items: number;
  pagesFetched: number;
  perPage: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function strOrNull(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  return null;
}

function parseReleaseRow(raw: unknown): DiscogsReleaseListItem | null {
  if (!isRecord(raw)) return null;
  const id = numOrNull(raw.id);
  if (id == null) return null;
  const type = strOrNull(raw.type) ?? "release";
  const title = strOrNull(raw.title) ?? "—";
  return {
    id,
    type,
    title,
    year: numOrNull(raw.year),
    format: strOrNull(raw.format),
    label: strOrNull(raw.label),
    role: strOrNull(raw.role),
    thumb: strOrNull(raw.thumb),
  };
}

export function discogsWebUrlForListItem(item: DiscogsReleaseListItem): string {
  const t = item.type.toLowerCase();
  if (t === "master") return `https://www.discogs.com/master/${item.id}`;
  return `https://www.discogs.com/release/${item.id}`;
}

export function parseStoredReleasesJson(dataJson: string): ParsedDiscogsReleasesCache | null {
  try {
    const raw = JSON.parse(dataJson) as unknown;
    if (!isRecord(raw)) return null;
    const rel = raw.releases;
    if (!Array.isArray(rel)) return null;
    const releases: DiscogsReleaseListItem[] = [];
    for (const row of rel) {
      const p = parseReleaseRow(row);
      if (p) releases.push(p);
    }
    const items = numOrNull(raw.items) ?? releases.length;
    const pagesFetched = numOrNull(raw.pagesFetched) ?? 1;
    const perPage = numOrNull(raw.perPage) ?? 100;
    return {
      releases,
      items,
      pagesFetched,
      perPage,
    };
  } catch {
    return null;
  }
}
