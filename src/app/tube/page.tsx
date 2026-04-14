import type { Metadata } from "next";
import { YoutubeDownloadForm } from "@/components/YoutubeDownloadForm";

export const metadata: Metadata = {
  title: "Tube",
};

export default function TubePage() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-10">
      <h1 className="text-center text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Tube
      </h1>
      <YoutubeDownloadForm />
    </main>
  );
}
