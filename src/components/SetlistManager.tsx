"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePlayer } from "@/components/player/PlayerContext";

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
  notes: string;
  songKey: string;
};

type SetlistDetails = SetlistSummary & {
  tracks: SetlistTrack[];
};

type SongRow = {
  songId: number;
  filename: string;
  artist: string | null;
  album: string | null;
  excludedFromSetlists?: boolean;
  artistExcludedFromSetlists?: boolean;
};

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M6.5 4.4v11.2c0 .6.7 1 1.2.6l8.4-5.6a.75.75 0 0 0 0-1.2L7.7 3.8c-.5-.4-1.2 0-1.2.6Z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M6 4.75A.75.75 0 0 1 6.75 4h1.5a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-1.5A.75.75 0 0 1 6 15.25V4.75Zm5 0a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75V4.75Z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M10 3.75a.75.75 0 0 1 .75.75v4.75h4.75a.75.75 0 0 1 0 1.5h-4.75v4.75a.75.75 0 0 1-1.5 0v-4.75H4.5a.75.75 0 0 1 0-1.5h4.75V4.5a.75.75 0 0 1 .75-.75Z" />
    </svg>
  );
}

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
    typeof (value as { songId: unknown }).songId === "number" &&
    typeof (value as { filename: unknown }).filename === "string"
  );
}

