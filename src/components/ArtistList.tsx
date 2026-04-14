"use client";

import { useEffect, useState } from "react";

type ArtistListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; artists: string[] };

function parseArtistsResponse(data: unknown): string[] | null {
  if (typeof data !== "object" || data === null || !("artists" in data)) {
    return null;
  }
  const raw = (data as { artists: unknown }).artists;
  if (!Array.isArray(raw)) return null;
  return raw.filter((a): a is string => typeof a === "string");
}

export function ArtistList({
  selectedArtist,
  onArtistClick,
}: {
  selectedArtist: string | null;
  onArtistClick: (artist: string) => void;
}) {
  const [state, setState] = useState<ArtistListState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch("/api/artists")
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

        const artists = parseArtistsResponse(data);
        if (!artists) {
          setState({ status: "error", message: "Invalid response" });
          return;
        }

        setState({ status: "ready", artists });
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

  const panelClass =
    "flex h-full min-h-0 w-full min-w-0 flex-col rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 text-left dark:border-zinc-800 dark:bg-zinc-900/40";

  return (
    <section className={panelClass} aria-label="Artists in library">
      <h2 className="mb-3 shrink-0 text-sm font-medium text-zinc-800 dark:text-zinc-200">
        Artists
      </h2>
      {state.status === "loading" ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : state.status === "error" ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      ) : state.artists.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No artists from ID3 tags or inferred from filenames in this folder.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto text-sm text-zinc-800 dark:text-zinc-200">
          {state.artists.map((name) => (
            <li key={name} className="break-words py-0.5 pr-1">
              <button
                type="button"
                onClick={() => onArtistClick(name)}
                className={`w-full rounded-md px-2 py-1.5 text-left transition-colors ${
                  selectedArtist === name
                    ? "bg-zinc-200 font-medium text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800/60"
                }`}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
