import { inferArtistTitleFromFilename } from "@/lib/inferArtistTitleFromFilename";

export type FilterableSong = {
  filename: string;
  artist: string | null;
  title?: string | null;
  album?: string | null;
};

export function songMatchesTextFilter(
  s: FilterableSong,
  search: string,
): boolean {
  const terms = search
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return true;

  const inferred = inferArtistTitleFromFilename(s.filename).primary;
  const searchable = [
    s.filename,
    s.title,
    s.artist,
    s.album,
    inferred.title,
    inferred.artist,
  ]
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim() !== "",
    )
    .join(" ")
    .toLowerCase();
  return terms.every((term) => searchable.includes(term));
}

/**
 * Match /api/artists semantics: ID3 artist or filename inference counts;
 * synthetic "Unknown" when the merged artist from the API is empty.
 */
export function songMatchesArtistFilter(
  s: FilterableSong,
  filterArtist: string,
): boolean {
  const want = filterArtist.trim();
  if (want === "") return false;

  if (want === "Unknown") {
    return (s.artist?.trim() ?? "") === "";
  }

  const merged = s.artist?.trim() ?? "";
  if (merged === want) return true;

  const inferred =
    inferArtistTitleFromFilename(s.filename).primary.artist?.trim() ?? "";
  return inferred === want;
}

export function albumMatches(
  songAlbum: string | null,
  filterAlbum: string,
): boolean {
  const a = songAlbum?.trim() ?? "";
  const b = filterAlbum.trim();
  return a.length > 0 && a === b;
}
