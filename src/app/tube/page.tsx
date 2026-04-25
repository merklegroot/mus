import type { Metadata } from "next";
import { YoutubeDownloadForm } from "@/components/YoutubeDownloadForm";

export const metadata: Metadata = {
  title: "Tube",
};

export default function TubePage() {
  return (
    <main className="flex flex-1 flex-col">
      <YoutubeDownloadForm />
    </main>
  );
}
