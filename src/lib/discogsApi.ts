const DISCOGS_ORIGIN = "https://api.discogs.com";

export type DiscogsSearchHit = {
  id?: unknown;
  type?: unknown;
  title?: unknown;
};

export type DiscogsSearchResponse = {
  results?: unknown;
};

export function discogsRequestHeaders(): Headers {
  const h = new Headers();
  h.set("Accept", "application/json");
  h.set(
    "User-Agent",
    process.env.DISCOGS_USER_AGENT?.trim() ||
      "mus/0.1 (https://example.invalid/discogs-user-agent)",
  );
  const token = process.env.DISCOGS_TOKEN?.trim();
  if (token) {
    h.set("Authorization", `Discogs token=${token}`);
  }
  return h;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function parseSearchHits(data: unknown): DiscogsSearchHit[] {
  if (!isRecord(data)) return [];
  const raw = data.results;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord) as DiscogsSearchHit[];
}

export function pickArtistSearchHit(
  hits: DiscogsSearchHit[],
  query: string,
): { id: number; title: string } | null {
  const want = query.trim().toLowerCase();
  const artists = hits.filter((h) => h.type === "artist");
  if (artists.length === 0) return null;

  const asPair = (h: DiscogsSearchHit): { id: number; title: string } | null => {
    const id = typeof h.id === "number" && Number.isFinite(h.id) ? h.id : null;
    const title = typeof h.title === "string" ? h.title.trim() : "";
    if (id == null || title === "") return null;
    return { id, title };
  };

  for (const h of artists) {
    const p = asPair(h);
    if (p && p.title.toLowerCase() === want) return p;
  }
  for (const h of artists) {
    const p = asPair(h);
    if (p) return p;
  }
  return null;
}

export async function discogsSearchArtists(query: string): Promise<unknown> {
  const url = new URL(`${DISCOGS_ORIGIN}/database/search`);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("type", "artist");
  url.searchParams.set("per_page", "10");

  const res = await fetch(url, { headers: discogsRequestHeaders() });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Discogs search failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Discogs search returned non-JSON");
  }
}

export async function discogsFetchArtistById(id: number): Promise<unknown> {
  const url = `${DISCOGS_ORIGIN}/artists/${id}`;
  const res = await fetch(url, { headers: discogsRequestHeaders() });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Discogs artist fetch failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Discogs artist response was not JSON");
  }
}

const RELEASES_PER_PAGE = 100;
/** Guardrail for very large discographies. */
const RELEASES_MAX_PAGES = 250;

function discogsPagination(data: unknown): {
  page: number;
  pages: number;
  items: number;
  perPage: number;
} | null {
  if (!isRecord(data)) return null;
  const p = data.pagination;
  if (!isRecord(p)) return null;
  const page = typeof p.page === "number" && Number.isFinite(p.page) ? p.page : 1;
  const pages = typeof p.pages === "number" && Number.isFinite(p.pages) ? p.pages : 1;
  const items = typeof p.items === "number" && Number.isFinite(p.items) ? p.items : 0;
  const perPage =
    typeof p.per_page === "number" && Number.isFinite(p.per_page) ? p.per_page : RELEASES_PER_PAGE;
  return { page, pages: Math.max(1, pages), items, perPage };
}

function releasesArray(data: unknown): unknown[] {
  if (!isRecord(data)) return [];
  const r = data.releases;
  return Array.isArray(r) ? r : [];
}

export async function discogsFetchArtistReleasesPage(
  artistId: number,
  page: number,
): Promise<unknown> {
  const url = new URL(`${DISCOGS_ORIGIN}/artists/${artistId}/releases`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(RELEASES_PER_PAGE));
  url.searchParams.set("sort", "year");
  url.searchParams.set("sort_order", "desc");

  const res = await fetch(url.toString(), { headers: discogsRequestHeaders() });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Discogs artist releases failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Discogs releases response was not JSON");
  }
}

/**
 * Fetches every page of /artists/{id}/releases and returns one merged list.
 */
export async function discogsFetchAllArtistReleases(artistId: number): Promise<{
  releases: unknown[];
  items: number;
  pagesFetched: number;
  perPage: number;
}> {
  const first = await discogsFetchArtistReleasesPage(artistId, 1);
  const pag = discogsPagination(first);
  if (!pag) {
    const only = releasesArray(first);
    return {
      releases: only,
      items: only.length,
      pagesFetched: 1,
      perPage: RELEASES_PER_PAGE,
    };
  }

  const merged: unknown[] = [...releasesArray(first)];
  const totalPages = Math.min(pag.pages, RELEASES_MAX_PAGES);
  for (let p = 2; p <= totalPages; p++) {
    const pageData = await discogsFetchArtistReleasesPage(artistId, p);
    merged.push(...releasesArray(pageData));
  }

  return {
    releases: merged,
    items: pag.items,
    pagesFetched: totalPages,
    perPage: pag.perPage,
  };
}