export function SetlistManager() {
  const {
    playingFilename,
    queueFilenames,
    isPlayerVisible,
    isPlayerPlaying,
    playNow,
    togglePlayback,
    addToQueue,
    showPlayer,
  } = usePlayer();

  const [setlists, setSetlists] = useState<SetlistSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<SetlistDetails | null>(null);
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [newName, setNewName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [songToAdd, setSongToAdd] = useState("");
  const [songSearch, setSongSearch] = useState("");
  const [isSongPickerOpen, setIsSongPickerOpen] = useState(false);
  const [songKeyDraft, setSongKeyDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedTrackFilename, setDraggedTrackFilename] = useState<string | null>(
    null,
  );
  const [dropTarget, setDropTarget] = useState<{
    filename: string;
    placement: "before" | "after";
  } | null>(null);
  const [selectedSongFilename, setSelectedSongFilename] = useState<string | null>(
    null,
  );

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
    () =>
      songs.filter(
        (song) =>
          !song.excludedFromSetlists &&
          !song.artistExcludedFromSetlists &&
          !selectedFilenames.has(song.filename),
      ),
    [songs, selectedFilenames],
  );

  const matchingSongs = useMemo(() => {
    const terms = songSearch
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (terms.length === 0) return availableSongs;

    return availableSongs.filter((song) => {
      const searchable = [song.filename, song.artist, song.album]
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .toLowerCase();
      return terms.every((term) => searchable.includes(term));
    });
  }, [availableSongs, songSearch]);

  const visibleSongMatches = useMemo(
    () => matchingSongs.slice(0, 12),
    [matchingSongs],
  );

  const selectedTrack = useMemo(
    () =>
      selected?.tracks.find((track) => track.filename === selectedSongFilename) ??
      null,
    [selected, selectedSongFilename],
  );

  const songIdByFilename = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of songs) {
      if (typeof s.filename === "string" && typeof s.songId === "number") {
        map.set(s.filename, s.songId);
      }
    }
    return map;
  }, [songs]);

  useEffect(() => {
    if (!selectedSongFilename) {
      setSongKeyDraft("");
      setNotesDraft("");
      return;
    }

    if (!selectedTrack) {
      setSelectedSongFilename(null);
      setSongKeyDraft("");
      setNotesDraft("");
      return;
    }

    setSongKeyDraft(selectedTrack.songKey);
    setNotesDraft(selectedTrack.notes);
  }, [selectedSongFilename, selectedTrack]);

  function selectSong(filename: string) {
    const track = selected?.tracks.find((item) => item.filename === filename);
    setSelectedSongFilename(filename);
    setSongKeyDraft(track?.songKey ?? "");
    setNotesDraft(track?.notes ?? "");
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
    if (!selected) return;
    const filename = songToAdd || visibleSongMatches[0]?.filename;
    if (!filename) return;
    await runAction(async () => {
      const res = await fetch(`/api/setlists/${selected.id}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
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
      setSongSearch("");
      setIsSongPickerOpen(false);
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
        setSongKeyDraft("");
        setNotesDraft("");
      }
      await loadSetlists(setlist.id);
    });
  }

  async function saveSelectedSongDetails() {
    if (!selected || !selectedSongFilename) return;
    const filename = selectedSongFilename;
    await runAction(async () => {
      const res = await fetch(`/api/setlists/${selected.id}/tracks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename,
          notes: notesDraft,
          songKey: songKeyDraft,
        }),
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
      const updatedTrack = setlist.tracks.find(
        (track) => track.filename === filename,
      );
      setSongKeyDraft(updatedTrack?.songKey ?? "");
      setNotesDraft(updatedTrack?.notes ?? "");
      await loadSetlists(setlist.id);
    });
  }

  async function reorderSelectedTracks(
    draggedFilename: string,
    targetFilename: string,
    placement: "before" | "after",
  ) {
    if (!selected || draggedFilename === targetFilename) return;

    const moved = selected.tracks.find(
      (track) => track.filename === draggedFilename,
    );
    if (!moved) return;

    const remainingTracks = selected.tracks.filter(
      (track) => track.filename !== draggedFilename,
    );
    const targetIndex = remainingTracks.findIndex(
      (track) => track.filename === targetFilename,
    );
    if (targetIndex < 0) return;

    const previous = selected;
    const nextTracks = [...remainingTracks];
    nextTracks.splice(placement === "after" ? targetIndex + 1 : targetIndex, 0, moved);
    const reorderedTracks = nextTracks.map((track, index) => ({
      ...track,
      position: index,
    }));

    if (
      reorderedTracks.every(
        (track, index) => track.filename === selected.tracks[index]?.filename,
      )
    ) {
      return;
    }

    setSelected({ ...selected, tracks: reorderedTracks });
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/setlists/${selected.id}/tracks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filenames: reorderedTracks.map((track) => track.filename),
        }),
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
      await loadSetlists(setlist.id);
    } catch (err) {
      setSelected(previous);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function moveTrackByOne(filename: string, direction: -1 | 1) {
    if (!selected) return;
    const index = selected.tracks.findIndex((track) => track.filename === filename);
    const target = selected.tracks[index + direction];
    if (!target) return;
    void reorderSelectedTracks(
      filename,
      target.filename,
      direction === -1 ? "before" : "after",
    );
  }

  const panelClass =
    "rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40";

  return (
    <main className="flex flex-1 flex-col gap-6">
      <section className={`${panelClass} w-full`}>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Setlists
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Create setlists from the MP3s in your music folder.
        </p>
      </section>

      <div className="grid w-full gap-6 lg:grid-cols-[18rem_1fr]">
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

              <form
                className="relative flex flex-col gap-3 sm:flex-row sm:items-start"
                onSubmit={(event) => {
                  event.preventDefault();
                  void addSelectedSong();
                }}
              >
                <div className="min-w-0 flex-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  <label className="block">
                    Add song
                    <input
                      type="search"
                      role="combobox"
                      aria-autocomplete="list"
                      value={songSearch}
                      aria-expanded={isSongPickerOpen}
                      aria-controls="setlist-song-picker-results"
                      onChange={(event) => {
                        setSongSearch(event.target.value);
                        setSongToAdd("");
                        setIsSongPickerOpen(true);
                      }}
                      onFocus={() => setIsSongPickerOpen(true)}
                      disabled={busy || availableSongs.length === 0}
                      placeholder={
                        availableSongs.length === 0
                          ? "No songs available"
                          : "Search by song, artist, or album"
                      }
                      className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                    />
                  </label>
                  {songToAdd ? (
                    <p className="mt-1 truncate text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      Selected: {songToAdd}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      Type to search, then press Add to add the top match.
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={
                    busy ||
                    availableSongs.length === 0 ||
                    (songToAdd === "" && songSearch.trim() === "") ||
                    (songToAdd === "" && visibleSongMatches.length === 0)
                  }
                  className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 sm:mt-6 dark:bg-zinc-50 dark:text-zinc-950"
                >
                  Add
                </button>
                {isSongPickerOpen ? (
                  <div
                    id="setlist-song-picker-results"
                    className="absolute left-0 right-0 top-full z-30 mt-2 rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950 sm:right-20"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        {availableSongs.length === 0
                          ? "No songs available"
                          : `${matchingSongs.length} match${
                              matchingSongs.length === 1 ? "" : "es"
                            }`}
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsSongPickerOpen(false)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                      >
                        Close
                      </button>
                    </div>
                    {availableSongs.length === 0 ? (
                      <p className="p-3 text-sm font-normal text-zinc-500">
                        Every available song is already in this setlist.
                      </p>
                    ) : visibleSongMatches.length === 0 ? (
                      <p className="p-3 text-sm font-normal text-zinc-500">
                        No songs match that search.
                      </p>
                    ) : (
                      <>
                        <ul className="max-h-72 overflow-y-auto">
                          {visibleSongMatches.map((song) => {
                            const isChosen = songToAdd === song.filename;
                            return (
                              <li key={song.filename}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSongToAdd(song.filename);
                                    setSongSearch(song.filename);
                                    setIsSongPickerOpen(false);
                                  }}
                                  disabled={busy}
                                  className={`w-full px-3 py-2 text-left transition-colors ${
                                    isChosen
                                      ? "bg-zinc-200 dark:bg-zinc-800"
                                      : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
                                  }`}
                                >
                                  <span className="block break-all text-sm font-medium text-zinc-950 dark:text-zinc-50">
                                    {song.filename}
                                  </span>
                                  {song.artist || song.album ? (
                                    <span className="mt-0.5 block truncate text-xs font-normal text-zinc-500 dark:text-zinc-400">
                                      {[song.artist, song.album]
                                        .filter(Boolean)
                                        .join(" - ")}
                                    </span>
                                  ) : null}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                        {matchingSongs.length > visibleSongMatches.length ? (
                          <p className="border-t border-zinc-200 px-3 py-2 text-xs font-normal text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                            Showing first {visibleSongMatches.length} of{" "}
                            {matchingSongs.length} matches. Keep typing to narrow
                            the list.
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
              </form>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
                <div>
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                        Songs
                      </h2>
                      {selected.tracks.length > 1 ? (
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          Drag a handle to a highlighted drop line, or use the
                          arrows to move a song one spot.
                        </p>
                      ) : null}
                    </div>
                  </div>
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
                        const isPlayingCurrent = isCurrent && isPlayerPlaying;
                        const dropPlacement =
                          dropTarget?.filename === track.filename
                            ? dropTarget.placement
                            : null;

                        return (
                          <li
                            key={track.id}
                            onDragOver={(event) => {
                              if (
                                !draggedTrackFilename ||
                                draggedTrackFilename === track.filename
                              ) {
                                return;
                              }
                              event.preventDefault();
                              const rect =
                                event.currentTarget.getBoundingClientRect();
                              const placement =
                                event.clientY < rect.top + rect.height / 2
                                  ? "before"
                                  : "after";
                              setDropTarget({
                                filename: track.filename,
                                placement,
                              });
                            }}
                            onDragLeave={(event) => {
                              if (
                                event.currentTarget.contains(
                                  event.relatedTarget as Node | null,
                                )
                              ) {
                                return;
                              }
                              setDropTarget((prev) =>
                                prev?.filename === track.filename ? null : prev,
                              );
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              const dragged =
                                event.dataTransfer.getData("text/plain") ||
                                draggedTrackFilename;
                              setDraggedTrackFilename(null);
                              const placement = dropPlacement ?? "after";
                              setDropTarget(null);
                              if (!dragged) return;
                              void reorderSelectedTracks(
                                dragged,
                                track.filename,
                                placement,
                              );
                            }}
                            className={`relative flex items-center gap-2 rounded-md border text-sm transition-colors ${
                              draggedTrackFilename === track.filename
                                ? "border-zinc-300 bg-zinc-100 opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
                                : dropPlacement
                                  ? "border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30"
                                : isCurrent
                                ? "border-emerald-300 bg-emerald-50 ring-2 ring-emerald-200 dark:border-emerald-800 dark:bg-emerald-950/30 dark:ring-emerald-900"
                                : isSelectedSong
                                  ? "border-sky-300 bg-sky-50 ring-2 ring-sky-200 dark:border-sky-800 dark:bg-sky-950/30 dark:ring-sky-900"
                                  : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                            }`}
                          >
                            {dropPlacement ? (
                              <span
                                aria-hidden="true"
                                className={`absolute left-3 right-3 h-0.5 rounded-full bg-sky-500 ${
                                  dropPlacement === "before"
                                    ? "-top-1"
                                    : "-bottom-1"
                                }`}
                              />
                            ) : null}
                            <div className="ml-3 flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                disabled={busy || index === 0}
                                onClick={() => moveTrackByOne(track.filename, -1)}
                                aria-label={`Move ${track.filename} up`}
                                title="Move up"
                                className="rounded-md px-1.5 py-1 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={
                                  busy || index === selected.tracks.length - 1
                                }
                                onClick={() => moveTrackByOne(track.filename, 1)}
                                aria-label={`Move ${track.filename} down`}
                                title="Move down"
                                className="rounded-md px-1.5 py-1 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                draggable={!busy}
                                onDragStart={(event) => {
                                  setDraggedTrackFilename(track.filename);
                                  event.dataTransfer.effectAllowed = "move";
                                  event.dataTransfer.setData(
                                    "text/plain",
                                    track.filename,
                                  );
                                }}
                                onDragEnd={() => {
                                  setDraggedTrackFilename(null);
                                  setDropTarget(null);
                                }}
                                disabled={busy}
                                aria-label={`Drag ${track.filename} to reorder`}
                                title="Drag to reorder"
                                className="cursor-grab rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                              >
                                <span className="sr-only">Drag to reorder</span>
                                <span aria-hidden="true">☰</span>
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => selectSong(track.filename)}
                              className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
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
                                    Selected. Edit key and notes in the side
                                    panel.
                                  </span>
                                ) : queueCount > 0 ? (
                                  <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-300">
                                    In queue {queueCount} time
                                    {queueCount === 1 ? "" : "s"}
                                  </span>
                                ) : track.notes ? (
                                  <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                                    Has setlist notes
                                  </span>
                                ) : null}
                              </span>
                              {isCurrent ? (
                                <span className="shrink-0 rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-semibold text-white dark:bg-emerald-500 dark:text-emerald-950">
                                  {isPlayerPlaying ? "Now playing" : "In player"}
                                </span>
                              ) : queueCount > 0 ? (
                                <span className="shrink-0 rounded-full bg-amber-600 px-2 py-0.5 text-xs font-semibold text-white dark:bg-amber-400 dark:text-amber-950">
                                  Queued
                                </span>
                              ) : null}
                            </button>
                            {isSelectedSong ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => addToQueue(track.filename)}
                                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-50 dark:border-sky-800 dark:bg-zinc-950 dark:text-sky-300 dark:hover:bg-sky-950/40"
                                >
                                  <PlusIcon className="size-3.5" />
                                  Add to queue
                                </button>
                                <button
                                  type="button"
                                  onClick={() => togglePlayback(track.filename)}
                                  aria-label={
                                    isPlayingCurrent ? "Pause" : "Play now"
                                  }
                                  title={isPlayingCurrent ? "Pause" : "Play now"}
                                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                                >
                                  {isPlayingCurrent ? (
                                    <PauseIcon className="size-4" />
                                  ) : (
                                    <PlayIcon className="size-4" />
                                  )}
                                </button>
                              </>
                            ) : null}
                            {isCurrent && !isPlayerVisible ? (
                              <button
                                type="button"
                                onClick={() => showPlayer()}
                                className="shrink-0 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-zinc-950 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                              >
                                Show player
                              </button>
                            ) : null}
                            {track.songKey ? (
                              <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-950/60 dark:text-violet-200">
                                Key {track.songKey}
                              </span>
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

                <aside className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Song details
                  </p>
                  {selectedTrack ? (
                    <form
                      className="mt-3 space-y-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveSelectedSongDetails();
                      }}
                    >
                      <div>
                        <p className="break-all text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                          {selectedTrack.filename}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {songIdByFilename.get(selectedTrack.filename) ? (
                            <Link
                              href={`/song/${encodeURIComponent(
                                String(songIdByFilename.get(selectedTrack.filename)),
                              )}`}
                              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                            >
                              Open song page
                            </Link>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          These notes only apply to this song in this setlist.
                        </p>
                      </div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Key
                        <input
                          type="text"
                          value={songKeyDraft}
                          onChange={(event) =>
                            setSongKeyDraft(event.target.value)
                          }
                          disabled={busy}
                          maxLength={32}
                          placeholder="Example: C, F#m, Bb"
                          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                        />
                      </label>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Notes
                        <textarea
                          value={notesDraft}
                          onChange={(event) => setNotesDraft(event.target.value)}
                          disabled={busy}
                          maxLength={5000}
                          rows={12}
                          placeholder="Add cues, key changes, transitions, or other notes for this setlist."
                          className="mt-1 block min-h-64 w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                        />
                      </label>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-zinc-500">
                          {notesDraft.length}/5000
                        </span>
                        <button
                          type="submit"
                          disabled={
                            busy ||
                            songKeyDraft.trim().length > 32 ||
                            notesDraft.length > 5000
                          }
                          className="rounded-md bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
                        >
                          Save details
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                      Select a song to view and edit its setlist-specific key
                      and notes.
                    </p>
                  )}
                </aside>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
