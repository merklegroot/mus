"use client";

import { useState } from "react";

function errorMessage(data: unknown, fallback: string): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "string"
  ) {
    return (data as { error: string }).error;
  }
  return fallback;
}

export function ArtistSetlistVisibilityToggle({
  artist,
  initialExcludedFromSetlists,
}: {
  artist: string;
  initialExcludedFromSetlists: boolean;
}) {
  const [excludedFromSetlists, setExcludedFromSetlists] = useState(
    initialExcludedFromSetlists,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isVisibleInSetlists = !excludedFromSetlists;

  async function save(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/artists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist, excludedFromSetlists: next }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        setError(errorMessage(data, res.statusText));
        return;
      }
      const saved =
        typeof data === "object" &&
        data !== null &&
        typeof (data as { excludedFromSetlists?: unknown })
          .excludedFromSetlists === "boolean"
          ? (data as { excludedFromSetlists: boolean }).excludedFromSetlists
          : next;
      setExcludedFromSetlists(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <button
        type="button"
        disabled={busy}
        role="switch"
        aria-checked={isVisibleInSetlists}
        onClick={() => void save(!excludedFromSetlists)}
        className={`inline-flex items-center gap-3 rounded-full border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
          isVisibleInSetlists
            ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
            : "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-950/50"
        }`}
      >
        <span
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
            isVisibleInSetlists
              ? "bg-emerald-600 dark:bg-emerald-500"
              : "bg-amber-500 dark:bg-amber-400"
          }`}
          aria-hidden="true"
        >
          <span
            className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform ${
              isVisibleInSetlists ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </span>
        <span>
          Setlists:{" "}
          <span className="font-semibold">
            {isVisibleInSetlists ? "Visible" : "Hidden"}
          </span>
        </span>
      </button>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {busy
          ? "Saving setlist visibility…"
          : isVisibleInSetlists
            ? "Songs by this artist can appear in the setlist add picker. Click to hide them."
            : "Songs by this artist are hidden from the setlist add picker. Click to show them."}
      </p>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
