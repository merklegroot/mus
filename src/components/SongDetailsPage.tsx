"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type Mp3Details = {
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

export function SongDetailsPage({ filename }: { filename: string }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; data: Mp3Details }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    async function load() {
      setState({ status: "loading" });
      try {
        const res = await fetch(`/api/mp3s/${encodeURIComponent(filename)}`, {
          signal: ac.signal,
        });
        const data: unknown = await res.json();
        if (cancelled || ac.signal.aborted) return;
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
        if (!isMp3Details(data)) {
          setState({ status: "error", message: "Invalid response" });
          return;
        }
        setState({ status: "ready", data });
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
  }, [filename]);

  const titleLine = useMemo(() => {
    if (state.status !== "ready") return null;
    return state.data.title?.trim() ? state.data.title : state.data.filename;
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
            {titleLine ?? filename}
          </h1>
          {state.status === "ready" && state.data.artist ? (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {state.data.artist}
              {state.data.album ? (
                <span className="text-zinc-400 dark:text-zinc-500">
                  {" "}
                  · {state.data.album}
                </span>
              ) : null}
            </p>
          ) : null}
          <p className="mt-2 break-all text-xs text-zinc-500 dark:text-zinc-400">
            {filename}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href="/"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Home
          </Link>
          <Link
            href="/setlists"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Setlists
          </Link>
        </div>
      </header>

      <section className={`${panelClass} space-y-4`} aria-busy={state.status === "loading"}>
        {state.status === "loading" ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : state.status === "error" ? (
          <p className="text-sm text-red-700 dark:text-red-300">
            {state.message}
          </p>
        ) : (
          <>
            <div className="min-w-0 overflow-x-auto">
              <audio
                key={state.data.filename}
                controls
                preload="metadata"
                className="block h-10 w-full max-w-full accent-zinc-900 dark:accent-zinc-100"
                src={`/api/mp3s/${encodeURIComponent(state.data.filename)}/stream`}
              >
                Your browser does not support the audio element.
              </audio>
            </div>

            <div className="text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <DetailRow label="Title" value={state.data.title} />
                <DetailRow label="Artist" value={state.data.artist} />
                <DetailRow label="Album" value={state.data.album} />
                <DetailRow label="Genre" value={state.data.genre} />
                <DetailRow
                  label="Year"
                  value={state.data.year != null ? String(state.data.year) : null}
                />
                <DetailRow
                  label="Track #"
                  value={
                    state.data.trackNumber != null
                      ? String(state.data.trackNumber)
                      : null
                  }
                  suffix={
                    state.data.id3TrackNumber != null ||
                    state.data.filenameTrackNumber != null ? (
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {" "}
                        · id3 {state.data.id3TrackNumber ?? "—"} / filename{" "}
                        {state.data.filenameTrackNumber ?? "—"}
                      </span>
                    ) : null
                  }
                />
                <DetailRow
                  label="Duration"
                  value={formatDuration(state.data.durationSec)}
                />
                <DetailRow
                  label="Bitrate"
                  value={
                    state.data.bitrateKbps != null
                      ? `${state.data.bitrateKbps} kbps`
                      : null
                  }
                />
                <DetailRow label="Codec" value={state.data.codec} />
                <DetailRow label="Size" value={formatBytes(state.data.sizeBytes)} />
                <DetailRow
                  label="Modified"
                  value={new Date(state.data.modified).toLocaleString()}
                />
                <DetailRow
                  label="Setlists"
                  value={
                    state.data.artistExcludedFromSetlists
                      ? "Hidden by artist setting"
                      : state.data.excludedFromSetlists
                        ? "Hidden from add picker"
                        : "Visible in add picker"
                  }
                />
                <DetailRow label="Comments" value={state.data.comments} />
              </dl>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

