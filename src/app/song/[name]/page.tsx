import type { Metadata } from "next";
import { SongDetailsPage } from "@/components/SongDetailsPage";

export const metadata: Metadata = {
  title: "Song details",
};

export default async function SongDetailsRoute({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  return <SongDetailsPage filename={name} />;
}

