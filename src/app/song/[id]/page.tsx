import type { Metadata } from "next";
import { SongDetailsPage } from "@/components/SongDetailsPage";

export const metadata: Metadata = {
  title: "Song details",
};

export default async function SongDetailsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SongDetailsPage songId={id} />;
}

