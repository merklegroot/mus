"use client";

import { useEffect, useMemo, useState } from "react";

type SetlistSummary = {
  id: number;
  name: string;
  createdAt: number;
  updatedAt: number;
  trackCount: number;
};

type SetlistTrack = {
  id: number;
  filename: string;
  position: number;
  addedAt: number;
};

type SetlistDetails = SetlistSummary & {
  tracks: SetlistTrack[];
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

function isSetlistSummary(value: unknown): value is SetlistSummary {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id: unknown }).id === "number" &&
    typeof (value as { name: unknown }).name === "string" &&
    typeof (value as { trackCount: unknown }).trackCount === "number"
  );
}

function isSetlistDetails(value: unknown): value is SetlistDetails {
  const candidate = value as { tracks?: unknown };
  return (
    isSetlistSummary(value) &&
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

export function SetlistManager() {
  const [setlists, setSetlists] = useState<SetlistSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<SetlistDetails | null>(null);
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [newName, setNewName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [songToAdd, setSongToAdd] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingFilename, setPlayingFilename] = useState<string | null>(null);
  const [queueFilenames, setQueueFilenames] = useState<string[]>([]);
  const [selectedSongFilename, setSelectedSongFilename] = useState<string | null>(
    null,
  );
  const [isPlayerVisible, setIsPlayerVisible] = useState(false);
  const [isPlayerPlaying, setIsPlayerPlaying] = useState(false);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);

  async function loadSetlists(nextSelectedId?: number | null) {
    const res = await fetch("/api/setlists");
    const data: unknown = await res.json();
    if (!res.ok) {
      throw new Error(errorMessage(data, res.statusText));
    }
    const rows =
      typeof data === "object" &&
      data !== null &&
      Array.isArray((data as { setlists?: unknown }).setlists)
        ? (data as { setlists: unknown[] }).setlists.filter(isSetlistSummary)
        : [];
    setSetlists(rows);
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
    await loadSetlist(nextId);
  }

  async function loadSetlist(id: number) {
    const res = await fetch(`/api/setlists/${id}`);
    const data: unknown = await res.json();
    if (!res.ok) {
      throw new Error(errorMessage(data, res.statusText));
    }
    const setlist =
      typeof data === "object" && data !== null
        ? (data as { setlist?: unknown }).setlist
        : null;
    if (!isSetlistDetails(setlist)) {
      throw new Error("Invalid setlist response");
    }
    setSelected(setlist);
    setRenameName(setlist.name);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [setlistsRes, songsRes] = await Promise.all([
          fetch("/api/setlists"),
          fetch("/api/mp3s"),
        ]);
        const [setlistsData, songsData]: unknown[] = await Promise.all([
          setlistsRes.json(),
          songsRes.json(),
        ]);
        if (!setlistsRes.ok) {
          throw new Error(errorMessage(setlistsData, setlistsRes.statusText));
        }
        if (!songsRes.ok) {
          throw new Error(errorMessage(songsData, songsRes.statusText));
        }
        if (cancelled) return;

        const setlistRows =
          typeof setlistsData === "object" &&
          setlistsData !== null &&
          Array.isArray(
            (setlistsData as { setlists?: unknown }).setlists,
          )
            ? (setlistsData as { setlists: unknown[] }).setlists.filter(
                isSetlistSummary,
              )
            : [];
        const songRows =
          typeof songsData === "object" &&
          songsData !== null &&
          Array.isArray((songsData as { songs?: unknown }).songs)
            ? (songsData as { songs: unknown[] }).songs.filter(isSongRow)
            : [];

        setSetlists(setlistRows);
        setSongs(songRows);
        const firstId = setlistRows[0]?.id ?? null;
        setSelectedId(firstId);
        if (firstId) {
          await loadSetlist(firstId);
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

  function selectSong(filename: string) {
    setSelectedSongFilename(filename);
  }

  function playNow(filename: string) {
    setPlayingFilename(filename);
    setIsPlayerVisible(true);
    setShouldAutoPlay(true);
  }

  function addToQueue(filename: string) {
    setQueueFilenames((prev) => [...prev, filename]);
  }

  function closePlayer() {
    setIsPlayerVisible(false);
    setIsPlayerPlaying(false);
    setShouldAutoPlay(false);
  }

  function handleTrackEnded() {
    setIsPlayerPlaying(false);
    const [nextFilename, ...remaining] = queueFilenames;
    if (!nextFilename) return;
    setQueueFilenames(remaining);
    setPlayingFilename(nextFilename);
    setIsPlayerVisible(true);
    setShouldAutoPlay(true);
  }

  function playQueuedNow(index: number) {
    const filename = queueFilenames[index];
    if (!filename) return;
    setQueueFilenames((prev) => prev.filter((_, i) => i !== index));
    playNow(filename);
  }

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

  async function createNewSetlist() {
    const name = newName.trim();
    if (!name) return;
    await runAction(async () => {
      const res = await fetch("/api/setlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error(errorMessage(data, res.statusText));
      const setlist =
        typeof data === "object" && data !== null
          ? (data as { setlist?: unknown }).setlist
          : null;
      if (!isSetlistDetails(setlist)) {
        throw new Error("Invalid setlist response");
      }
      setNewName("");
      setSelectedId(setlist.id);
      setSelected(setlist);
      setRenameName(setlist.name);
      await loadSetlists(setlist.id);
    });
  }

  async function renameSelectedSetlist() {
    if (!selected) return;
    const name = renameName.trim();
    if (!name) return;
    await runAction(async () => {
      const res = await fetch(`/api/setlists/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error(errorMessage(data, res.statusText));
      const setlist =
        typeof data === "object" && data !== null
          ? (data as { setlist?: unknown }).setlist
          : null;
      if (!isSetlistDetails(setlist)) {
        throw new Error("Invalid setlist response");
      }
      setSelected(setlist);
      setRenameName(setlist.name);
      await loadSetlists(setlist.id);
    });
  }

  async function deleteSelectedSetlist() {
    if (!selected) return;
    const ok = window.confirm(`Delete setlist "${selected.name}"?`);
    if (!ok) return;
    await runAction(async () => {
      const res = await fetch(`/api/setlists/${selected.id}`, {
        method: "DELETE",
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error(errorMessage(data, res.statusText));
      await loadSetlists(null);
    });
  }

  async function addSelectedSong() {
    if (!selected || !songToAdd) return;
    await runAction(async () => {
      const res = await fetch(`/api/setlists/${selected.id}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: songToAdd }),
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error(errorMessage(data, res.statusText));
      const setlist =
        typeof data === "object" && data !== null
          ? (data as { setlist?: unknown }).setlist
          : null;
      if (!isSetlistDetails(setlist)) {
        throw new Error("Invalid setlist response");
      }
      setSelected(setlist);
      setSongToAdd("");
      await loadSetlists(setlist.id);
    });
  }

  async function removeSong(filename: string) {
    if (!selected) return;
    await runAction(async () => {
      const params = new URLSearchParams({ filename });
      const res = await fetch(
        `/api/setlists/${selected.id}/tracks?${params.toString()}`,
        { method: "DELETE" },
      );
      const data: unknown = await res.json();
      if (!res.ok) throw new Error(errorMessage(data, res.statusText));
      const setlist =
        typeof data === "object" && data !== null
          ? (data as { setlist?: unknown }).setlist
          : null;
      if (!isSetlistDetails(setlist)) {
        throw new Error("Invalid setlist response");
      }
      setSelected(setlist);
      if (selectedSongFilename === filename) {
        setSelectedSongFilename(null);
      }
      await loadSetlists(setlist.id);
    });
  }

  const panelClass =
    "rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40";

  return (
    <>
    <main
      className={`flex flex-1 flex-col items-center gap-6 px-4 py-10 lg:items-stretch lg:px-8 ${playingFilename && isPlayerVisible ? "pb-36" : ""}`}
    >
      <section className={`${panelClass} mx-auto w-full max-w-5xl`}>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Setlists
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Create setlists from the MP3s in your music folder.
        </p>
      </section>

      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[18rem_1fr]">
        <section className={panelClass} aria-label="Setlist list">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void createNewSetlist();
            }}
          >
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="New setlist"
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
            ) : setlists.length === 0 ? (
              <p className="text-sm text-zinc-500">No setlists yet.</p>
            ) : (
              <ul className="space-y-1">
                {setlists.map((setlist) => (
                  <li key={setlist.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(setlist.id);
                        void runAction(() => loadSetlist(setlist.id));
                      }}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        selectedId === setlist.id
                          ? "bg-zinc-200 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
                          : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                      }`}
                    >
                      <span className="block truncate font-medium">
                        {setlist.name}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {setlist.trackCount} song
                        {setlist.trackCount === 1 ? "" : "s"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className={panelClass} aria-label="Setlist details">
          {error ? (
            <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          ) : null}

          {!selected ? (
            <p className="text-sm text-zinc-500">
              Create a setlist or choose one from the list.
            </p>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Setlist name
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
                  onClick={() => void renameSelectedSetlist()}
                  disabled={busy || renameName.trim() === ""}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => void deleteSelectedSetlist()}
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
                    This setlist is empty.
                  </p>
                ) : (
                  <ol className="mt-3 space-y-2">
                    {selected.tracks.map((track, index) => {
                      const isCurrent = playingFilename === track.filename;
                      const isSelectedSong =
                        selectedSongFilename === track.filename;
                      const queueCount = queueFilenames.filter(
                        (filename) => filename === track.filename,
                      ).length;

                      return (
                        <li
                          key={track.id}
                          className={`flex items-center gap-3 rounded-md border text-sm ${
                            isCurrent
                              ? "border-emerald-300 bg-emerald-50 ring-2 ring-emerald-200 dark:border-emerald-800 dark:bg-emerald-950/30 dark:ring-emerald-900"
                              : isSelectedSong
                                ? "border-sky-300 bg-sky-50 ring-2 ring-sky-200 dark:border-sky-800 dark:bg-sky-950/30 dark:ring-sky-900"
                                : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => selectSong(track.filename)}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-l-md px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
                          >
                            <span className="w-6 shrink-0 text-right text-zinc-500">
                              {index + 1}.
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block break-all text-zinc-900 dark:text-zinc-100">
                                {track.filename}
                              </span>
                              {isSelectedSong ? (
                                <span className="mt-0.5 block text-xs text-sky-700 dark:text-sky-300">
                                  Selected. Choose an action.
                                </span>
                              ) : queueCount > 0 ? (
                                <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-300">
                                  In queue {queueCount} time
                                  {queueCount === 1 ? "" : "s"}
                                </span>
                              ) : null}
                            </span>
                            {isCurrent ? (
                              <span className="shrink-0 rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-semibold text-white dark:bg-emerald-500 dark:text-emerald-950">
                                {isPlayerPlaying ? "Now playing" : "In player"}
                              </span>
                            ) : queueCount > 0 ? (
                              <span className="shrink-0 rounded-full bg-amber-600 px-2 py-0.5 text-xs font-semibold text-white dark:bg-amber-400 dark:text-amber-950">
                                Queue x{queueCount}
                              </span>
                            ) : null}
                          </button>
                          {isSelectedSong ? (
                            <>
                              <button
                                type="button"
                                onClick={() => addToQueue(track.filename)}
                                className="shrink-0 rounded-md border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-50 dark:border-sky-800 dark:bg-zinc-950 dark:text-sky-300 dark:hover:bg-sky-950/40"
                              >
                                Add to queue
                              </button>
                              <button
                                type="button"
                                onClick={() => playNow(track.filename)}
                                className="shrink-0 rounded-md bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                              >
                                Play now
                              </button>
                            </>
                          ) : null}
                          {isCurrent && !isPlayerVisible ? (
                            <button
                              type="button"
                              onClick={() => setIsPlayerVisible(true)}
                              className="shrink-0 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-zinc-950 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                            >
                              Show player
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void removeSong(track.filename)}
                            disabled={busy}
                            className="mr-3 shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
                          >
                            Remove
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
    {playingFilename && isPlayerVisible ? (
      <aside
        className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
        aria-label="Music player"
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 sm:w-80 dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Playback queue ({queueFilenames.length + 1})
            </p>
            <ol className="mt-1 max-h-28 space-y-1 overflow-y-auto text-xs">
              <li className="flex min-w-0 items-center gap-2 rounded-md bg-emerald-50 px-2 py-1 dark:bg-emerald-950/30">
                <span className="shrink-0 text-emerald-700 dark:text-emerald-300">
                  1.
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold text-zinc-950 dark:text-zinc-50">
                  {playingFilename}
                </span>
                <span className="shrink-0 rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] font-semibold text-white dark:bg-emerald-500 dark:text-emerald-950">
                  {isPlayerPlaying ? "Now playing" : "In player"}
                </span>
              </li>
              {queueFilenames.slice(0, 4).map((filename, index) => (
                  <li
                    key={`${filename}:${index}`}
                    className="flex min-w-0 items-center gap-2"
                  >
                    <span className="shrink-0 text-amber-700 dark:text-amber-300">
                      {index + 2}.
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-zinc-950 dark:text-zinc-50">
                      {filename}
                    </span>
                    {index === 0 ? (
                      <button
                        type="button"
                        onClick={() => playQueuedNow(index)}
                        className="shrink-0 rounded-md bg-zinc-950 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                      >
                        Play now
                      </button>
                    ) : null}
                  </li>
              ))}
            </ol>
              {queueFilenames.length > 4 ? (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  +{queueFilenames.length - 4} more
                </p>
              ) : null}
          </div>
          <audio
            key={playingFilename}
            controls
            autoPlay={shouldAutoPlay}
            preload="metadata"
            onPlay={() => {
              setIsPlayerPlaying(true);
              setShouldAutoPlay(false);
            }}
            onPause={() => setIsPlayerPlaying(false)}
            onEnded={handleTrackEnded}
            className="h-10 w-full accent-zinc-900 sm:max-w-xl dark:accent-zinc-100"
            src={`/api/mp3s/${encodeURIComponent(playingFilename)}/stream`}
          >
            Your browser does not support the audio element.
          </audio>
          <button
            type="button"
            onClick={closePlayer}
            className="self-end rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 sm:self-auto dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
            aria-label="Close player"
          >
            Close
          </button>
        </div>
      </aside>
    ) : null}
    </>
  );
}
