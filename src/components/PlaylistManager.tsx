"use client";

import { useEffect, useMemo, useState } from "react";

type PlaylistSummary = {
  id: number;
  name: string;
  createdAt: number;
  updatedAt: number;
  trackCount: number;
};

type PlaylistTrack = {
  id: number;
  filename: string;
  position: number;
  addedAt: number;
};

type PlaylistDetails = PlaylistSummary & {
  tracks: PlaylistTrack[];
};

type SongRow = {
  filename: string;
  artist: string | null;
  album: string | null;
};

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

function isPlaylistSummary(value: unknown): value is PlaylistSummary {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id: unknown }).id === "number" &&
    typeof (value as { name: unknown }).name === "string" &&
    typeof (value as { trackCount: unknown }).trackCount === "number"
  );
}

function isPlaylistDetails(value: unknown): value is PlaylistDetails {
  const candidate = value as { tracks?: unknown };
  return (
    isPlaylistSummary(value) &&
    Array.isArray(candidate.tracks)
  );
}

function isSongRow(value: unknown): value is SongRow {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { filename: unknown }).filename === "string"
  );
}

export function PlaylistManager() {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<PlaylistDetails | null>(null);
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [newName, setNewName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [songToAdd, setSongToAdd] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPlaylists(nextSelectedId?: number | null) {
    const res = await fetch("/api/playlists");
    const data: unknown = await res.json();
    if (!res.ok) {
      throw new Error(errorMessage(data, res.statusText));
    }
    const rows =
      typeof data === "object" &&
      data !== null &&
      Array.isArray((data as { playlists?: unknown }).playlists)
        ? (data as { playlists: unknown[] }).playlists.filter(isPlaylistSummary)
        : [];
    setPlaylists(rows);
    const wantedId =
      nextSelectedId === undefined ? selectedId : nextSelectedId;
    const nextId =
      wantedId && rows.some((p) => p.id === wantedId)
        ? wantedId
        : rows[0]?.id ?? null;
    setSelectedId(nextId);
    if (!nextId) {
      setSelected(null);
      return;
    }
    await loadPlaylist(nextId);
  }

  async function loadPlaylist(id: number) {
    const res = await fetch(`/api/playlists/${id}`);
    const data: unknown = await res.json();
    if (!res.ok) {
      throw new Error(errorMessage(data, res.statusText));
    }
    const playlist =
      typeof data === "object" && data !== null
        ? (data as { playlist?: unknown }).playlist
        : null;
    if (!isPlaylistDetails(playlist)) {
      throw new Error("Invalid playlist response");
    }
    setSelected(playlist);
    setRenameName(playlist.name);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [playlistsRes, songsRes] = await Promise.all([
          fetch("/api/playlists"),
          fetch("/api/mp3s"),
        ]);
        const [playlistsData, songsData]: unknown[] = await Promise.all([
          playlistsRes.json(),
          songsRes.json(),
        ]);
        if (!playlistsRes.ok) {
          throw new Error(errorMessage(playlistsData, playlistsRes.statusText));
        }
        if (!songsRes.ok) {
          throw new Error(errorMessage(songsData, songsRes.statusText));
        }
        if (cancelled) return;

        const playlistRows =
          typeof playlistsData === "object" &&
          playlistsData !== null &&
          Array.isArray(
            (playlistsData as { playlists?: unknown }).playlists,
          )
            ? (playlistsData as { playlists: unknown[] }).playlists.filter(
                isPlaylistSummary,
              )
            : [];
        const songRows =
          typeof songsData === "object" &&
          songsData !== null &&
          Array.isArray((songsData as { songs?: unknown }).songs)
            ? (songsData as { songs: unknown[] }).songs.filter(isSongRow)
            : [];

        setPlaylists(playlistRows);
        setSongs(songRows);
        const firstId = playlistRows[0]?.id ?? null;
        setSelectedId(firstId);
        if (firstId) {
          await loadPlaylist(firstId);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedFilenames = useMemo(
    () => new Set(selected?.tracks.map((track) => track.filename) ?? []),
    [selected],
  );

  const availableSongs = useMemo(
    () => songs.filter((song) => !selectedFilenames.has(song.filename)),
    [songs, selectedFilenames],
  );

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function createNewPlaylist() {
    const name = newName.trim();
    if (!name) return;
    await runAction(async () => {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error(errorMessage(data, res.statusText));
      const playlist =
        typeof data === "object" && data !== null
          ? (data as { playlist?: unknown }).playlist
          : null;
      if (!isPlaylistDetails(playlist)) {
        throw new Error("Invalid playlist response");
      }
      setNewName("");
      setSelectedId(playlist.id);
      setSelected(playlist);
      setRenameName(playlist.name);
      await loadPlaylists(playlist.id);
    });
  }

  async function renameSelectedPlaylist() {
    if (!selected) return;
    const name = renameName.trim();
    if (!name) return;
    await runAction(async () => {
      const res = await fetch(`/api/playlists/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error(errorMessage(data, res.statusText));
      const playlist =
        typeof data === "object" && data !== null
          ? (data as { playlist?: unknown }).playlist
          : null;
      if (!isPlaylistDetails(playlist)) {
        throw new Error("Invalid playlist response");
      }
      setSelected(playlist);
      setRenameName(playlist.name);
      await loadPlaylists(playlist.id);
    });
  }

  async function deleteSelectedPlaylist() {
    if (!selected) return;
    const ok = window.confirm(`Delete playlist "${selected.name}"?`);
    if (!ok) return;
    await runAction(async () => {
      const res = await fetch(`/api/playlists/${selected.id}`, {
        method: "DELETE",
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error(errorMessage(data, res.statusText));
      await loadPlaylists(null);
    });
  }

  async function addSelectedSong() {
    if (!selected || !songToAdd) return;
    await runAction(async () => {
      const res = await fetch(`/api/playlists/${selected.id}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: songToAdd }),
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error(errorMessage(data, res.statusText));
      const playlist =
        typeof data === "object" && data !== null
          ? (data as { playlist?: unknown }).playlist
          : null;
      if (!isPlaylistDetails(playlist)) {
        throw new Error("Invalid playlist response");
      }
      setSelected(playlist);
      setSongToAdd("");
      await loadPlaylists(playlist.id);
    });
  }

  async function removeSong(filename: string) {
    if (!selected) return;
    await runAction(async () => {
      const params = new URLSearchParams({ filename });
      const res = await fetch(
        `/api/playlists/${selected.id}/tracks?${params.toString()}`,
        { method: "DELETE" },
      );
      const data: unknown = await res.json();
      if (!res.ok) throw new Error(errorMessage(data, res.statusText));
      const playlist =
        typeof data === "object" && data !== null
          ? (data as { playlist?: unknown }).playlist
          : null;
      if (!isPlaylistDetails(playlist)) {
        throw new Error("Invalid playlist response");
      }
      setSelected(playlist);
      await loadPlaylists(playlist.id);
    });
  }

  const panelClass =
    "rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40";

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-10 lg:items-stretch lg:px-8">
      <section className={`${panelClass} mx-auto w-full max-w-5xl`}>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Playlists
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Create playlists from the MP3s in your music folder.
        </p>
      </section>

      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[18rem_1fr]">
        <section className={panelClass} aria-label="Playlist list">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void createNewPlaylist();
            }}
          >
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="New playlist"
              disabled={busy}
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
            />
            <button
              type="submit"
              disabled={busy || newName.trim() === ""}
              className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
            >
              Create
            </button>
          </form>

          <div className="mt-4">
            {loading ? (
              <p className="text-sm text-zinc-500">Loading...</p>
            ) : playlists.length === 0 ? (
              <p className="text-sm text-zinc-500">No playlists yet.</p>
            ) : (
              <ul className="space-y-1">
                {playlists.map((playlist) => (
                  <li key={playlist.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(playlist.id);
                        void runAction(() => loadPlaylist(playlist.id));
                      }}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        selectedId === playlist.id
                          ? "bg-zinc-200 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
                          : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                      }`}
                    >
                      <span className="block truncate font-medium">
                        {playlist.name}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {playlist.trackCount} song
                        {playlist.trackCount === 1 ? "" : "s"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className={panelClass} aria-label="Playlist details">
          {error ? (
            <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          ) : null}

          {!selected ? (
            <p className="text-sm text-zinc-500">
              Create a playlist or choose one from the list.
            </p>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Playlist name
                  <input
                    type="text"
                    value={renameName}
                    onChange={(event) => setRenameName(event.target.value)}
                    disabled={busy}
                    className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void renameSelectedPlaylist()}
                  disabled={busy || renameName.trim() === ""}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => void deleteSelectedPlaylist()}
                  disabled={busy}
                  className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-zinc-950 dark:text-red-300 dark:hover:bg-red-950/40"
                >
                  Delete
                </button>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Add song
                  <select
                    value={songToAdd}
                    onChange={(event) => setSongToAdd(event.target.value)}
                    disabled={busy || availableSongs.length === 0}
                    className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                  >
                    <option value="">
                      {availableSongs.length === 0
                        ? "No songs available"
                        : "Choose a song"}
                    </option>
                    {availableSongs.map((song) => (
                      <option key={song.filename} value={song.filename}>
                        {song.filename}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => void addSelectedSong()}
                  disabled={busy || songToAdd === ""}
                  className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
                >
                  Add
                </button>
              </div>

              <div>
                <h2 className="text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                  Songs
                </h2>
                {selected.tracks.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500">
                    This playlist is empty.
                  </p>
                ) : (
                  <ol className="mt-3 space-y-2">
                    {selected.tracks.map((track, index) => (
                      <li
                        key={track.id}
                        className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                      >
                        <span className="w-6 shrink-0 text-right text-zinc-500">
                          {index + 1}.
                        </span>
                        <span className="min-w-0 flex-1 break-all text-zinc-900 dark:text-zinc-100">
                          {track.filename}
                        </span>
                        <button
                          type="button"
                          onClick={() => void removeSong(track.filename)}
                          disabled={busy}
                          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
