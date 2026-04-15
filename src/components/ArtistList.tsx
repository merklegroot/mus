"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type DiscogsFetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; discogsName: string; discogsId: number }
  | { status: "error"; message: string };

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
  onClearArtistFilter,
}: {
  selectedArtist: string | null;
  onArtistClick: (artist: string) => void;
  onClearArtistFilter: () => void;
}) {
  const [state, setState] = useState<ArtistListState>({ status: "loading" });
  const [discogs, setDiscogs] = useState<DiscogsFetchState>({ status: "idle" });

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
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Artists
          {selectedArtist ? (
            <span className="ml-1.5 font-normal text-zinc-500 dark:text-zinc-400">
              · {selectedArtist}
            </span>
          ) : null}
        </h2>
        {selectedArtist ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <Link
              href={`/artist/${encodeURIComponent(selectedArtist)}`}
              className="rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
            >
              Artist page
            </Link>
            <button
              type="button"
              disabled={discogs.status === "loading"}
              onClick={async () => {
                if (!selectedArtist) return;
                setDiscogs({ status: "loading" });
                try {
                  const res = await fetch("/api/discogs/fetch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ artist: selectedArtist }),
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
                    setDiscogs({ status: "error", message });
                    return;
                  }
                  if (
                    typeof data === "object" &&
                    data !== null &&
                    typeof (data as { discogsName: unknown }).discogsName === "string" &&
                    typeof (data as { discogsId: unknown }).discogsId === "number"
                  ) {
                    setDiscogs({
                      status: "ok",
                      discogsName: (data as { discogsName: string }).discogsName,
                      discogsId: (data as { discogsId: number }).discogsId,
                    });
                    return;
                  }
                  setDiscogs({ status: "error", message: "Invalid response" });
                } catch (e) {
                  setDiscogs({
                    status: "error",
                    message: e instanceof Error ? e.message : String(e),
                  });
                }
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
            >
              {discogs.status === "loading" ? "Discogs…" : "Discogs"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDiscogs({ status: "idle" });
                onClearArtistFilter();
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
            >
              Clear filter
            </button>
          </div>
        ) : null}
      </div>
      {selectedArtist && discogs.status === "ok" ? (
        <p className="mb-2 shrink-0 text-xs text-zinc-600 dark:text-zinc-400">
          Saved Discogs artist #{discogs.discogsId}
          {discogs.discogsName !== selectedArtist
            ? ` (${discogs.discogsName})`
            : ""}{" "}
          to SQLite.
        </p>
      ) : null}
      {selectedArtist && discogs.status === "error" ? (
        <p className="mb-2 shrink-0 text-xs text-red-600 dark:text-red-400">
          {discogs.message}
        </p>
      ) : null}
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
            <li
              key={name}
              className="flex min-w-0 items-stretch gap-1 break-words py-0.5 pr-1"
            >
              <button
                type="button"
                onClick={() => {
                  setDiscogs({ status: "idle" });
                  onArtistClick(name);
                }}
                className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-left transition-colors ${
                  selectedArtist === name
                    ? "bg-zinc-200 font-medium text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800/60"
                }`}
              >
                {name}
              </button>
              <Link
                href={`/artist/${encodeURIComponent(name)}`}
                className="shrink-0 self-center rounded-md px-2 py-1.5 text-xs font-medium text-zinc-600 underline-offset-2 hover:bg-zinc-100 hover:underline dark:text-zinc-400 dark:hover:bg-zinc-800/60"
              >
                Page
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
