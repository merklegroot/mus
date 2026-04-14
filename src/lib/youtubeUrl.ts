const MAX_URL_LENGTH = 2048;

/** Hostnames we allow for yt-dlp (YouTube-only). */
function isYoutubeHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "youtu.be") return true;
  if (h === "youtube.com" || h === "www.youtube.com") return true;
  if (h.endsWith(".youtube.com")) return true;
  return false;
}

export function isAllowedYoutubeUrl(raw: string): boolean {
  if (!raw || raw.length > MAX_URL_LENGTH) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (!isYoutubeHost(u.hostname)) return false;
  if (u.username || u.password) return false;
  return true;
}
