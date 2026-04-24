export type DiscogsReleaseListItem = {
  id: number;
  type: string;
  title: string;
  year: number | null;
  format: string | null;
  /**
   * Optional structured format info (when present in cached JSON).
   * Discogs APIs sometimes return a `formats` array with `descriptions`.
   */
  formats?: Array<{ descriptions?: string[] }>;
  label: string | null;
  role: string | null;
  thumb: string | null;
};

export type DiscogsPrimaryStudioAlbum = DiscogsReleaseListItem & {
  cleanTitle: string;
  canonicalYear: number | null;
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

function parseFormats(raw: unknown): Array<{ descriptions?: string[] }> | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Array<{ descriptions?: string[] }> = [];
  for (const f of raw) {
    if (!isRecord(f)) continue;
    const d = f.descriptions;
    const descriptions = Array.isArray(d) ? d.filter((x): x is string => typeof x === "string") : undefined;
    out.push(descriptions ? { descriptions } : {});
  }
  return out.length ? out : undefined;
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
    formats: parseFormats(raw.formats),
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

/**
 * Identify an artist's "primary studio albums" from Discogs artist releases.
 *
 * Discogs artist releases includes many non-studio items: live tour archives, bootlegs,
 * compilations, reissues, promos, etc. We keep only "Main" role master entries and then:
 * - exclude common non-studio keywords in title or formats
 * - require it to look like a full-length album
 * - normalize/dedupe by a cleaned title
 * - sort by year ascending (missing years last)
 *
 * Tweak points:
 * - `blacklist` for exclusions
 * - `looksLikeAlbum` heuristic
 * - `normalizeTitleForDedupe` title cleaning rules
 */
export function isPrimaryStudioAlbum(r: DiscogsReleaseListItem): boolean {
  if ((r.role ?? "").trim() !== "Main") return false;
  if (r.type !== "master") return false;

  const title = (r.title || "").toLowerCase().trim();
  const formatsText = discogsFormatsText(r);
  // If Discogs didn't include any format descriptors for this master, we can't reliably
  // distinguish albums from masters representing singles, radio items, etc.
  // The releases fetch route enriches many masters with `formats[].descriptions`; without
  // that enrichment we conservatively exclude.
  if (formatsText.trim() === "") return false;

  // Exclude common non-studio categories. Keep broad but avoid matching ordinary words.
  const blacklist =
    /\b(live|tour|bootleg|unplugged|compilation|best of|greatest( hits)?|lost dogs|rearviewmirror|benaroya|soundtrack|rarit(?:y|ies)|remaster(?:ed)?|reissue|deluxe|anniversary|single|ep|promo|christmas|fan\s*club)\b/i;

  if (blacklist.test(title) || blacklist.test(formatsText)) return false;

  // Require it to look like a full album.
  const looksLikeAlbum =
    /\b(album|lp|full\s*length)\b/i.test(formatsText) ||
    /\b(cd|vinyl)\b/i.test(formatsText) ||
    !/\b(single|ep|7\"|12\"|45)\b/i.test(formatsText);

  return looksLikeAlbum;
}

function discogsFormatsText(r: DiscogsReleaseListItem): string {
  const fromArray =
    r.formats
      ?.flatMap((f) => (Array.isArray(f.descriptions) ? f.descriptions : []))
      .join(" ") ?? "";
  const fromString = r.format ?? "";
  return `${fromArray} ${fromString}`.toLowerCase();
}

function normalizeTitleForDedupe(title: string): string {
  const t = title.trim();
  // Strip common suffixes like "(Remastered)", "(Deluxe Edition)", "(Reissue)" etc.
  // Keep this conservative: only remove bracketed annotations at the end.
  const stripped = t.replace(/\s*[\(\[]\s*(remaster(?:ed)?|deluxe( edition)?|anniversary( edition)?|expanded|reissue|re-release|bonus tracks?)\s*[\)\]]\s*$/i, "");
  return stripped.toLowerCase().trim();
}

export function selectPrimaryStudioAlbums(
  releases: DiscogsReleaseListItem[],
): DiscogsPrimaryStudioAlbum[] {
  const candidates = releases.filter(isPrimaryStudioAlbum);

  const dedup = new Map<string, DiscogsPrimaryStudioAlbum>();
  for (const r of candidates) {
    const cleanTitle = normalizeTitleForDedupe(r.title || "—");
    const canonicalYear = typeof r.year === "number" && Number.isFinite(r.year) ? r.year : null;
    const prev = dedup.get(cleanTitle);
    if (!prev) {
      dedup.set(cleanTitle, { ...r, cleanTitle, canonicalYear });
      continue;
    }
    // Prefer the one with a year; otherwise keep the first.
    if (prev.canonicalYear == null && canonicalYear != null) {
      dedup.set(cleanTitle, { ...r, cleanTitle, canonicalYear });
    }
  }

  const out = [...dedup.values()];
  out.sort((a, b) => {
    const ay = a.canonicalYear;
    const by = b.canonicalYear;
    if (ay == null && by == null) return a.cleanTitle.localeCompare(b.cleanTitle);
    if (ay == null) return 1;
    if (by == null) return -1;
    return ay - by || a.cleanTitle.localeCompare(b.cleanTitle);
  });
  return out;
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
