"use client";

import { useState } from "react";

export function YoutubeDownloadForm() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/youtube/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data: unknown = await res.json().catch(() => ({}));

      if (!res.ok) {
        const err =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : res.statusText;
        setStatus("error");
        setMessage(err);
        return;
      }

      setStatus("success");
      setMessage(
        "Download finished. The new MP3 should appear in your library after you refresh Home.",
      );
      setUrl("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section
      className="mt-10 w-full max-w-xl rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 text-left dark:border-zinc-800 dark:bg-zinc-900/40"
      aria-label="Download audio from YouTube"
    >
      <h2 className="mb-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">
        Download MP3
      </h2>
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="youtube-url">
          YouTube URL
        </label>
        <input
          id="youtube-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://www.youtube.com/watch?v=…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={status === "loading"}
          className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
        <button
          type="submit"
          disabled={status === "loading" || !url.trim()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {status === "loading" ? "Downloading…" : "Download"}
        </button>
      </form>
      {status === "success" ? (
        <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">
          {message}
        </p>
      ) : null}
      {status === "error" ? (
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200">
          {message}
        </pre>
      ) : null}
    </section>
  );
}
