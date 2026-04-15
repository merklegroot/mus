"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { AlbumList } from "@/components/AlbumList";
import { ArtistList } from "@/components/ArtistList";
import { InferFromFilenamePanel } from "@/components/InferFromFilenamePanel";
import { inferArtistTitleFromFilename } from "@/lib/inferArtistTitleFromFilename";

type SongRow = { filename: string; artist: string | null; album: string | null };

type Mp3ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ready"; songs: SongRow[] };

function parseSongsResponse(data: unknown):
  | { ok: true; songs: SongRow[] }
  | { ok: false; message: string } {
  if (typeof data !== "object" || data === null) {
    return { ok: false, message: "Invalid response" };
  }
  const d = data as Record<string, unknown>;

  if (Array.isArray(d.songs)) {
    const songs: SongRow[] = [];
    for (const item of d.songs) {
      if (
        typeof item === "object" &&
        item !== null &&
        typeof (item as { filename: unknown }).filename === "string"
      ) {
        const filename = (item as { filename: string }).filename;
        const rawArtist = (item as { artist?: unknown }).artist;
        const artist =
          rawArtist === null || rawArtist === undefined
            ? null
            : typeof rawArtist === "string" && rawArtist.trim() !== ""
              ? rawArtist.trim()
              : null;
        const rawAlbum = (item as { album?: unknown }).album;
        const album =
          rawAlbum === null || rawAlbum === undefined
            ? null
            : typeof rawAlbum === "string" && rawAlbum.trim() !== ""
              ? rawAlbum.trim()
              : null;
        songs.push({ filename, artist, album });
      }
    }
    return { ok: true, songs };
  }

  if (Array.isArray(d.mp3s)) {
    const mp3s = d.mp3s.filter((n): n is string => typeof n === "string");
    return {
      ok: true,
      songs: mp3s.map((filename) => ({
        filename,
        artist: null,
        album: null,
      })),
    };
  }

  return { ok: false, message: "Invalid response" };
}

/** Match /api/artists semantics: ID3 artist or filename inference counts. */
function songMatchesArtistFilter(s: SongRow, filterArtist: string): boolean {
  const want = filterArtist.trim();
  if (want === "") return false;

  const merged = s.artist?.trim() ?? "";
  if (merged === want) return true;

  const inferred =
    inferArtistTitleFromFilename(s.filename).primary.artist?.trim() ?? "";
  return inferred === want;
}

function albumMatches(
  songAlbum: string | null,
  filterAlbum: string,
): boolean {
  const a = songAlbum?.trim() ?? "";
  const b = filterAlbum.trim();
  return a.length > 0 && a === b;
}

type Mp3Details = {
  filename: string;
  trackNumber: number | null;
  comments: string | null;
  sizeBytes: number;
  modified: string;
  title: string | null;
  titleSource?: "id3" | "filename" | "none";
  artist: string | null;
  artistSource?: "id3" | "filename" | "none";
  album: string | null;
  genre: string | null;
  year: number | null;
  durationSec: number | null;
  bitrateKbps: number | null;
  codec: string | null;
};

type DetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: Mp3Details };

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.floor(seconds));
  const s = total % 60;
  const m = Math.floor((total / 60) % 60);
  const h = Math.floor(total / 3600);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"] as const;
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function isMp3Details(data: unknown): data is Mp3Details {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.filename === "string" &&
    typeof d.sizeBytes === "number" &&
    typeof d.modified === "string"
  );
}

