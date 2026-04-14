import { ArtistList } from "@/components/ArtistList";
import { Mp3List } from "@/components/Mp3List";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-10 lg:items-stretch lg:px-8">
      <h1 className="text-center text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Home
      </h1>
      <ArtistList />
      <Mp3List />
    </main>
  );
}
