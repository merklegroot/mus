"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FilenameInferenceResult } from "@/lib/inferArtistTitleFromFilename";

type InferState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: FilenameInferenceResult };

type TrackDetails = {
  filename: string;
  trackNumber: number | null;
  id3TrackNumber: number | null;
  filenameTrackNumber: number | null;
  comments: string | null;
  sizeBytes: number;
  modified: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  genre: string | null;
  year: number | null;
  durationSec: number | null;
  bitrateKbps: number | null;
  codec: string | null;
};

type DetailsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: TrackDetails };

function sanitizeFilenamePart(s: string): string {
  // Keep it conservative: remove path separators & control chars, collapse whitespace.
  return s
    .replace(/[\0/\\]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanTaggyTitle(s: string): string {
  // Mirror the filename heuristics enough to keep rename suggestions clean when
  // ID3 titles contain common rip/store suffixes.
  let t = s.trim();
  // Remove bracketed suffixes like "(Remastered 2007)", "(Official Audio)", etc.
  t = t.replace(/\s*\([^)]*(official|lyrics?|remaster|remastered|audio|video|mv)[^)]*\)\s*$/gi, "").trim();
  // Remove trailing "Official Audio"/"Audio"/"Video"/"Lyrics" (plain suffix).
  t = t.replace(/\s+(official\s+audio|official\s+video|lyrics?|audio|video)\s*$/gi, "").trim();
  // Remove trailing remaster tags (plain suffix).
  t = t.replace(/\s*[-–—]?\s*remaster(?:ed)?(?:\s+\d{4})?\s*$/gi, "").trim();
  return t;
}

function nonEmpty(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t && t.length > 0 ? t : null;
}

function textContainsUrl(s: string): boolean {
  if (!/\S/.test(s)) return false;
  if (/https?:\/\/\S/i.test(s)) return true;
  if (/\bftp:\/\/\S/i.test(s)) return true;
  if (/\bwww\.[^\s]+/i.test(s)) return true;
  // Scheme-less short hosts common in rip metadata
  if (/\b(?:youtu\.be|t\.co|spoti\.fi|music\.apple\.com)\/\S/i.test(s)) return true;
  return false;
}

/** ID3 editor default for comments: do not suggest link-dump / promo comment fields. */
function suggestedId3Comments(raw: string | null | undefined): string {
  const t = raw?.trim() ?? "";
  if (!t) return "";
  if (textContainsUrl(t)) return "";
  return t;
}

function extLowerCommon(filename: string): string {
  const idx = filename.lastIndexOf(".");
  if (idx <= 0) return "";
  return filename.slice(idx + 1).toLowerCase();
}

