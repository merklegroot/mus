"use client";

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type PlayerState = {
  playingFilename: string | null;
  queueFilenames: string[];
  isPlayerVisible: boolean;
  isPlayerPlaying: boolean;
};

export type PlayerActions = {
  playNow: (filename: string) => void;
  togglePlayback: (filename: string) => void;
  addToQueue: (filename: string) => void;
  playQueuedNow: (index: number) => void;
  removeFromQueue: (index: number) => void;
  showPlayer: () => void;
  closePlayer: () => void;
};

type PlayerContextValue = PlayerState &
  PlayerActions & {
    audioRef: React.RefObject<HTMLAudioElement | null>;
    shouldAutoPlay: boolean;
    setShouldAutoPlay: (value: boolean) => void;
    setIsPlayerPlaying: (value: boolean) => void;
    handleTrackEnded: () => void;
  };

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({
  children,
  dock,
}: {
  children: ReactNode;
  dock: ReactNode;
}) {
  const [playingFilename, setPlayingFilename] = useState<string | null>(null);
  const [queueFilenames, setQueueFilenames] = useState<string[]>([]);
  const [isPlayerVisible, setIsPlayerVisible] = useState(false);
  const [isPlayerPlaying, setIsPlayerPlaying] = useState(false);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function playNow(filename: string) {
    setPlayingFilename(filename);
    setIsPlayerVisible(true);
    setShouldAutoPlay(true);
  }

  function togglePlayback(filename: string) {
    if (playingFilename !== filename) {
      playNow(filename);
      return;
    }

    setIsPlayerVisible(true);
    if (isPlayerPlaying) {
      audioRef.current?.pause();
      return;
    }

    setShouldAutoPlay(true);
    void audioRef.current?.play();
  }

  function addToQueue(filename: string) {
    setQueueFilenames((prev) => [...prev, filename]);
    // Mirror setlist behavior: queueing without anything loaded doesn't pop open
    // the expanded player immediately.
    if (!playingFilename) {
      setIsPlayerVisible(false);
    }
  }

  function closePlayer() {
    setIsPlayerVisible(false);
    setIsPlayerPlaying(false);
    setShouldAutoPlay(false);
  }

  function showPlayer() {
    if (playingFilename) {
      setIsPlayerVisible(true);
      return;
    }
    playQueuedNow(0);
  }

  function handleTrackEnded() {
    setIsPlayerPlaying(false);
    setQueueFilenames((prev) => {
      const [nextFilename, ...remaining] = prev;
      if (!nextFilename) return prev;
      setPlayingFilename(nextFilename);
      setIsPlayerVisible(true);
      setShouldAutoPlay(true);
      return remaining;
    });
  }

  function playQueuedNow(index: number) {
    setQueueFilenames((prev) => {
      const filename = prev[index];
      if (!filename) return prev;
      const next = prev.filter((_, i) => i !== index);
      setPlayingFilename(filename);
      setIsPlayerVisible(true);
      setShouldAutoPlay(true);
      return next;
    });
  }

  function removeFromQueue(index: number) {
    setQueueFilenames((prev) => prev.filter((_, i) => i !== index));
  }

  const showExpandedPlayerDock = Boolean(playingFilename && isPlayerVisible);
  const showCollapsedPlayerDock =
    !showExpandedPlayerDock && (playingFilename !== null || queueFilenames.length > 0);

  const paddingClass = showExpandedPlayerDock
    ? "pb-36"
    : showCollapsedPlayerDock
      ? "pb-24"
      : "";

  const value = useMemo<PlayerContextValue>(
    () => ({
      playingFilename,
      queueFilenames,
      isPlayerVisible,
      isPlayerPlaying,
      playNow,
      togglePlayback,
      addToQueue,
      playQueuedNow,
      removeFromQueue,
      showPlayer,
      closePlayer,
      audioRef,
      shouldAutoPlay,
      setShouldAutoPlay,
      setIsPlayerPlaying,
      handleTrackEnded,
    }),
    [
      playingFilename,
      queueFilenames,
      isPlayerVisible,
      isPlayerPlaying,
      shouldAutoPlay,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      <div className={`flex min-h-full flex-1 flex-col ${paddingClass}`}>
        {children}
      </div>
      {dock}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}

