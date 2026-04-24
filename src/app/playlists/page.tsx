import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Playlists",
};

export default function PlaylistsPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Playlists
      </h1>
    </main>
  );
}
