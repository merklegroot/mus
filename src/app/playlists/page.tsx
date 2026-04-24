import type { Metadata } from "next";
import { PlaylistManager } from "@/components/PlaylistManager";

export const metadata: Metadata = {
  title: "Playlists",
};

export default function PlaylistsPage() {
  return <PlaylistManager />;
}
