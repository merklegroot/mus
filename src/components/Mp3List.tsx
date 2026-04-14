"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ArtistList } from "@/components/ArtistList";
import { InferFromFilenamePanel } from "@/components/InferFromFilenamePanel";

type SongRow = { filename: string; artist: string | null };

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
        const raw = (item as { artist?: unknown }).artist;
        const artist =
          raw === null || raw === undefined
            ? null
            : typeof raw === "string" && raw.trim() !== ""
              ? raw.trim()
              : null;
        songs.push({ filename, artist });
      }
    }
    return { ok: true, songs };
  }

  if (Array.isArray(d.mp3s)) {
    const mp3s = d.mp3s.filter((n): n is string => typeof n === "string");
    return {
      ok: true,
      songs: mp3s.map((filename) => ({ filename, artist: null })),
    };
  }

  return { ok: false, message: "Invalid response" };
}

function artistMatches(
  songArtist: string | null,
  filterArtist: string,
): boolean {
  const a = songArtist?.trim() ?? "";
  const b = filterArtist.trim();
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
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);

  const visibleSongs = useMemo(() => {
    if (state.status !== "ready") return [];
    if (!filterArtist) return state.songs;
    return state.songs.filter((s) =>
      artistMatches(s.artist, filterArtist),
    );
  }, [state, filterArtist]);

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
    if (!filterArtist || !selected || !songsForFilter) return;
    const stillVisible = songsForFilter.some(
      (s) =>
        s.filename === selected && artistMatches(s.artist, filterArtist),
    );
    if (!stillVisible) {
      setSelected(null);
      setDetail(null);
    }
  }, [filterArtist, selected, songsForFilter]);

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
    <div className="grid w-full max-w-[100rem] grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3 lg:items-stretch">
      <div
        className={`flex h-full min-h-0 min-w-0 flex-col lg:max-h-[min(90vh,56rem)] ${selected ? "max-lg:hidden" : ""}`}
      >
        <ArtistList
          selectedArtist={filterArtist}
          onArtistClick={(artist) => {
            setFilterArtist((prev) => (prev === artist ? null : artist));
          }}
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
          </h2>
          {filterArtist ? (
            <button
              type="button"
              onClick={() => setFilterArtist(null)}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
            >
              Clear filter
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
            No songs for this artist.{" "}
            <button
              type="button"
              className="text-zinc-800 underline underline-offset-2 hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-zinc-50"
              onClick={() => setFilterArtist(null)}
            >
              Clear filter
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
            />
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
