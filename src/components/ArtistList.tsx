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
  | { status: "ready"; artists: ArtistRow[] };

type ArtistRow = {
  name: string;
  excludedFromSetlists: boolean;
};

function parseArtistsResponse(data: unknown): ArtistRow[] | null {
  if (typeof data !== "object" || data === null || !("artists" in data)) {
    return null;
  }
  const raw = (data as { artists: unknown }).artists;
  if (!Array.isArray(raw)) return null;
  const artists: ArtistRow[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      artists.push({ name: item, excludedFromSetlists: false });
      continue;
    }
    if (
      typeof item === "object" &&
      item !== null &&
      typeof (item as { name: unknown }).name === "string"
    ) {
      artists.push({
        name: (item as { name: string }).name,
        excludedFromSetlists:
          (item as { excludedFromSetlists?: unknown }).excludedFromSetlists ===
          true,
      });
    }
  }
  return artists;
}

export function ArtistList({
  selectedArtist,
  onArtistClick,
  onClearArtistFilter,
  onArtistSetlistVisibilityChanged,
  reloadToken,
  showDiscogsActions = true,
}: {
  selectedArtist: string | null;
  onArtistClick: (artist: string) => void;
  onClearArtistFilter: () => void;
  onArtistSetlistVisibilityChanged?: (
    artist: string,
    excludedFromSetlists: boolean,
  ) => void;
  reloadToken?: number;
  showDiscogsActions?: boolean;
}) {
  const [state, setState] = useState<ArtistListState>({ status: "loading" });
  const [discogs, setDiscogs] = useState<DiscogsFetchState>({ status: "idle" });
  const [setlistBusy, setSetlistBusy] = useState(false);
  const [setlistError, setSetlistError] = useState<string | null>(null);

  const selectedArtistRow =
    state.status === "ready" && selectedArtist
      ? state.artists.find((artist) => artist.name === selectedArtist) ?? null
      : null;

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
  }, [reloadToken]);

  useEffect(() => {
    setSetlistBusy(false);
    setSetlistError(null);
  }, [selectedArtist]);

  async function setArtistSetlistVisibility(
    artist: string,
    excludedFromSetlists: boolean,
  ): Promise<void> {
    setSetlistBusy(true);
    setSetlistError(null);
    try {
      const res = await fetch("/api/artists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist, excludedFromSetlists }),
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
        setSetlistError(message);
        return;
      }
      const next =
        typeof data === "object" &&
        data !== null &&
        typeof (data as { excludedFromSetlists?: unknown })
          .excludedFromSetlists === "boolean"
          ? (data as { excludedFromSetlists: boolean }).excludedFromSetlists
          : excludedFromSetlists;
      setState((prev) =>
        prev.status === "ready"
          ? {
              status: "ready",
              artists: prev.artists.map((row) =>
                row.name === artist
                  ? { ...row, excludedFromSetlists: next }
                  : row,
              ),
            }
          : prev,
      );
      onArtistSetlistVisibilityChanged?.(artist, next);
    } catch (err) {
      setSetlistError(err instanceof Error ? err.message : String(err));
    } finally {
      setSetlistBusy(false);
    }
  }

  const panelClass =
    "flex h-full min-h-0 w-full min-w-0 flex-col rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 text-left dark:border-zinc-800 dark:bg-zinc-900/40";

  return (
    <section className={panelClass} aria-label="Artists in library">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Artists
          {selectedArtist ? (
            <span className="ml-1.5 text-sm font-normal text-zinc-500 dark:text-zinc-400">
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
            {showDiscogsActions ? (
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
                      typeof (data as { discogsName: unknown }).discogsName ===
                        "string" &&
                      typeof (data as { discogsId: unknown }).discogsId ===
                        "number"
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
            ) : null}
            {selectedArtistRow ? (
              <button
                type="button"
                disabled={setlistBusy}
                onClick={() =>
                  void setArtistSetlistVisibility(
                    selectedArtistRow.name,
                    !selectedArtistRow.excludedFromSetlists,
                  )
                }
                className="rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
              >
                {setlistBusy
                  ? "Saving…"
                  : selectedArtistRow.excludedFromSetlists
                    ? "Show in setlists"
                    : "Hide from setlists"}
              </button>
            ) : null}
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
      {showDiscogsActions && selectedArtist && discogs.status === "ok" ? (
        <p className="mb-2 shrink-0 text-xs text-zinc-600 dark:text-zinc-400">
          Saved Discogs artist #{discogs.discogsId}
          {discogs.discogsName !== selectedArtist
            ? ` (${discogs.discogsName})`
            : ""}{" "}
          to SQLite.
        </p>
      ) : null}
      {showDiscogsActions && selectedArtist && discogs.status === "error" ? (
        <p className="mb-2 shrink-0 text-xs text-red-600 dark:text-red-400">
          {discogs.message}
        </p>
      ) : null}
      {selectedArtist && setlistError ? (
        <p className="mb-2 shrink-0 text-xs text-red-600 dark:text-red-400">
          {setlistError}
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
          {state.artists.map((artist) => (
            <li
              key={artist.name}
              className="flex min-w-0 items-stretch gap-1 break-words py-0.5 pr-1"
            >
              <button
                type="button"
                onClick={() => {
                  setDiscogs({ status: "idle" });
                  onArtistClick(artist.name);
                }}
                className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-left transition-colors ${
                  selectedArtist === artist.name
                    ? "bg-zinc-200 font-medium text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800/60"
                }`}
              >
                <span className="block">{artist.name}</span>
                {artist.excludedFromSetlists ? (
                  <span className="mt-0.5 block text-xs font-normal text-amber-700 dark:text-amber-300">
                    Hidden from setlists
                  </span>
                ) : null}
              </button>
              <Link
                href={`/artist/${encodeURIComponent(artist.name)}`}
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
