/**
 * Parse a single Range header value of the form "bytes=start-end"
 * for static file responses (suffix and open-ended ranges supported).
 */
export function parseBytesRange(
  rangeHeader: string,
  fileSize: number,
): { start: number; end: number } | null {
  const range = rangeHeader.trim();
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) return null;

  const [, startStr, endStr] = match;

  if (startStr === "" && endStr !== "") {
    const suffix = parseInt(endStr, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    const start = Math.max(0, fileSize - suffix);
    return { start, end: fileSize - 1 };
  }

  const start = startStr === "" ? 0 : parseInt(startStr, 10);
  if (!Number.isFinite(start) || start < 0 || start >= fileSize) {
    return null;
  }

  let end =
    endStr === "" ? fileSize - 1 : parseInt(endStr, 10);
  if (!Number.isFinite(end)) return null;
  if (end >= fileSize) end = fileSize - 1;
  if (start > end) return null;

  return { start, end };
}
