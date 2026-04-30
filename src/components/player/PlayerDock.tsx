"use client";

import { usePlayer } from "@/components/player/PlayerContext";

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

function CollapseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="m5 7.5 5 5 5-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </svg>
  );
}

function ExpandIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="m5 12.5 5-5 5 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </svg>
  );
}

export function PlayerDock() {
  const {
    playingFilename,
    queueFilenames,
    isPlayerVisible,
    isPlayerPlaying,
    audioRef,
    shouldAutoPlay,
    setShouldAutoPlay,
    setIsPlayerPlaying,
    handleTrackEnded,
    closePlayer,
    showPlayer,
    playQueuedNow,
  } = usePlayer();

  const showExpandedPlayerDock = Boolean(playingFilename && isPlayerVisible);
  const showCollapsedPlayerDock =
    !showExpandedPlayerDock && (playingFilename !== null || queueFilenames.length > 0);

  if (!showExpandedPlayerDock && !showCollapsedPlayerDock) return null;

  if (showExpandedPlayerDock) {
    return (
      <aside
        className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
        aria-label="Music player"
      >
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
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
                      aria-label="Play now"
                      title="Play now"
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                    >
                      <PlayIcon className="size-3.5" />
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
            ref={audioRef}
            // key changes should only happen when we explicitly "load" a new track,
            // which is exactly what playingFilename represents.
            key={playingFilename}
            controls
            autoPlay={shouldAutoPlay}
            preload="metadata"
            onPlay={() => {
              setIsPlayerPlaying(true);
              setShouldAutoPlay(false);
            }}
            onEnded={handleTrackEnded}
            onPause={() => setIsPlayerPlaying(false)}
            className="h-10 w-full min-w-0 flex-1 accent-zinc-900 dark:accent-zinc-100"
            src={`/api/mp3s/${encodeURIComponent(playingFilename!)}/stream`}
          >
            Your browser does not support the audio element.
          </audio>
          <button
            type="button"
            onClick={closePlayer}
            className="inline-flex size-10 shrink-0 self-end items-center justify-center rounded-md bg-zinc-950 text-white hover:bg-zinc-800 sm:self-auto dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            aria-label="Collapse player"
            title="Collapse player"
          >
            <CollapseIcon className="size-5" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
      aria-label="Hidden music player"
    >
      <div className="flex w-full items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Player hidden
          </p>
          <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            {playingFilename ?? `${queueFilenames.length} queued`}
          </p>
        </div>
        <button
          type="button"
          onClick={showPlayer}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          aria-label="Expand player"
          title={
            playingFilename ? "Expand player" : "Expand player (plays first in queue)"
          }
        >
          <ExpandIcon className="size-5" />
        </button>
      </div>
    </aside>
  );
}
