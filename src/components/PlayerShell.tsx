"use client";

import { PlayerProvider } from "@/components/player/PlayerContext";
import { PlayerDock } from "@/components/player/PlayerDock";

export function PlayerShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PlayerProvider dock={<PlayerDock />}>{children}</PlayerProvider>
    </div>
  );
}
