import { inferArtistTitleFromFilename } from "@/lib/inferArtistTitleFromFilename";

/** ID3 artist when present, otherwise primary filename inference (same merge as track list / artists). */
export function mergedArtistForFilename(
  filename: string,
  id3Artist: string | null | undefined,
): string | null {
  const id3 =
    typeof id3Artist === "string" && id3Artist.trim() !== ""
      ? id3Artist.trim()
      : null;
  const inferred =
    inferArtistTitleFromFilename(filename).primary.artist?.trim() || null;
  return id3 ?? inferred;
}
