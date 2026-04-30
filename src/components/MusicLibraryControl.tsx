"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { AlbumList } from "@/components/AlbumList";
import { ArtistList } from "@/components/ArtistList";
import { InferFromFilenamePanel } from "@/components/InferFromFilenamePanel";
import { inferArtistTitleFromFilename } from "@/lib/inferArtistTitleFromFilename";

type SongRow = {
  songId: number;
  filename: string;
  artist: string | null;
  title: string | null;
  album: string | null;
  excludedFromSetlists: boolean;
  artistExcludedFromSetlists: boolean;
};

type MusicLibraryControlState =
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
        const rawTitle = (item as { title?: unknown }).title;
        const title =
          rawTitle === null || rawTitle === undefined
            ? null
            : typeof rawTitle === "string" && rawTitle.trim() !== ""
              ? rawTitle.trim()
              : null;
        const excludedFromSetlists =
          (item as { excludedFromSetlists?: unknown }).excludedFromSetlists ===
          true;
        const artistExcludedFromSetlists =
          (item as { artistExcludedFromSetlists?: unknown })
            .artistExcludedFromSetlists === true;
        songs.push({
          songId:
            typeof (item as { songId?: unknown }).songId === "number"
              ? (item as { songId: number }).songId
              : -1,
          filename,
          artist,
          title,
          album,
          excludedFromSetlists,
          artistExcludedFromSetlists,
        });
      }
    }
    return { ok: true, songs };
  }

  if (Array.isArray(d.mp3s)) {
    const mp3s = d.mp3s.filter((n): n is string => typeof n === "string");
    return {
      ok: true,
      songs: mp3s.map((filename) => ({
        songId: -1,
        filename,
        artist: null,
        title: null,
        album: null,
        excludedFromSetlists: false,
        artistExcludedFromSetlists: false,
      })),
    };
  }

  return { ok: false, message: "Invalid response" };
}

/**
 * Match /api/artists semantics: ID3 artist or filename inference counts;
 * synthetic "Unknown" when the merged artist from the API is empty.
 */
function songMatchesArtistFilter(s: SongRow, filterArtist: string): boolean {
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

function albumMatches(
  songAlbum: string | null,
  filterAlbum: string,
): boolean {
  const a = songAlbum?.trim() ?? "";
  const b = filterAlbum.trim();
  return a.length > 0 && a === b;
}

function songListDisplay(s: SongRow):
  | { kind: "metadata"; artist: string | null; title: string }
  | { kind: "filename"; filename: string } {
  const inferred = inferArtistTitleFromFilename(s.filename).primary;
  const title = s.title?.trim() || inferred.title?.trim() || null;
  if (!title) return { kind: "filename", filename: s.filename };

  const artist = s.artist?.trim() || inferred.artist?.trim() || null;
  return { kind: "metadata", artist, title };
}

type Mp3Details = {
  songId: number;
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
  excludedFromSetlists: boolean;
  artistExcludedFromSetlists: boolean;
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
    typeof d.songId === "number" &&
    typeof d.filename === "string" &&
    typeof d.sizeBytes === "number" &&
    typeof d.modified === "string"
  );
}

