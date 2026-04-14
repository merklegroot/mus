import { Mp3List } from "@/components/Mp3List";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-10 lg:items-stretch lg:px-8">
      <Mp3List />
    </main>
  );
}
