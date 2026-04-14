import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { libraryState, tracks } from "@/db/schema";

export const dynamic = "force-dynamic";

function formatTs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString();
}

export default async function DataPage() {
  const db = getDb();
  const libRow = db
    .select()
    .from(libraryState)
    .where(eq(libraryState.id, 1))
    .get();
  const trackRows = db.select().from(tracks).orderBy(asc(tracks.filename)).all();

  const panel =
    "w-full max-w-5xl rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 text-left dark:border-zinc-800 dark:bg-zinc-900/40";

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-10 lg:items-stretch lg:px-8">
      <h1 className="text-center text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Data
      </h1>

      <section className={`${panel} mx-auto`} aria-label="Library index state">
        <h2 className="mb-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">
          library_state
        </h2>
        {!libRow ? (
          <p className="text-sm text-zinc-500">No row (id = 1).</p>
        ) : (
          <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
            <dt className="text-zinc-500 dark:text-zinc-400">music_folder_realpath</dt>
            <dd className="min-w-0 break-all font-mono text-zinc-900 dark:text-zinc-100">
              {libRow.musicFolderRealpath}
            </dd>
            <dt className="text-zinc-500 dark:text-zinc-400">content_fingerprint</dt>
            <dd className="min-w-0 break-all font-mono text-xs text-zinc-900 dark:text-zinc-100">
              {libRow.contentFingerprint}
            </dd>
            <dt className="text-zinc-500 dark:text-zinc-400">file_count</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">{libRow.fileCount}</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">indexed_at</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">
              {formatTs(libRow.indexedAt)} ({libRow.indexedAt})
            </dd>
          </dl>
        )}
      </section>

      <section
        className={`${panel} mx-auto max-h-[min(70vh,48rem)] min-h-0`}
        aria-label="Cached track rows"
      >
        <h2 className="mb-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">
          tracks ({trackRows.length})
        </h2>
        {trackRows.length === 0 ? (
          <p className="text-sm text-zinc-500">No rows.</p>
        ) : (
          <div className="max-h-[min(60vh,40rem)] overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[64rem] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                <tr>
                  {[
                    "id",
                    "filename",
                    "size_bytes",
                    "mtime_ms",
                    "title",
                    "artist",
                    "album",
                    "genre",
                    "year",
                    "duration_sec",
                    "bitrate_kbps",
                    "codec",
                    "updated_at",
                  ].map((col) => (
                    <th
                      key={col}
                      className="whitespace-nowrap px-2 py-2 font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trackRows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-zinc-100 odd:bg-white even:bg-zinc-50/80 dark:border-zinc-800/80 dark:odd:bg-zinc-950 dark:even:bg-zinc-900/50"
                  >
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-zinc-600 dark:text-zinc-400">
                      {r.id}
                    </td>
                    <td className="max-w-[14rem] break-all px-2 py-1.5 text-zinc-900 dark:text-zinc-100">
                      {r.filename}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-zinc-700 dark:text-zinc-300">
                      {r.sizeBytes}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-zinc-700 dark:text-zinc-300">
                      {r.mtimeMs}
                    </td>
                    <td className="max-w-[10rem] break-words px-2 py-1.5 text-zinc-800 dark:text-zinc-200">
                      {r.title ?? "—"}
                    </td>
                    <td className="max-w-[10rem] break-words px-2 py-1.5 text-zinc-800 dark:text-zinc-200">
                      {r.artist ?? "—"}
                    </td>
                    <td className="max-w-[10rem] break-words px-2 py-1.5 text-zinc-800 dark:text-zinc-200">
                      {r.album ?? "—"}
                    </td>
                    <td className="max-w-[8rem] break-words px-2 py-1.5 text-zinc-800 dark:text-zinc-200">
                      {r.genre ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-zinc-800 dark:text-zinc-200">
                      {r.year ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-zinc-700 dark:text-zinc-300">
                      {r.durationSec ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-zinc-700 dark:text-zinc-300">
                      {r.bitrateKbps ?? "—"}
                    </td>
                    <td className="max-w-[8rem] break-words px-2 py-1.5 font-mono text-zinc-700 dark:text-zinc-300">
                      {r.codec ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-zinc-600 dark:text-zinc-400" title={String(r.updatedAt)}>
                      {formatTs(r.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
