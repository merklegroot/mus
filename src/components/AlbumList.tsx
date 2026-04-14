"use client";

type AlbumListProps = {
  /** Mirrors library load state from the parent. */
  status: "loading" | "error" | "empty" | "ready";
  errorMessage?: string;
  /** Distinct non-empty album tags for the current artist scope (or all songs). */
  albums: string[];
  selectedAlbum: string | null;
  onAlbumClick: (album: string) => void;
  onClearAlbumFilter: () => void;
  /** When set, albums are scoped to this artist; used only for empty copy. */
  filterArtist: string | null;
};

export function AlbumList({
  status,
  errorMessage,
  albums,
  selectedAlbum,
  onAlbumClick,
  onClearAlbumFilter,
  filterArtist,
}: AlbumListProps) {
  const panelClass =
    "flex h-full min-h-0 w-full min-w-0 flex-col rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 text-left dark:border-zinc-800 dark:bg-zinc-900/40";

  return (
    <section className={panelClass} aria-label="Albums in library">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Albums
          {selectedAlbum ? (
            <span className="ml-1.5 font-normal text-zinc-500 dark:text-zinc-400">
              · {selectedAlbum}
            </span>
          ) : null}
        </h2>
        {selectedAlbum ? (
          <button
            type="button"
            onClick={onClearAlbumFilter}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
          >
            Clear filter
          </button>
        ) : null}
      </div>
      {status === "loading" ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : status === "error" ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          {errorMessage ?? "Error"}
        </p>
      ) : status === "empty" ? (
        <p className="text-sm text-zinc-500">No .mp3 files in this folder.</p>
      ) : albums.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {filterArtist
            ? "No album tags for songs by this artist."
            : "No album tags in the database for this folder yet."}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto text-sm text-zinc-800 dark:text-zinc-200">
          {albums.map((name) => (
            <li key={name} className="break-words py-0.5 pr-1">
              <button
                type="button"
                onClick={() => onAlbumClick(name)}
                className={`w-full rounded-md px-2 py-1.5 text-left transition-colors ${
                  selectedAlbum === name
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
