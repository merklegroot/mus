"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type SongLookup = {
  songId: number;
  filenames: string[];
  primaryFilename: string | null;
};

function isSongLookup(data: unknown): data is SongLookup {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.songId === "number" &&
    Array.isArray(d.filenames) &&
    (d.primaryFilename === null || typeof d.primaryFilename === "string")
  );
}

type Mp3Details = {
  songId: number;
  filename: string;
  trackNumber: number | null;
  id3TrackNumber?: number | null;
  filenameTrackNumber?: number | null;
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

export function SongDetailsPage({ songId }: { songId: string }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | {
        status: "ready";
        song: SongLookup;
        primary: Mp3Details | null;
      }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    async function load() {
      setState({ status: "loading" });
      try {
        const songRes = await fetch(`/api/songs/${encodeURIComponent(songId)}`, {
          signal: ac.signal,
        });
        const songData: unknown = await songRes.json();
        if (cancelled || ac.signal.aborted) return;
        if (!songRes.ok) {
          const message =
            typeof songData === "object" &&
            songData !== null &&
            "error" in songData &&
            typeof (songData as { error: unknown }).error === "string"
              ? (songData as { error: string }).error
              : songRes.statusText;
          setState({ status: "error", message });
          return;
        }
        if (!isSongLookup(songData)) {
          setState({ status: "error", message: "Invalid response" });
          return;
        }

        const primaryFilename = songData.primaryFilename;
        if (!primaryFilename) {
          setState({ status: "ready", song: songData, primary: null });
          return;
        }

        const mp3Res = await fetch(
          `/api/mp3s/${encodeURIComponent(primaryFilename)}`,
          { signal: ac.signal },
        );
        const mp3Data: unknown = await mp3Res.json();
        if (cancelled || ac.signal.aborted) return;
        if (!mp3Res.ok) {
          const message =
            typeof mp3Data === "object" &&
            mp3Data !== null &&
            "error" in mp3Data &&
            typeof (mp3Data as { error: unknown }).error === "string"
              ? (mp3Data as { error: string }).error
              : mp3Res.statusText;
          setState({ status: "error", message });
          return;
        }
        if (!isMp3Details(mp3Data)) {
          setState({ status: "error", message: "Invalid response" });
          return;
        }

        setState({ status: "ready", song: songData, primary: mp3Data });
      } catch (err) {
        if (cancelled || ac.signal.aborted) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    void load();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [songId]);

  const titleLine = useMemo(() => {
    if (state.status !== "ready") return null;
    const primary = state.primary;
    if (!primary) return `Song #${state.song.songId}`;
    return primary.title?.trim() ? primary.title : primary.filename;
  }, [state]);

  const panelClass =
    "rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40";

  return (
    <main className="flex flex-1 flex-col gap-6">
      <header className={`${panelClass} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Song details
          </p>
          <h1 className="mt-1 min-w-0 break-words text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {titleLine ?? `Song #${songId}`}
          </h1>
          {state.status === "ready" && state.primary?.artist ? (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              <Link
                href={`/artist/${encodeURIComponent(state.primary.artist)}`}
                className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
              >
                {state.primary.artist}
              </Link>
              {state.primary.album ? (
                <span className="text-zinc-400 dark:text-zinc-500">
                  {" "}
                  · {state.primary.album}
                </span>
              ) : null}
            </p>
          ) : null}
          <p className="mt-2 break-all text-xs text-zinc-500 dark:text-zinc-400">
            Song id: {songId}
          </p>
        </div>
      </header>

      <section
        className={`${panelClass} space-y-4`}
        aria-busy={state.status === "loading"}
      >
        {state.status === "loading" ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : state.status === "error" ? (
          <p className="text-sm text-red-700 dark:text-red-300">
            {state.message}
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Files
              </p>
              <ul className="space-y-1 text-sm">
                {state.song.filenames.map((f) => (
                  <li key={f} className="break-all text-zinc-700 dark:text-zinc-200">
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {state.primary ? (
              <>
                <div className="min-w-0 overflow-x-auto">
                  <audio
                    key={state.primary.filename}
                    controls
                    preload="metadata"
                    className="block h-10 w-full max-w-full accent-zinc-900 dark:accent-zinc-100"
                    src={`/api/mp3s/${encodeURIComponent(state.primary.filename)}/stream`}
                  >
                    Your browser does not support the audio element.
                  </audio>
                </div>

                <div className="text-sm">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                    <DetailRow label="Title" value={state.primary.title} />
                    <DetailRow label="Artist" value={state.primary.artist} />
                    <DetailRow label="Album" value={state.primary.album} />
                    <DetailRow
                      label="Setlists"
                      value={
                        state.primary.artistExcludedFromSetlists
                          ? "Hidden by artist setting"
                          : state.primary.excludedFromSetlists
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
                      <DetailRow label="Genre" value={state.primary.genre} />
                      <DetailRow
                        label="Year"
                        value={
                          state.primary.year != null
                            ? String(state.primary.year)
                            : null
                        }
                      />
                      <DetailRow
                        label="Track #"
                        value={
                          state.primary.trackNumber != null
                            ? String(state.primary.trackNumber)
                            : null
                        }
                        suffix={
                          state.primary.id3TrackNumber != null ||
                          state.primary.filenameTrackNumber != null ? (
                            <span className="text-zinc-500 dark:text-zinc-400">
                              {" "}
                              · id3 {state.primary.id3TrackNumber ?? "—"} /
                              filename {state.primary.filenameTrackNumber ?? "—"}
                            </span>
                          ) : null
                        }
                      />
                      <DetailRow
                        label="Duration"
                        value={formatDuration(state.primary.durationSec)}
                      />
                      <DetailRow
                        label="Bitrate"
                        value={
                          state.primary.bitrateKbps != null
                            ? `${state.primary.bitrateKbps} kbps`
                            : null
                        }
                      />
                      <DetailRow label="Codec" value={state.primary.codec} />
                      <DetailRow
                        label="Size"
                        value={formatBytes(state.primary.sizeBytes)}
                      />
                      <DetailRow
                        label="Modified"
                        value={new Date(state.primary.modified).toLocaleString()}
                      />
                      <DetailRow label="Comments" value={state.primary.comments} />
                    </dl>
                  </details>
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-500">
                No files are currently linked to this song.
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}

