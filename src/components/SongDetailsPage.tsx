"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePlayer } from "@/components/player/PlayerContext";
import {
  shortestSemitoneStepsBetweenKeys,
  transposeBothKeysParseable,
  transposeKeyLabelBySteps,
} from "@/lib/transposeKeySteps";

type SongLookup = {
  songId: number;
  filenames: string[];
  primaryFilename: string | null;
  lyrics?: string | null;
  /** Musical key when set in the database */
  key?: string | null;
};

function isSongLookup(data: unknown): data is SongLookup {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.songId === "number" &&
    Array.isArray(d.filenames) &&
    (d.primaryFilename === null || typeof d.primaryFilename === "string") &&
    (d.lyrics === undefined || d.lyrics === null || typeof d.lyrics === "string") &&
    (d.key === undefined || d.key === null || typeof d.key === "string")
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

function formatKeyMatchStrength(pearson: number): string {
  if (!Number.isFinite(pearson)) return "—";
  const pct = Math.min(100, Math.max(0, Math.round(((pearson + 1) / 2) * 100)));
  return `${pct}%`;
}

/** Integer semitones from the steps field, or null if empty/invalid. */
function parseTransposeStepsInput(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
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
  const { playNow, addToQueue } = usePlayer();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | {
        status: "ready";
        song: SongLookup;
        primary: Mp3Details | null;
      }
  >({ status: "loading" });
  const [lyricsDraft, setLyricsDraft] = useState("");
  const [lyricsDirty, setLyricsDirty] = useState(false);
  const [lyricsBusy, setLyricsBusy] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);

  const [keyDraft, setKeyDraft] = useState("");
  const [keyDirty, setKeyDirty] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const transposeDialogRef = useRef<HTMLDialogElement | null>(null);
  const [transposeDialogOpen, setTransposeDialogOpen] = useState(false);
  const [transposeSteps, setTransposeSteps] = useState("0");
  const [transposeSourceKey, setTransposeSourceKey] = useState("");
  const [transposeDestKey, setTransposeDestKey] = useState("");
  const [transposeStepsError, setTransposeStepsError] = useState<string | null>(
    null,
  );
  const [transposeNotImplementedMessage, setTransposeNotImplementedMessage] =
    useState<string | null>(null);

  const keyDialogRef = useRef<HTMLDialogElement | null>(null);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [keyDetectBusy, setKeyDetectBusy] = useState(false);
  const [keyDetectError, setKeyDetectError] = useState<string | null>(null);
  const [keyDetectResult, setKeyDetectResult] = useState<{
    key: string;
    confidence: number;
  } | null>(null);

  const transposeKeyDelta = useMemo(() => {
    if (!transposeSourceKey.trim() || !transposeDestKey.trim()) return null;
    return shortestSemitoneStepsBetweenKeys(
      transposeSourceKey,
      transposeDestKey,
    );
  }, [transposeSourceKey, transposeDestKey]);

  function handleTransposeSourceChange(value: string): void {
    setTransposeSourceKey(value);
    setTransposeStepsError(null);
    setTransposeNotImplementedMessage(null);
    if (!transposeBothKeysParseable(value, transposeDestKey)) return;
    const delta = shortestSemitoneStepsBetweenKeys(value, transposeDestKey);
    if (delta !== null) setTransposeSteps(String(delta));
  }

  function handleTransposeDestChange(value: string): void {
    setTransposeDestKey(value);
    setTransposeStepsError(null);
    setTransposeNotImplementedMessage(null);
    if (!transposeBothKeysParseable(transposeSourceKey, value)) return;
    const delta = shortestSemitoneStepsBetweenKeys(transposeSourceKey, value);
    if (delta !== null) setTransposeSteps(String(delta));
  }

  function handleTransposeStepsChange(value: string): void {
    setTransposeSteps(value);
    setTransposeStepsError(null);
    setTransposeNotImplementedMessage(null);
    if (!transposeBothKeysParseable(transposeSourceKey, transposeDestKey)) {
      return;
    }
    const steps = parseTransposeStepsInput(value);
    if (steps === null) return;
    const newDest = transposeKeyLabelBySteps(transposeSourceKey, steps);
    if (newDest !== null) setTransposeDestKey(newDest);
  }

  useEffect(() => {
    const dialog = transposeDialogRef.current;
    if (!transposeDialogOpen || !dialog) return;
    if (dialog.open) return;
    try {
      dialog.showModal();
    } catch {
      // ignore
    }
  }, [transposeDialogOpen]);

  useEffect(() => {
    const dialog = keyDialogRef.current;
    if (!keyDialogOpen || !dialog) return;
    if (dialog.open) return;
    try {
      dialog.showModal();
    } catch {
      // ignore
    }
  }, [keyDialogOpen]);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    async function load() {
      setState({ status: "loading" });
      setLyricsDraft("");
      setLyricsDirty(false);
      setLyricsBusy(false);
      setLyricsError(null);
      setKeyDraft("");
      setKeyDirty(false);
      setKeyBusy(false);
      setKeyError(null);
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

        setLyricsDraft(songData.lyrics ?? "");
        setLyricsDirty(false);
        setKeyDraft(songData.key ?? "");
        setKeyDirty(false);

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

  async function saveLyrics(): Promise<void> {
    if (state.status !== "ready") return;
    setLyricsBusy(true);
    setLyricsError(null);
    try {
      const res = await fetch(`/api/songs/${encodeURIComponent(songId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lyrics: lyricsDraft }),
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
        setLyricsError(message);
        return;
      }

      const nextLyrics =
        typeof data === "object" &&
        data !== null &&
        "lyrics" in data &&
        (data as { lyrics?: unknown }).lyrics !== undefined
          ? (data as { lyrics?: unknown }).lyrics
          : null;
      const normalized = typeof nextLyrics === "string" ? nextLyrics : "";
      setLyricsDraft(normalized);
      setLyricsDirty(false);

      let mergedKey: string | null | undefined;
      if (typeof data === "object" && data !== null && "key" in data) {
        const k = (data as { key: unknown }).key;
        mergedKey =
          k === null ? null : typeof k === "string" ? k : undefined;
        if (mergedKey !== undefined) {
          setKeyDraft(mergedKey === null ? "" : mergedKey);
          setKeyDirty(false);
        }
      }

      setState((prev) => {
        if (prev.status !== "ready") return prev;
        const song = { ...prev.song, lyrics: normalized };
        if (mergedKey !== undefined) {
          song.key = mergedKey;
        }
        return { ...prev, song };
      });
    } catch (err) {
      setLyricsError(err instanceof Error ? err.message : String(err));
    } finally {
      setLyricsBusy(false);
    }
  }

  async function patchSongKey(nextKey: string | null): Promise<boolean> {
    if (state.status !== "ready") return false;
    setKeyBusy(true);
    setKeyError(null);
    try {
      const res = await fetch(`/api/songs/${encodeURIComponent(songId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: nextKey }),
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
        setKeyError(message);
        return false;
      }

      const responseKey =
        typeof data === "object" &&
        data !== null &&
        "key" in data &&
        (data as { key?: unknown }).key !== undefined
          ? (data as { key: unknown }).key
          : null;

      if (responseKey === null) {
        setKeyDraft("");
      } else if (typeof responseKey === "string") {
        setKeyDraft(responseKey);
      }
      setKeyDirty(false);

      setState((prev) => {
        if (prev.status !== "ready") return prev;
        const song = { ...prev.song };
        if (responseKey === null) {
          song.key = null;
        } else if (typeof responseKey === "string") {
          song.key = responseKey;
        }
        return { ...prev, song };
      });
      return true;
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setKeyBusy(false);
    }
  }

  async function saveKey(): Promise<void> {
    const trimmed = keyDraft.trim();
    await patchSongKey(trimmed === "" ? null : trimmed);
  }

  async function runKeyDetection(): Promise<void> {
    setKeyDetectBusy(true);
    setKeyDetectError(null);
    setKeyDetectResult(null);
    try {
      const res = await fetch(
        `/api/songs/${encodeURIComponent(songId)}/detect-key`,
        { method: "POST" },
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
        setKeyDetectError(message);
        return;
      }
      const k =
        typeof data === "object" &&
        data !== null &&
        "key" in data &&
        typeof (data as { key: unknown }).key === "string"
          ? (data as { key: string }).key
          : null;
      const conf =
        typeof data === "object" &&
        data !== null &&
        "confidence" in data &&
        typeof (data as { confidence: unknown }).confidence === "number"
          ? (data as { confidence: number }).confidence
          : Number.NaN;
      if (!k) {
        setKeyDetectError("Invalid detection response");
        return;
      }
      setKeyDetectResult({ key: k, confidence: conf });
    } catch (err) {
      setKeyDetectError(err instanceof Error ? err.message : String(err));
    } finally {
      setKeyDetectBusy(false);
    }
  }

  async function applyDetectedKeyToSong(): Promise<void> {
    if (!keyDetectResult) return;
    const ok = await patchSongKey(keyDetectResult.key);
    if (ok) {
      setKeyDialogOpen(false);
      setKeyDetectResult(null);
    }
  }

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
          {state.status === "ready" ? (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[12rem] flex-1">
                  <label
                    htmlFor="song-key"
                    className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
                  >
                    Key
                  </label>
                  <input
                    id="song-key"
                    type="text"
                    value={keyDraft}
                    onChange={(e) => {
                      setKeyDraft(e.target.value);
                      setKeyDirty(true);
                      setKeyError(null);
                    }}
                    placeholder="e.g. C, Am"
                    autoComplete="off"
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </div>
                <button
                  type="button"
                  disabled={!keyDirty || keyBusy}
                  onClick={() => void saveKey()}
                  className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-950 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                >
                  {keyBusy ? "Saving…" : "Save key"}
                </button>
              </div>
              {keyDirty ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Unsaved changes
                </p>
              ) : null}
              {keyError ? (
                <p className="text-sm text-red-700 dark:text-red-300">
                  {keyError}
                </p>
              ) : null}
            </div>
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
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => playNow(state.primary!.filename)}
                    className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                  >
                    Play in player
                  </button>
                  <button
                    type="button"
                    onClick={() => addToQueue(state.primary!.filename)}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Add to queue
                  </button>
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

      <section className={`${panelClass} space-y-3`} aria-label="Lyrics">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Lyrics
          </p>
          <div className="flex items-center gap-2">
            {lyricsDirty ? (
              <span className="text-xs text-amber-700 dark:text-amber-300">
                Unsaved changes
              </span>
            ) : null}
            <button
              type="button"
              disabled={state.status !== "ready"}
              onClick={() => {
                setTransposeSteps("0");
                setTransposeStepsError(null);
                setTransposeNotImplementedMessage(null);
                setTransposeDestKey("");
                if (state.status === "ready") {
                  const k = state.song.key;
                  setTransposeSourceKey(
                    k != null && typeof k === "string" && k.trim() !== ""
                      ? k.trim()
                      : "",
                  );
                } else {
                  setTransposeSourceKey("");
                }
                setTransposeDialogOpen(true);
              }}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Transpose
            </button>
            <button
              type="button"
              disabled={
                state.status !== "ready" || state.song.filenames.length === 0
              }
              onClick={() => {
                setKeyDetectBusy(false);
                setKeyDetectError(null);
                setKeyDetectResult(null);
                setKeyDialogOpen(true);
              }}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Detect key
            </button>
            <button
              type="button"
              disabled={state.status !== "ready" || lyricsBusy || !lyricsDirty}
              onClick={() => void saveLyrics()}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-950 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {lyricsBusy ? "Saving…" : "Save lyrics"}
            </button>
          </div>
        </div>

        <textarea
          value={lyricsDraft}
          onChange={(e) => {
            setLyricsDraft(e.target.value);
            setLyricsDirty(true);
            setLyricsError(null);
          }}
          placeholder="Paste or type lyrics here…"
          rows={10}
          className="w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />

        {lyricsError ? (
          <p className="text-sm text-red-700 dark:text-red-300">
            {lyricsError}
          </p>
        ) : null}
      </section>

      {transposeDialogOpen ? (
        <dialog
          ref={transposeDialogRef}
          onClose={() => setTransposeDialogOpen(false)}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              (e.currentTarget as HTMLDialogElement).close();
            }
          }}
          className="fixed left-1/2 top-1/2 w-[min(30rem,92vw)] max-h-[85vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/40 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
        >
          <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                Transpose song
              </h2>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Use semitone steps and/or source and destination keys. While{" "}
                <strong className="font-medium text-zinc-700 dark:text-zinc-300">
                  both
                </strong>{" "}
                keys are valid, source, destination, and steps stay linked. With
                only one key filled, steps are independent.{" "}
                {"The song's saved key fills source when you open this dialog if it is set."}
              </p>
            </div>
            <form method="dialog">
              <button
                type="submit"
                className="rounded-md px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                aria-label="Close"
              >
                Close
              </button>
            </form>
          </div>

          <div className="space-y-4 px-5 py-4">
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                By key
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="transpose-source-key"
                    className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
                  >
                    Source key
                  </label>
                  <input
                    id="transpose-source-key"
                    type="text"
                    value={transposeSourceKey}
                    onChange={(e) => handleTransposeSourceChange(e.target.value)}
                    placeholder="e.g. Am"
                    autoComplete="off"
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="transpose-dest-key"
                    className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
                  >
                    Destination key
                  </label>
                  <input
                    id="transpose-dest-key"
                    type="text"
                    value={transposeDestKey}
                    onChange={(e) => handleTransposeDestChange(e.target.value)}
                    placeholder="e.g. Dm"
                    autoComplete="off"
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </div>
              </div>
              {transposeSourceKey.trim() !== "" &&
              transposeDestKey.trim() !== "" &&
              transposeKeyDelta === null ? (
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  Could not parse one or both keys. Use roots like C, F#, Bb,
                  Am…
                </p>
              ) : null}
            </div>

            <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  By steps
                </p>
                <label
                  htmlFor="transpose-steps"
                  className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
                >
                  Semitone steps
                </label>
                <input
                  id="transpose-steps"
                  type="number"
                  inputMode="numeric"
                  value={transposeSteps}
                  onChange={(e) => handleTransposeStepsChange(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              {transposeStepsError ? (
                <p className="mt-2 text-sm text-red-700 dark:text-red-300">
                  {transposeStepsError}
                </p>
              ) : null}
            </div>

            {transposeNotImplementedMessage ? (
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {transposeNotImplementedMessage}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  const src = transposeSourceKey.trim();
                  const dst = transposeDestKey.trim();
                  if (src !== "" && dst !== "") {
                    const delta = shortestSemitoneStepsBetweenKeys(src, dst);
                    if (delta === null) {
                      setTransposeStepsError(
                        "Could not parse source or destination key.",
                      );
                      setTransposeNotImplementedMessage(null);
                      return;
                    }
                    setTransposeStepsError(null);
                    setTransposeNotImplementedMessage("Not implemented yet.");
                    return;
                  }

                  const trimmed = transposeSteps.trim();
                  if (trimmed === "" || Number.isNaN(Number(trimmed))) {
                    setTransposeStepsError(
                      "Enter a valid number of steps, or both source and destination keys.",
                    );
                    setTransposeNotImplementedMessage(null);
                    return;
                  }
                  setTransposeStepsError(null);
                  setTransposeNotImplementedMessage("Not implemented yet.");
                }}
                className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                Apply transpose
              </button>
            </div>
          </div>
        </dialog>
      ) : null}

      {keyDialogOpen ? (
        <dialog
          ref={keyDialogRef}
          onClose={() => {
            setKeyDialogOpen(false);
            setKeyDetectBusy(false);
            setKeyDetectError(null);
            setKeyDetectResult(null);
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              (e.currentTarget as HTMLDialogElement).close();
            }
          }}
          className="fixed left-1/2 top-1/2 w-[min(24rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/40 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
        >
          <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                Detect key
              </h2>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Analyzes the first linked MP3 (up to about two minutes) using a
                chroma-based key estimator. Results are approximate.
              </p>
            </div>
            <form method="dialog">
              <button
                type="submit"
                className="rounded-md px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                aria-label="Close"
              >
                Close
              </button>
            </form>
          </div>

          <div className="space-y-4 px-5 py-4">
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={keyDetectBusy || state.status !== "ready"}
                onClick={() => void runKeyDetection()}
                className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                {keyDetectBusy ? "Analyzing…" : "Run detection"}
              </button>
            </div>

            {keyDetectError ? (
              <p className="text-sm text-red-700 dark:text-red-300">
                {keyDetectError}
              </p>
            ) : null}

            {keyDetectResult ? (
              <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="text-zinc-800 dark:text-zinc-100">
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Detected key
                  </span>{" "}
                  <span className="font-semibold tabular-nums">
                    {keyDetectResult.key}
                  </span>
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Match strength{" "}
                  {formatKeyMatchStrength(keyDetectResult.confidence)} (profile
                  correlation; higher usually means a clearer estimate).
                </p>
                <button
                  type="button"
                  onClick={() => void applyDetectedKeyToSong()}
                  disabled={keyBusy}
                  className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  {keyBusy ? "Saving…" : "Save to song"}
                </button>
              </div>
            ) : null}
          </div>
        </dialog>
      ) : null}
    </main>
  );
}