export function Mp3List() {
  const [state, setState] = useState<Mp3ListState>({ status: "loading" });
  const [filterArtist, setFilterArtist] = useState<string | null>(null);
  const [filterAlbum, setFilterAlbum] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const visibleSongs = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.songs.filter((s) => {
      if (filterArtist && !songMatchesArtistFilter(s, filterArtist)) {
        return false;
      }
      if (filterAlbum && !albumMatches(s.album, filterAlbum)) {
        return false;
      }
      return true;
    });
  }, [state, filterArtist, filterAlbum]);

  const albumList = useMemo(() => {
    if (state.status !== "ready") return [];
    const scope = filterArtist
      ? state.songs.filter((s) => songMatchesArtistFilter(s, filterArtist))
      : state.songs;
    const seen = new Set<string>();
    for (const s of scope) {
      const a = s.album?.trim();
      if (a) seen.add(a);
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [state, filterArtist]);

  const albumListStatus: "loading" | "error" | "empty" | "ready" =
    state.status === "loading"
      ? "loading"
      : state.status === "error"
        ? "error"
        : state.status === "empty"
          ? "empty"
          : "ready";

  useEffect(() => {
    if (!filterAlbum || state.status !== "ready") return;
    if (!albumList.includes(filterAlbum)) {
      setFilterAlbum(null);
    }
  }, [filterAlbum, albumList, state.status]);

  useEffect(() => {
    setDeleteConfirm(false);
    setDeleteError(null);
    setDeleteBusy(false);
  }, [selected]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/mp3s")
      .then(async (res) => {
        const data: unknown = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          const message =
            typeof data === "object" &&
            data !== null &&
            "error" in data &&
            typeof (data as { error: unknown }).error === "string"
              ? (data as { error: string }).error
              : res.statusText;
          setState({ status: "error", message });
          return;
        }

        const parsed = parseSongsResponse(data);
        if (!parsed.ok) {
          setState({ status: "error", message: parsed.message });
          return;
        }

        if (parsed.songs.length === 0) {
          setState({ status: "empty" });
        } else {
          setState({ status: "ready", songs: parsed.songs });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const songsForFilter =
    state.status === "ready" ? state.songs : null;

  useEffect(() => {
    if ((!filterArtist && !filterAlbum) || !selected || !songsForFilter) {
      return;
    }
    const stillVisible = songsForFilter.some((s) => {
      if (s.filename !== selected) return false;
      if (filterArtist && !songMatchesArtistFilter(s, filterArtist)) {
        return false;
      }
      if (filterAlbum && !albumMatches(s.album, filterAlbum)) {
        return false;
      }
      return true;
    });
    if (!stillVisible) {
      setSelected(null);
      setDetail(null);
    }
  }, [filterArtist, filterAlbum, selected, songsForFilter]);

  useEffect(() => {
    if (!selected) return;

    const ac = new AbortController();

    fetch(`/api/mp3s/${encodeURIComponent(selected)}`, { signal: ac.signal })
      .then(async (res) => {
        const data: unknown = await res.json();
        if (ac.signal.aborted) return;

        if (!res.ok) {
          const message =
            typeof data === "object" &&
            data !== null &&
            "error" in data &&
            typeof (data as { error: unknown }).error === "string"
              ? (data as { error: string }).error
              : res.statusText;
          setDetail({ status: "error", message });
          return;
        }

        if (!isMp3Details(data)) {
          setDetail({ status: "error", message: "Invalid response" });
          return;
        }

        setDetail({ status: "ready", data });
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        setDetail({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });

    return () => ac.abort();
  }, [selected]);

  const panelClass =
    "rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 text-left dark:border-zinc-800 dark:bg-zinc-900/40";

  return (
    <div className="grid w-full max-w-[120rem] grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-4 lg:items-stretch">
      <div
        className={`flex h-full min-h-0 min-w-0 flex-col lg:max-h-[min(90vh,56rem)] ${selected ? "max-lg:hidden" : ""}`}
      >
        <ArtistList
          selectedArtist={filterArtist}
          onArtistClick={(artist) => {
            setFilterArtist((prev) => (prev === artist ? null : artist));
          }}
          onClearArtistFilter={() => setFilterArtist(null)}
        />
      </div>

      <div
        className={`flex h-full min-h-0 min-w-0 flex-col lg:max-h-[min(90vh,56rem)] ${selected ? "max-lg:hidden" : ""}`}
      >
        <AlbumList
          status={albumListStatus}
          errorMessage={state.status === "error" ? state.message : undefined}
          albums={albumList}
          selectedAlbum={filterAlbum}
          filterArtist={filterArtist}
          onAlbumClick={(album) => {
            setFilterAlbum((prev) => (prev === album ? null : album));
          }}
          onClearAlbumFilter={() => setFilterAlbum(null)}
        />
      </div>

      <section
        className={`${panelClass} flex h-full min-h-0 min-w-0 flex-col lg:max-h-[min(90vh,56rem)] ${selected ? "max-lg:hidden" : ""}`}
        aria-label="Songs in music folder"
        aria-busy={state.status === "loading"}
      >
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Songs
            {filterArtist ? (
              <span className="ml-1.5 font-normal text-zinc-500 dark:text-zinc-400">
                · {filterArtist}
              </span>
            ) : null}
            {filterAlbum ? (
              <span className="ml-1.5 font-normal text-zinc-500 dark:text-zinc-400">
                · {filterAlbum}
              </span>
            ) : null}
          </h2>
          {filterArtist || filterAlbum ? (
            <button
              type="button"
              onClick={() => {
                setFilterArtist(null);
                setFilterAlbum(null);
              }}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
            >
              Clear filters
            </button>
          ) : null}
        </div>
        {state.status === "loading" ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : state.status === "error" ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {state.message === "MUSIC_FOLDER is not configured" ? (
              <>Set MUSIC_FOLDER in .env.local.</>
            ) : (
              state.message
            )}
          </p>
        ) : state.status === "empty" ? (
          <p className="text-sm text-zinc-500">No .mp3 files in this folder.</p>
        ) : visibleSongs.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No songs match these filters.{" "}
            <button
              type="button"
              className="text-zinc-800 underline underline-offset-2 hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-zinc-50"
              onClick={() => {
                setFilterArtist(null);
                setFilterAlbum(null);
              }}
            >
              Clear filters
            </button>
          </p>
        ) : (
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto text-sm">
            {visibleSongs.map((row, idx) => (
              <li key={`${row.filename}:${idx}`}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(row.filename);
                    setDetail({ status: "loading" });
                  }}
                  className={`w-full rounded-md px-2 py-2 text-left break-all transition-colors ${
                    selected === row.filename
                      ? "bg-zinc-200 font-medium text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
                      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  {row.filename}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside
        className={`${panelClass} flex h-full min-h-0 min-w-0 flex-col overflow-y-auto lg:max-h-[min(90vh,56rem)] ${selected ? "" : "max-lg:hidden"}`}
        aria-label="Track details"
      >
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Details
          </h2>
          {selected ? (
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setDetail(null);
              }}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
            >
              Clear selection
            </button>
          ) : null}
        </div>
        {!selected ? (
          <p className="text-sm text-zinc-500">
            Select a track to see details.
          </p>
        ) : (
          <>
            <audio
              key={selected}
              controls
              preload="metadata"
              className="mb-4 h-10 w-full accent-zinc-900 dark:accent-zinc-100"
              src={`/api/mp3s/${encodeURIComponent(selected)}/stream`}
            >
              Your browser does not support the audio element.
            </audio>
            <InferFromFilenamePanel
              filename={selected}
              onRenamed={async (newFilename) => {
                setSelected(newFilename);
                setDetail({ status: "loading" });
                try {
                  const res = await fetch("/api/mp3s");
                  const data: unknown = await res.json();
                  if (!res.ok) return;
                  const parsed = parseSongsResponse(data);
                  if (!parsed.ok) return;
                  if (parsed.songs.length === 0) {
                    setState({ status: "empty" });
                  } else {
                    setState({ status: "ready", songs: parsed.songs });
                  }
                } catch {
                  /* keep previous list */
                }
              }}
              onTagsSaved={async () => {
                try {
                  const res = await fetch("/api/mp3s");
                  const data: unknown = await res.json();
                  if (!res.ok) return;
                  const parsed = parseSongsResponse(data);
                  if (!parsed.ok) return;
                  if (parsed.songs.length === 0) {
                    setState({ status: "empty" });
                  } else {
                    setState({ status: "ready", songs: parsed.songs });
                  }
                } catch {
                  /* keep previous list */
                }
              }}
            />
            <section
              className="mt-4 rounded-lg border border-red-200 bg-red-50/60 p-3 dark:border-red-900/55 dark:bg-red-950/25"
              aria-label="Delete file"
            >
              <h3 className="text-xs font-medium uppercase tracking-wide text-red-800 dark:text-red-300">
                Delete file
              </h3>
              <p className="mt-1 text-xs text-red-900/85 dark:text-red-200/85">
                Removes this MP3 from your music folder on disk. This cannot be undone.
              </p>
              {deleteConfirm ? (
                <div className="mt-2 flex flex-col gap-2">
                  <p className="break-all text-xs text-red-950 dark:text-red-100">
                    Delete <span className="font-mono">{selected}</span>?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={deleteBusy}
                      onClick={() => {
                        setDeleteConfirm(false);
                        setDeleteError(null);
                      }}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={deleteBusy}
                      onClick={async () => {
                        if (!selected) return;
                        setDeleteBusy(true);
                        setDeleteError(null);
                        try {
                          const res = await fetch(
                            `/api/mp3s/${encodeURIComponent(selected)}`,
                            { method: "DELETE" },
                          );
                          const data: unknown = await res.json().catch(() => ({}));
                          if (!res.ok) {
                            const message =
                              typeof data === "object" &&
                              data !== null &&
                              "error" in data &&
                              typeof (data as { error: unknown }).error === "string"
                                ? (data as { error: string }).error
                                : res.statusText;
                            setDeleteError(message);
                            return;
                          }
                          setSelected(null);
                          setDetail(null);
                          setDeleteConfirm(false);
                          const listRes = await fetch("/api/mp3s");
                          const listData: unknown = await listRes.json();
                          if (!listRes.ok) return;
                          const parsed = parseSongsResponse(listData);
                          if (!parsed.ok) return;
                          if (parsed.songs.length === 0) {
                            setState({ status: "empty" });
                          } else {
                            setState({ status: "ready", songs: parsed.songs });
                          }
                        } catch (e) {
                          setDeleteError(
                            e instanceof Error ? e.message : String(e),
                          );
                        } finally {
                          setDeleteBusy(false);
                        }
                      }}
                      className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500"
                    >
                      {deleteBusy ? "Deleting…" : "Delete permanently"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirm(true);
                    setDeleteError(null);
                  }}
                  className="mt-2 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50 dark:border-red-800 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900/50"
                >
                  Delete file…
                </button>
              )}
              {deleteError ? (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                  {deleteError}
                </p>
              ) : null}
            </section>
            {!detail || detail.status === "loading" ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : detail.status === "error" ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                {detail.message}
              </p>
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <DetailRow label="File" value={detail.data.filename} />
                <DetailRow
                  label="Track #"
                  value={
                    detail.data.trackNumber != null
                      ? String(detail.data.trackNumber)
                      : null
                  }
                />
                <DetailRow
                  label="Title"
                  value={detail.data.title}
                  suffix={
                    detail.data.titleSource === "filename" ? (
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {" "}
                        · inferred from filename
                      </span>
                    ) : null
                  }
                />
                <DetailRow
                  label="Artist"
                  value={detail.data.artist}
                  suffix={
                    detail.data.artistSource === "filename" ? (
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {" "}
                        · inferred from filename
                      </span>
                    ) : null
                  }
                />
                <DetailRow label="Album" value={detail.data.album} />
                <DetailRow label="Genre" value={detail.data.genre} />
                <DetailRow label="Comments" value={detail.data.comments} />
                <DetailRow
                  label="Year"
                  value={
                    detail.data.year != null ? String(detail.data.year) : null
                  }
                />
                <DetailRow
                  label="Duration"
                  value={formatDuration(detail.data.durationSec)}
                />
                <DetailRow
                  label="Bitrate"
                  value={
                    detail.data.bitrateKbps != null
                      ? `${detail.data.bitrateKbps} kbps`
                      : null
                  }
                />
                <DetailRow label="Codec" value={detail.data.codec} />
                <DetailRow
                  label="Size"
                  value={formatBytes(detail.data.sizeBytes)}
                />
                <DetailRow
                  label="Modified"
                  value={new Date(detail.data.modified).toLocaleString()}
                />
              </dl>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function DetailRow({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string | null;
  suffix?: ReactNode;
}) {
  const display = value && value.trim() !== "" ? value : "—";
  return (
    <>
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="min-w-0 break-words text-zinc-900 dark:text-zinc-100">
        {display}
        {display !== "—" && suffix ? suffix : null}
      </dd>
    </>
  );
}