export function MusicLibraryControl() {
  const [state, setState] = useState<MusicLibraryControlState>({
    status: "loading",
  });
  const [filterArtist, setFilterArtist] = useState<string | null>(null);
  const [filterAlbum, setFilterAlbum] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [bulkSelected, setBulkSelected] = useState<string[]>([]);
  const [bulkAnchor, setBulkAnchor] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<{ okCount: number; failCount: number } | null>(
    null,
  );
  const [bulkForm, setBulkForm] = useState<{
    setAlbum: boolean;
    album: string;
    setArtist: boolean;
    artist: string;
    setGenre: boolean;
    genre: string;
    setYear: boolean;
    year: string;
    setComments: boolean;
    comments: string;
    setTitle: boolean;
    title: string;
  }>({
    setAlbum: true,
    album: "",
    setArtist: false,
    artist: "",
    setGenre: false,
    genre: "",
    setYear: false,
    year: "",
    setComments: false,
    comments: "",
    setTitle: false,
    title: "",
  });

  async function refreshSongs(): Promise<void> {
    const res = await fetch("/api/mp3s");
    const data: unknown = await res.json();
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
  }

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

  const bulkSet = useMemo(() => new Set(bulkSelected), [bulkSelected]);
  const bulkVisibleCount = useMemo(() => {
    if (bulkSelected.length === 0) return 0;
    let c = 0;
    for (const s of visibleSongs) if (bulkSet.has(s.filename)) c += 1;
    return c;
  }, [bulkSelected.length, bulkSet, visibleSongs]);

  const visibleSongGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        artist: string;
        songs: { row: SongRow; display: ReturnType<typeof songListDisplay> }[];
      }
    >();

    for (const row of visibleSongs) {
      const display = songListDisplay(row);
      const artist =
        display.kind === "metadata" && display.artist
          ? display.artist
          : "Unknown Artist";
      const group = groups.get(artist);
      if (group) {
        group.songs.push({ row, display });
      } else {
        groups.set(artist, { artist, songs: [{ row, display }] });
      }
    }

    return [...groups.values()].sort((a, b) => a.artist.localeCompare(b.artist));
  }, [visibleSongs]);

  // Range selection should follow the UI order (artists sorted + songs within each group).
  const visibleFilenamesUiOrder = useMemo(() => {
    const out: string[] = [];
    for (const g of visibleSongGroups) {
      for (const s of g.songs) out.push(s.row.filename);
    }
    return out;
  }, [visibleSongGroups]);

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
    setVisibilityBusy(false);
    setVisibilityError(null);
  }, [selected]);

  useEffect(() => {
    setBulkError(null);
    setBulkResult(null);
    if (bulkSelected.length === 0) {
      setBulkAnchor(null);
    }
  }, [bulkSelected.length]);

  // Only show details when exactly one song is selected.
  useEffect(() => {
    if (bulkSelected.length === 1) {
      const only = bulkSelected[0];
      if (selected !== only) {
        setSelected(only);
        setDetail({ status: "loading" });
      }
      return;
    }
    if (selected !== null) {
      setSelected(null);
      setDetail(null);
    }
  }, [bulkSelected, selected]);

  useEffect(() => {
    if (state.status !== "ready") return;
    const known = new Set(state.songs.map((s) => s.filename));
    setBulkSelected((prev) => prev.filter((f) => known.has(f)));
  }, [state]);

  function computeNextBulkSelection(args: {
    filename: string;
    e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean };
  }): { nextSelected: string[]; nextAnchor: string | null } {
    const { filename, e } = args;
    const isToggle = e.metaKey || e.ctrlKey;
    if (isToggle) {
      const nextSelected = bulkSelected.includes(filename)
        ? bulkSelected.filter((f) => f !== filename)
        : [...bulkSelected, filename];
      return { nextSelected, nextAnchor: filename };
    }

    if (e.shiftKey && bulkAnchor) {
      const a = visibleFilenamesUiOrder.indexOf(bulkAnchor);
      const b = visibleFilenamesUiOrder.indexOf(filename);
      if (a !== -1 && b !== -1) {
        const [start, end] = a <= b ? [a, b] : [b, a];
        const nextSelected = visibleFilenamesUiOrder.slice(start, end + 1);
        return { nextSelected, nextAnchor: bulkAnchor };
      }
    }

    return { nextSelected: [filename], nextAnchor: filename };
  }

  function setBulkSelectionFromClick(
    filename: string,
    e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
  ): void {
    const { nextSelected, nextAnchor } = computeNextBulkSelection({ filename, e });
    setBulkSelected(nextSelected);
    setBulkAnchor(nextAnchor);
  }

  async function applyBulkTags(): Promise<void> {
    if (bulkSelected.length === 0) return;
    setBulkBusy(true);
    setBulkError(null);
    setBulkResult(null);

    const patch: Record<string, string | number | null> = {};
    if (bulkForm.setAlbum) patch.album = bulkForm.album.trim() === "" ? null : bulkForm.album.trim();
    if (bulkForm.setArtist) patch.artist = bulkForm.artist.trim() === "" ? null : bulkForm.artist.trim();
    if (bulkForm.setGenre) patch.genre = bulkForm.genre.trim() === "" ? null : bulkForm.genre.trim();
    if (bulkForm.setComments) patch.comments = bulkForm.comments.trim() === "" ? null : bulkForm.comments.trim();
    if (bulkForm.setTitle) patch.title = bulkForm.title.trim() === "" ? null : bulkForm.title.trim();
    if (bulkForm.setYear) {
      const y = bulkForm.year.trim();
      if (y === "") {
        patch.year = null;
      } else {
        const n = Number.parseInt(y, 10);
        patch.year = Number.isFinite(n) ? n : null;
      }
    }

    try {
      const res = await fetch("/api/mp3s/tags/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filenames: bulkSelected, patch }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          typeof data === "object" &&
            data !== null &&
            "error" in data &&
            typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : res.statusText;
        setBulkError(message);
        return;
      }

      const okCount =
        typeof data === "object" && data !== null && typeof (data as { okCount?: unknown }).okCount === "number"
          ? (data as { okCount: number }).okCount
          : 0;
      const failCount =
        typeof data === "object" && data !== null && typeof (data as { failCount?: unknown }).failCount === "number"
          ? (data as { failCount: number }).failCount
          : 0;
      setBulkResult({ okCount, failCount });
      try {
        await refreshSongs();
      } catch {
        /* keep previous list */
      }
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkBusy(false);
    }
  }

  async function setSelectedSetlistVisibility(
    excludedFromSetlists: boolean,
  ): Promise<void> {
    if (!selected) return;
    setVisibilityBusy(true);
    setVisibilityError(null);
    try {
      const res = await fetch(`/api/mp3s/${encodeURIComponent(selected)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedFromSetlists }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : res.statusText;
        setVisibilityError(message);
        return;
      }

      const next =
        typeof data === "object" &&
        data !== null &&
        typeof (data as { excludedFromSetlists?: unknown })
          .excludedFromSetlists === "boolean"
          ? (data as { excludedFromSetlists: boolean }).excludedFromSetlists
          : excludedFromSetlists;
      setDetail((prev) =>
        prev?.status === "ready"
          ? {
              status: "ready",
              data: { ...prev.data, excludedFromSetlists: next },
            }
          : prev,
      );
      setState((prev) =>
        prev.status === "ready"
          ? {
              status: "ready",
              songs: prev.songs.map((song) =>
                song.filename === selected
                  ? { ...song, excludedFromSetlists: next }
                  : song,
              ),
            }
          : prev,
      );
    } catch (err) {
      setVisibilityError(err instanceof Error ? err.message : String(err));
    } finally {
      setVisibilityBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    refreshSongs()
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
      // Clear selection entirely so the "single-selection details" effect
      // doesn't immediately re-select the now-filtered-out filename.
      setBulkSelected([]);
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
    <div className="grid w-full grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-4 lg:items-stretch">
      <div
        className={`flex h-full min-h-0 min-w-0 flex-col lg:max-h-[min(90vh,56rem)] ${selected ? "max-lg:hidden" : ""}`}
      >
        <ArtistList
          showDiscogsActions={false}
          selectedArtist={null}
          onArtistClick={(artist) => {
            setFilterArtist((prev) => (prev === artist ? null : artist));
          }}
          onClearArtistFilter={() => setFilterArtist(null)}
          onArtistSetlistVisibilityChanged={(artist, excludedFromSetlists) => {
            setState((prev) =>
              prev.status === "ready"
                ? {
                    status: "ready",
                    songs: prev.songs.map((song) =>
                      songMatchesArtistFilter(song, artist)
                        ? {
                            ...song,
                            artistExcludedFromSetlists: excludedFromSetlists,
                          }
                        : song,
                    ),
                  }
                : prev,
            );
            setDetail((prev) =>
              prev?.status === "ready" &&
              songMatchesArtistFilter(
                {
                  songId: prev.data.songId,
                  filename: prev.data.filename,
                  artist: prev.data.artist,
                  title: prev.data.title,
                  album: prev.data.album,
                  excludedFromSetlists: prev.data.excludedFromSetlists,
                  artistExcludedFromSetlists:
                    prev.data.artistExcludedFromSetlists,
                },
                artist,
              )
                ? {
                    status: "ready",
                    data: {
                      ...prev.data,
                      artistExcludedFromSetlists: excludedFromSetlists,
                    },
                  }
                : prev,
            );
          }}
        />
      </div>

      <div
        className={`flex h-full min-h-0 min-w-0 flex-col lg:max-h-[min(90vh,56rem)] ${selected ? "max-lg:hidden" : ""}`}
      >
        <AlbumList
          status={albumListStatus}
          errorMessage={state.status === "error" ? state.message : undefined}
          albums={albumList}
          filterArtist={filterArtist}
          onAlbumClick={(album) => {
            setFilterAlbum((prev) => (prev === album ? null : album));
          }}
          onClearArtistFilter={() => setFilterArtist(null)}
        />
      </div>

      <section
        className={`${panelClass} flex h-full min-h-0 min-w-0 flex-col lg:max-h-[min(90vh,56rem)] ${selected ? "max-lg:hidden" : ""}`}
        aria-label="Songs in music folder"
        aria-busy={state.status === "loading"}
      >
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Songs
            {filterArtist ? (
              <span className="ml-1.5 text-sm font-normal text-zinc-500 dark:text-zinc-400">
                · {filterArtist}
              </span>
            ) : null}
            {filterAlbum ? (
              <span className="ml-1.5 text-sm font-normal text-zinc-500 dark:text-zinc-400">
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
        {bulkSelected.length > 1 ? (
          <div className="mb-3 flex items-center justify-between gap-2 text-sm">
            <div className="text-zinc-800 dark:text-zinc-200">
              <span className="font-medium">{bulkSelected.length}</span> selected
              {bulkVisibleCount !== bulkSelected.length ? (
                <span className="text-zinc-500 dark:text-zinc-400">
                  {" "}
                  · {bulkVisibleCount} visible
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setBulkSelected([])}
                className="rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
              >
                Clear selection
              </button>
            </div>
          </div>
        ) : null}
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
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto text-sm">
            {visibleSongGroups.map((group) => (
              <section
                key={group.artist}
                aria-label={`Songs by ${group.artist}`}
                className="border-t border-zinc-200 pt-3 first:border-t-0 first:pt-0 dark:border-zinc-800"
              >
                <h3
                  className="mb-1 truncate px-2 text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-200"
                  title={group.artist}
                >
                  {group.artist}
                </h3>
                <ul className="space-y-0.5 pl-2">
                  {group.songs.map(({ row, display }, idx) => (
                    <li key={`${row.filename}:${idx}`}>
                      <button
                        type="button"
                        onClick={(e) => {
                          setBulkSelectionFromClick(row.filename, {
                            shiftKey: e.shiftKey,
                            metaKey: e.metaKey,
                            ctrlKey: e.ctrlKey,
                          });
                        }}
                        className={`w-full rounded-md px-2 py-2 text-left transition-colors ${
                          selected === row.filename
                            ? "bg-zinc-200 font-medium text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
                            : bulkSet.has(row.filename)
                              ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-100 dark:bg-zinc-900/50 dark:text-zinc-100 dark:hover:bg-zinc-900/50"
                              : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                        }`}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="min-w-0 flex-1">
                            {display.kind === "metadata" ? (
                              <span className="block min-w-0 break-words">
                                {display.title}
                              </span>
                            ) : (
                              <span className="block break-all">
                                {display.filename}
                              </span>
                            )}
                          </span>
                          {bulkSet.has(row.filename) ? (
                            <span
                              className="mt-0.5 shrink-0 rounded-full bg-zinc-900/10 px-2 py-0.5 text-[11px] font-medium text-zinc-800 dark:bg-zinc-100/10 dark:text-zinc-200"
                              aria-label="Selected for bulk edit"
                            >
                              Selected
                            </span>
                          ) : null}
                        </span>
                        {row.excludedFromSetlists ||
                        row.artistExcludedFromSetlists ? (
                          <span className="mt-0.5 block text-xs font-normal text-amber-700 dark:text-amber-300">
                            {row.artistExcludedFromSetlists
                              ? "Artist hidden from setlists"
                              : "Hidden from setlists"}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

      {bulkSelected.length > 1 ? (
        <aside
          className={`${panelClass} flex h-full min-h-0 min-w-0 flex-col overflow-hidden lg:max-h-[min(90vh,56rem)]`}
          aria-label="Bulk edit ID3"
        >
          <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Bulk Edit ID3
            </h2>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {bulkSelected.length}
              </span>{" "}
              selected. Only checked fields are changed.
            </p>
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={bulkForm.setAlbum}
                    onChange={(e) =>
                      setBulkForm((p) => ({ ...p, setAlbum: e.target.checked }))
                    }
                  />
                  <span className="w-16 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Album
                  </span>
                  <input
                    type="text"
                    value={bulkForm.album}
                    onChange={(e) =>
                      setBulkForm((p) => ({ ...p, album: e.target.value }))
                    }
                    placeholder="(leave blank to clear)"
                    className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={bulkForm.setArtist}
                    onChange={(e) =>
                      setBulkForm((p) => ({ ...p, setArtist: e.target.checked }))
                    }
                  />
                  <span className="w-16 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Artist
                  </span>
                  <input
                    type="text"
                    value={bulkForm.artist}
                    onChange={(e) =>
                      setBulkForm((p) => ({ ...p, artist: e.target.value }))
                    }
                    placeholder="(leave blank to clear)"
                    className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={bulkForm.setGenre}
                    onChange={(e) =>
                      setBulkForm((p) => ({ ...p, setGenre: e.target.checked }))
                    }
                  />
                  <span className="w-16 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Genre
                  </span>
                  <input
                    type="text"
                    value={bulkForm.genre}
                    onChange={(e) =>
                      setBulkForm((p) => ({ ...p, genre: e.target.value }))
                    }
                    placeholder="(leave blank to clear)"
                    className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={bulkForm.setYear}
                    onChange={(e) =>
                      setBulkForm((p) => ({ ...p, setYear: e.target.checked }))
                    }
                  />
                  <span className="w-16 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Year
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={bulkForm.year}
                    onChange={(e) =>
                      setBulkForm((p) => ({ ...p, year: e.target.value }))
                    }
                    placeholder="e.g. 1999 (blank clears)"
                    className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={bulkForm.setComments}
                    onChange={(e) =>
                      setBulkForm((p) => ({ ...p, setComments: e.target.checked }))
                    }
                  />
                  <span className="w-16 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Comments
                  </span>
                  <input
                    type="text"
                    value={bulkForm.comments}
                    onChange={(e) =>
                      setBulkForm((p) => ({ ...p, comments: e.target.value }))
                    }
                    placeholder="(leave blank to clear)"
                    className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={bulkForm.setTitle}
                    onChange={(e) =>
                      setBulkForm((p) => ({ ...p, setTitle: e.target.checked }))
                    }
                  />
                  <span className="w-16 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Title
                  </span>
                  <input
                    type="text"
                    value={bulkForm.title}
                    onChange={(e) =>
                      setBulkForm((p) => ({ ...p, title: e.target.value }))
                    }
                    placeholder="(leave blank to clear)"
                    className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => void applyBulkTags()}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-950 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                >
                  {bulkBusy ? "Applying…" : "Apply to selected"}
                </button>
                {bulkResult ? (
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    Updated {bulkResult.okCount}
                    {bulkResult.failCount > 0 ? ` · Failed ${bulkResult.failCount}` : ""}
                  </span>
                ) : null}
                {bulkError ? (
                  <span className="text-xs text-red-600 dark:text-red-400">
                    {bulkError}
                  </span>
                ) : null}
              </div>

              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Shift+click selects a range. Cmd/Ctrl+click toggles.
              </p>
            </div>
          </div>
        </aside>
      ) : null}

      {selected && bulkSelected.length === 1 ? (
        <aside
          className={`${panelClass} flex h-full min-h-0 min-w-0 flex-col overflow-hidden lg:max-h-[min(90vh,56rem)]`}
          aria-label="Track details"
        >
          <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Song Details
            </h2>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={
                  detail?.status === "ready"
                    ? `/song/${encodeURIComponent(String(detail.data.songId))}`
                    : "#"
                }
                aria-disabled={detail?.status !== "ready"}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Open song page
              </Link>
              <button
                type="button"
                onClick={() => setBulkSelected([])}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
              >
                Clear selection
              </button>
            </div>
          </div>
          <div className="mb-4 min-w-0 shrink-0 overflow-x-auto">
            <audio
              key={selected}
              controls
              preload="metadata"
              className="block h-10 w-full max-w-full accent-zinc-900 dark:accent-zinc-100"
              src={`/api/mp3s/${encodeURIComponent(selected)}/stream`}
            >
              Your browser does not support the audio element.
            </audio>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <InferFromFilenamePanel
              key={`infer-${selected}`}
              filename={selected}
              onRenamed={async (newFilename) => {
                setBulkSelected([newFilename]);
                setBulkAnchor(newFilename);
                setDetail({ status: "loading" });
                try {
                  await refreshSongs();
                } catch {
                  /* keep previous list */
                }
              }}
              onTagsSaved={async () => {
                try {
                  await refreshSongs();
                } catch {
                  /* keep previous list */
                }
              }}
              actions={
                deleteConfirm ? null : (
                  <>
                    {detail?.status === "ready" ? (
                      <button
                        type="button"
                        disabled={visibilityBusy}
                        onClick={() =>
                          void setSelectedSetlistVisibility(
                            !detail.data.excludedFromSetlists,
                          )
                        }
                        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        {visibilityBusy
                          ? "Saving…"
                          : detail.data.excludedFromSetlists
                            ? "Show in setlists"
                            : "Hide from setlists"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteConfirm(true);
                        setDeleteError(null);
                      }}
                      className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50 dark:border-red-800 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900/50"
                    >
                      Delete file…
                    </button>
                  </>
                )
              }
            />
            {visibilityError ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {visibilityError}
              </p>
            ) : null}
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
                        setBulkSelected([]);
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
                        setDeleteError(e instanceof Error ? e.message : String(e));
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
            ) : null}
            {deleteError ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {deleteError}
              </p>
            ) : null}
            {!detail || detail.status === "loading" ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : detail.status === "error" ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                {detail.message}
              </p>
            ) : (
              <div className="text-sm">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                  <DetailRow label="File" value={detail.data.filename} />
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
                  <DetailRow
                    label="Setlists"
                    value={
                      detail.data.artistExcludedFromSetlists
                        ? "Hidden by artist setting"
                        : detail.data.excludedFromSetlists
                          ? "Hidden from add picker"
                          : "Visible in add picker"
                    }
                  />
                </dl>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100">
                    More details
                  </summary>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                    <DetailRow
                      label="Track #"
                      value={
                        detail.data.trackNumber != null
                          ? String(detail.data.trackNumber)
                          : null
                      }
                    />
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
                    <DetailRow label="Size" value={formatBytes(detail.data.sizeBytes)} />
                    <DetailRow
                      label="Modified"
                      value={new Date(detail.data.modified).toLocaleString()}
                    />
                  </dl>
                </details>
              </div>
            )}
          </div>
        </aside>
      ) : null}
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