export function InferFromFilenamePanel({
  filename,
  onRenamed,
}: {
  filename: string;
  onRenamed?: (newFilename: string) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [state, setState] = useState<InferState>({ status: "idle" });
  const [details, setDetails] = useState<DetailsState>({ status: "idle" });
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameStatus, setRenameStatus] = useState<
    | { status: "idle" }
    | { status: "saving" }
    | { status: "error"; message: string }
    | { status: "done" }
  >({ status: "idle" });
  const [tagDraft, setTagDraft] = useState<{
    trackNumber: string;
    title: string;
    artist: string;
    album: string;
    year: string;
    genre: string;
    comments: string;
  }>({
    trackNumber: "",
    title: "",
    artist: "",
    album: "",
    year: "",
    genre: "",
    comments: "",
  });
  const [tagStatus, setTagStatus] = useState<
    | { status: "idle" }
    | { status: "saving" }
    | { status: "error"; message: string }
    | { status: "done" }
  >({ status: "idle" });

  const encodedName = useMemo(() => encodeURIComponent(filename), [filename]);
  const ext = useMemo(() => extLowerCommon(filename) || "mp3", [filename]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialogOpen || !dialog) return;
    if (dialog.open) return;
    try {
      dialog.showModal();
    } catch {
      // ignore
    }
  }, [dialogOpen]);

  useEffect(() => {
    // Reset when selection changes.
    setState({ status: "idle" });
    setDetails({ status: "idle" });
    setRenameValue("");
    setRenameStatus({ status: "idle" });
    setTagDraft({
      trackNumber: "",
      title: "",
      artist: "",
      album: "",
      year: "",
      genre: "",
      comments: "",
    });
    setTagStatus({ status: "idle" });
    setDialogOpen(false);
  }, [filename]);

  async function runInfer() {
    setState({ status: "loading" });
    setDetails({ status: "loading" });
    setRenameStatus({ status: "idle" });
    setTagStatus({ status: "idle" });
    setDialogOpen(true);

    try {
      const [inferRes, detailsRes] = await Promise.all([
        fetch("/api/infer-filename", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename }),
        }),
        fetch(`/api/mp3s/${encodedName}`),
      ]);

      const inferJson: unknown = await inferRes.json();
      if (!inferRes.ok) {
        const message =
          typeof inferJson === "object" &&
          inferJson !== null &&
          "error" in inferJson &&
          typeof (inferJson as { error: unknown }).error === "string"
            ? (inferJson as { error: string }).error
            : inferRes.statusText;
        setState({ status: "error", message });
      }
      const detailsJson: unknown = await detailsRes.json();
      let detailsData: TrackDetails | null = null;
      if (!detailsRes.ok) {
        const message =
          typeof detailsJson === "object" &&
          detailsJson !== null &&
          "error" in detailsJson &&
          typeof (detailsJson as { error: unknown }).error === "string"
            ? (detailsJson as { error: string }).error
            : detailsRes.statusText;
        setDetails({ status: "error", message });
      } else {
        const d = detailsJson as TrackDetails;
        detailsData = d;
        setDetails({ status: "ready", data: d });
      }

      if (inferRes.ok) {
        const data = inferJson as FilenameInferenceResult;
        setState({ status: "ready", data });

        const id3 =
          detailsRes.ok ? (detailsJson as TrackDetails) : (null as TrackDetails | null);

        const inferredArtist = sanitizeFilenamePart(data.primary.artist ?? "");
        const inferredTitle = cleanTaggyTitle(
          sanitizeFilenamePart(data.primary.title ?? ""),
        );
        const id3Artist = sanitizeFilenamePart(id3?.artist ?? "");
        const id3Title = cleanTaggyTitle(sanitizeFilenamePart(id3?.title ?? ""));

        const method = data.primary.method;
        const inferenceWeak =
          !inferredArtist ||
          !inferredTitle ||
          method === "leading-track-number-then-title-only";

        const bestArtist = inferenceWeak ? id3Artist || inferredArtist : inferredArtist;
        const bestTitle = inferenceWeak ? id3Title || inferredTitle : inferredTitle;

        if (bestArtist && bestTitle) {
          setRenameValue(`${bestArtist} - ${bestTitle}.${ext}`);
        }

        // Auto-fill the ID3 editor: prefer existing ID3 values, fall back to inference for blanks.
        if (detailsData) {
          const d = detailsData;
          const mergedArtist =
            nonEmpty(d.artist) ?? (nonEmpty(inferredArtist) ? inferredArtist : "");
          const mergedTitle =
            nonEmpty(d.title) ??
            (nonEmpty(inferredTitle) ? inferredTitle : "");
          const mergedAlbum = nonEmpty(d.album) ?? "";
          const mergedGenre = nonEmpty(d.genre) ?? "";
          const mergedYear =
            d.year != null && Number.isFinite(d.year)
              ? String(d.year)
              : "";
          const mergedTrack =
            d.trackNumber != null && Number.isFinite(d.trackNumber)
              ? String(d.trackNumber)
              : "";
          const mergedComments = suggestedId3Comments(d.comments);

          setTagDraft({
            trackNumber: mergedTrack,
            title: mergedTitle,
            artist: mergedArtist,
            album: mergedAlbum,
            year: mergedYear,
            genre: mergedGenre,
            comments: mergedComments,
          });
        }
      } else if (detailsData) {
        const d = detailsData;
        setTagDraft({
          trackNumber:
            d.trackNumber != null && Number.isFinite(d.trackNumber)
              ? String(d.trackNumber)
              : "",
          title: d.title ?? "",
          artist: d.artist ?? "",
          album: d.album ?? "",
          year: d.year != null && Number.isFinite(d.year) ? String(d.year) : "",
          genre: d.genre ?? "",
          comments: suggestedId3Comments(d.comments),
        });
      }
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
      setDetails({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function saveTags() {
    setTagStatus({ status: "saving" });
    try {
      const payload = {
        trackNumber: tagDraft.trackNumber.trim() === "" ? null : tagDraft.trackNumber,
        title: tagDraft.title.trim() === "" ? null : tagDraft.title,
        artist: tagDraft.artist.trim() === "" ? null : tagDraft.artist,
        album: tagDraft.album.trim() === "" ? null : tagDraft.album,
        year: tagDraft.year.trim() === "" ? null : tagDraft.year,
        genre: tagDraft.genre.trim() === "" ? null : tagDraft.genre,
        comments: tagDraft.comments.trim() === "" ? null : tagDraft.comments,
      };
      const res = await fetch(`/api/mp3s/${encodedName}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json: unknown = await res.json().catch(() => ({} as unknown));
      if (!res.ok) {
        const message =
          typeof json === "object" &&
          json !== null &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : res.statusText;
        setTagStatus({ status: "error", message });
        return;
      }
      setTagStatus({ status: "done" });

      // Refresh details after writing tags.
      setDetails({ status: "loading" });
      const detailsRes = await fetch(`/api/mp3s/${encodedName}`);
      const detailsJson: unknown = await detailsRes.json();
      if (!detailsRes.ok) {
        const message =
          typeof detailsJson === "object" &&
          detailsJson !== null &&
          "error" in detailsJson &&
          typeof (detailsJson as { error: unknown }).error === "string"
            ? (detailsJson as { error: string }).error
            : detailsRes.statusText;
        setDetails({ status: "error", message });
      } else {
        const d = detailsJson as TrackDetails;
        setDetails({ status: "ready", data: d });
        setTagDraft({
          trackNumber:
            d.trackNumber != null ? String(d.trackNumber) : "",
          title: d.title ?? "",
          artist: d.artist ?? "",
          album: d.album ?? "",
          year: d.year != null ? String(d.year) : "",
          genre: d.genre ?? "",
          comments: suggestedId3Comments(d.comments),
        });
      }
    } catch (e) {
      setTagStatus({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function renameFile() {
    const newFilename = renameValue.trim();
    if (!newFilename) return;
    setRenameStatus({ status: "saving" });
    try {
      const res = await fetch(`/api/mp3s/${encodedName}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newFilename }),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        const message =
          typeof json === "object" &&
          json !== null &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : res.statusText;
        setRenameStatus({ status: "error", message });
        return;
      }
      const renamed =
        typeof json === "object" &&
        json !== null &&
        "filename" in json &&
        typeof (json as { filename: unknown }).filename === "string"
          ? (json as { filename: string }).filename
          : newFilename;
      setRenameStatus({ status: "done" });
      dialogRef.current?.close();
      onRenamed?.(renamed);
    } catch (e) {
      setRenameStatus({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <section
      className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700"
      aria-label="Infer artist and title from filename"
    >
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Guess from filename
      </h3>
      <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
        Heuristics on the file name only. Nothing is saved to the database.
      </p>
      <button
        type="button"
        onClick={runInfer}
        disabled={state.status === "loading"}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {state.status === "loading" ? "Inferring…" : "Infer artist & title"}
      </button>

      {dialogOpen ? (
        <dialog
          ref={dialogRef}
          onClose={() => setDialogOpen(false)}
          onMouseDown={(e) => {
            // Backdrop clicks hit the <dialog> element itself, not descendants.
            if (e.target === e.currentTarget) {
              (e.currentTarget as HTMLDialogElement).close();
            }
          }}
          className="fixed left-1/2 top-1/2 flex max-h-[85vh] w-[min(44rem,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/40 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
        >
          <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Filename inference</h3>
              <p className="mt-1 break-all text-xs text-zinc-600 dark:text-zinc-400">
                {filename}
              </p>
            </div>
            <form method="dialog">
              <button
                className="rounded-md px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                aria-label="Close"
              >
                Close
              </button>
            </form>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
          <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
            <section className="space-y-2">
              <h4 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                ID3 / file details
              </h4>
              {details.status === "loading" ? (
                <p className="text-sm text-zinc-500">Loading…</p>
              ) : details.status === "error" ? (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {details.message}
                </p>
              ) : details.status === "ready" ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-zinc-500 dark:text-zinc-400">Track # (ID3)</dt>
                  <dd className="break-words">
                    {details.data.id3TrackNumber != null
                      ? String(details.data.id3TrackNumber)
                      : "—"}
                  </dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">Track # (filename)</dt>
                  <dd className="break-words">
                    {details.data.filenameTrackNumber != null
                      ? String(details.data.filenameTrackNumber)
                      : "—"}
                  </dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">Track # (resolved)</dt>
                  <dd className="break-words">
                    {details.data.trackNumber != null
                      ? String(details.data.trackNumber)
                      : "—"}
                  </dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">Artist</dt>
                  <dd className="break-words">{details.data.artist ?? "—"}</dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">Title</dt>
                  <dd className="break-words">{details.data.title ?? "—"}</dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">Album</dt>
                  <dd className="break-words">{details.data.album ?? "—"}</dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">Year</dt>
                  <dd className="break-words">
                    {details.data.year != null ? String(details.data.year) : "—"}
                  </dd>
                <dt className="text-zinc-500 dark:text-zinc-400">Genre</dt>
                <dd className="break-words">{details.data.genre ?? "—"}</dd>
                <dt className="text-zinc-500 dark:text-zinc-400">Comments</dt>
                <dd className="whitespace-pre-wrap break-words">
                  {details.data.comments ?? "—"}
                </dd>
                <dt className="text-zinc-500 dark:text-zinc-400">Codec</dt>
                <dd className="break-words">{details.data.codec ?? "—"}</dd>
              </dl>
              ) : (
                <p className="text-sm text-zinc-500">—</p>
              )}
            </section>

            <section className="space-y-2">
              <h4 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Inferred from filename
              </h4>
              {state.status === "loading" ? (
                <p className="text-sm text-zinc-500">Loading…</p>
              ) : state.status === "error" ? (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {state.message}
                </p>
              ) : state.status === "ready" ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Cleaned stem
                    </p>
                    <p className="break-all font-mono text-xs text-zinc-900 dark:text-zinc-100">
                      {state.data.cleanStem}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Primary guess
                    </p>
                    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                      <dt className="text-zinc-500 dark:text-zinc-400">Artist</dt>
                      <dd className="break-words text-zinc-900 dark:text-zinc-100">
                        {state.data.primary.artist ?? "—"}
                      </dd>
                      <dt className="text-zinc-500 dark:text-zinc-400">Title</dt>
                      <dd className="break-words text-zinc-900 dark:text-zinc-100">
                        {state.data.primary.title ?? "—"}
                      </dd>
                      <dt className="text-zinc-500 dark:text-zinc-400">Rule</dt>
                      <dd className="break-all text-zinc-700 dark:text-zinc-300">
                        {state.data.primary.method}
                      </dd>
                    </dl>
                  </div>
                  {state.data.interpretations.length > 1 ? (
                    <div>
                      <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Other interpretations
                      </p>
                      <ul className="space-y-2 text-xs">
                        {state.data.interpretations.slice(1).map((it, i) => (
                          <li
                            key={`${it.method}-${i}`}
                            className="rounded border border-zinc-200/80 p-2 dark:border-zinc-800"
                          >
                            <span className="text-zinc-500 dark:text-zinc-400">
                              {it.method}
                            </span>
                            <span className="mx-1 text-zinc-400">·</span>
                            <span className="text-zinc-800 dark:text-zinc-200">
                              {(it.artist ?? "?") + " — " + (it.title ?? "?")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">—</p>
              )}
            </section>
          </div>

          <div className="border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h4 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Edit ID3 tags
          </h4>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Changes are written to the MP3 file.
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              Track #
              <input
                value={tagDraft.trackNumber}
                onChange={(e) =>
                  setTagDraft((p) => ({ ...p, trackNumber: e.target.value }))
                }
                inputMode="numeric"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                Prefilled from the resolved track (ID3 + filename) when applicable. Saved to
                ID3 <span className="font-mono">TRCK</span>.
              </p>
            </label>
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              Year
              <input
                value={tagDraft.year}
                onChange={(e) =>
                  setTagDraft((p) => ({ ...p, year: e.target.value }))
                }
                inputMode="numeric"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-2">
              Title
              <input
                value={tagDraft.title}
                onChange={(e) =>
                  setTagDraft((p) => ({ ...p, title: e.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              Artist
              <input
                value={tagDraft.artist}
                onChange={(e) =>
                  setTagDraft((p) => ({ ...p, artist: e.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="text-xs text-zinc-600 dark:text-zinc-400">
              Album
              <input
                value={tagDraft.album}
                onChange={(e) =>
                  setTagDraft((p) => ({ ...p, album: e.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-2">
              Genre
              <input
                value={tagDraft.genre}
                onChange={(e) =>
                  setTagDraft((p) => ({ ...p, genre: e.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <label className="text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-2">
              Comments
              <textarea
                value={tagDraft.comments}
                onChange={(e) =>
                  setTagDraft((p) => ({ ...p, comments: e.target.value }))
                }
                rows={4}
                className="mt-1 w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={saveTags}
              disabled={tagStatus.status === "saving"}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {tagStatus.status === "saving" ? "Saving…" : "Save tags"}
            </button>
          </div>
          {tagStatus.status === "error" ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {tagStatus.message}
            </p>
          ) : null}
          {tagStatus.status === "done" ? (
            <p className="mt-2 text-sm text-green-700 dark:text-green-400">
              Saved.
            </p>
          ) : null}
        </div>

          <div className="border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h4 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Rename file
          </h4>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Rename to <span className="font-mono">{`{Artist} - {Title}.${ext}`}</span>
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder={`Artist - Title.${ext}`}
              className="w-full flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <button
              type="button"
              onClick={renameFile}
              disabled={
                renameStatus.status === "saving" ||
                renameValue.trim().length === 0
              }
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {renameStatus.status === "saving" ? "Renaming…" : "Rename"}
            </button>
          </div>
          {renameValue.trim().length === 0 ? (
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
              Add missing Artist/Title (from ID3 or inference) to enable a suggested rename.
            </p>
          ) : null}
          {renameStatus.status === "error" ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {renameStatus.message}
            </p>
          ) : null}
        </div>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}
