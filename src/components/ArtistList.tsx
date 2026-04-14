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

export function ArtistList() {
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
    "w-full max-w-5xl rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 text-left dark:border-zinc-800 dark:bg-zinc-900/40";

  return (
    <section className={panelClass} aria-label="Artists in library">
      <h2 className="mb-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">
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
        <ul className="columns-2 gap-x-8 text-sm text-zinc-800 sm:columns-3 md:columns-4 dark:text-zinc-200">
          {state.artists.map((name) => (
            <li key={name} className="break-words py-0.5 pr-2">
              {name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
