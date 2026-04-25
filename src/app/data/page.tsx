import type { ReactNode } from "react";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  discogsArtistReleases,
  discogsArtists,
  discogsReleaseTracklists,
  libraryState,
  setlistTracks,
  setlists,
  tracks,
} from "@/db/schema";
import { ExpandableDebugTable } from "@/components/ExpandableDebugTable";
import { ensureSetlistTables } from "@/lib/setlists";

export const dynamic = "force-dynamic";

function formatTs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString();
}

function discogsArtistNameFromJson(dataJson: string): string {
  try {
    const o = JSON.parse(dataJson) as unknown;
    if (
      typeof o === "object" &&
      o !== null &&
      "name" in o &&
      typeof (o as { name: unknown }).name === "string"
    ) {
      const n = (o as { name: string }).name.trim();
      return n || "—";
    }
  } catch {
    /* invalid cache row */
  }
  return "—";
}

function jsonPreview(dataJson: string, maxLen: number): string {
  const t = dataJson.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}

type Column<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  className?: string;
};

function renderCell(value: string | number | null | undefined): ReactNode {
  return value ?? "—";
}

function JsonCell({ value }: { value: string }) {
  return (
    <details className="group rounded-md open:pb-1">
      <summary className="cursor-pointer list-none break-all marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="mr-1 inline-block w-4 shrink-0 text-center text-zinc-500 group-open:rotate-90">
          ▸
        </span>
        <span>{jsonPreview(value, 240)}</span>
        {value.trim().length > 240 ? (
          <span className="ml-0.5 font-sans text-[10px] font-normal text-zinc-500 group-open:hidden">
            expand
          </span>
        ) : null}
      </summary>
      <pre className="mt-2 max-h-[min(50vh,24rem)] overflow-auto whitespace-pre-wrap break-all rounded border border-zinc-200 bg-white p-2 text-[11px] text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
        {value}
      </pre>
    </details>
  );
}

function DebugTable<T>({
  rows,
  columns,
  minWidth,
  collapsedRowCount = rows.length,
}: {
  rows: T[];
  columns: Column<T>[];
  minWidth: string;
  collapsedRowCount?: number;
}) {
  const visibleRows = rows.slice(0, collapsedRowCount);
  const hiddenRows = rows.slice(collapsedRowCount);

  const rowCells = (row: T) =>
    columns.map((col) => (
      <td
        key={col.key}
        className={
          col.className ??
          "whitespace-nowrap px-2 py-1.5 text-zinc-800 dark:text-zinc-200"
        }
      >
        {col.render(row)}
      </td>
    ));

  return (
    <ExpandableDebugTable
      minWidth={minWidth}
      columns={columns.map(({ key, label }) => ({ key, label }))}
      hiddenCount={hiddenRows.length}
      visibleRows={visibleRows.map((row, index) => (
        <tr
          key={index}
          className="border-b border-zinc-100 odd:bg-white even:bg-zinc-50/80 dark:border-zinc-800/80 dark:odd:bg-zinc-950 dark:even:bg-zinc-900/50"
        >
          {rowCells(row)}
        </tr>
      ))}
      hiddenRows={hiddenRows.map((row, index) => (
        <tr
          key={index}
          className="border-t border-zinc-100 odd:bg-white even:bg-zinc-50/80 dark:border-zinc-800/80 dark:odd:bg-zinc-950 dark:even:bg-zinc-900/50"
        >
          {rowCells(row)}
        </tr>
      ))}
    />
  );
}

function TableSection<T>({
  title,
  rows,
  columns,
  minWidth,
  ariaLabel,
}: {
  title: string;
  rows: T[];
  columns: Column<T>[];
  minWidth: string;
  ariaLabel: string;
}) {
  const panel =
    "w-full max-w-5xl rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 text-left dark:border-zinc-800 dark:bg-zinc-900/40";

  return (
    <section
      className={`${panel} mx-auto max-h-[min(70vh,48rem)] min-h-0`}
      aria-label={ariaLabel}
    >
      <h2 className="mb-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">
        {title} ({rows.length})
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No rows.</p>
      ) : (
        <DebugTable
          rows={rows}
          columns={columns}
          minWidth={minWidth}
          collapsedRowCount={1}
        />
      )}
    </section>
  );
}

export default async function DataPage() {
  ensureSetlistTables();

  const db = getDb();
  const libRow = db
    .select()
    .from(libraryState)
    .where(eq(libraryState.id, 1))
    .get();
  const trackRows = db.select().from(tracks).orderBy(asc(tracks.filename)).all();
  const discogsRows = db
    .select()
    .from(discogsArtists)
    .orderBy(asc(discogsArtists.libraryArtistName))
    .all();
  const discogsReleaseRows = db
    .select()
    .from(discogsArtistReleases)
    .orderBy(asc(discogsArtistReleases.libraryArtistName))
    .all();
  const discogsTracklistRows = db
    .select()
    .from(discogsReleaseTracklists)
    .orderBy(asc(discogsReleaseTracklists.key))
    .all();
  const setlistRows = db.select().from(setlists).orderBy(asc(setlists.name)).all();
  const setlistTrackRows = db
    .select()
    .from(setlistTracks)
    .orderBy(asc(setlistTracks.setlistId), asc(setlistTracks.position))
    .all();

  const panel =
    "w-full max-w-5xl rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 text-left dark:border-zinc-800 dark:bg-zinc-900/40";

  const trackColumns: Column<(typeof trackRows)[number]>[] = [
    { key: "id", label: "id", render: (r) => r.id },
    {
      key: "filename",
      label: "filename",
      render: (r) => r.filename,
      className: "max-w-[14rem] break-all px-2 py-1.5 text-zinc-900 dark:text-zinc-100",
    },
    { key: "size_bytes", label: "size_bytes", render: (r) => r.sizeBytes },
    { key: "mtime_ms", label: "mtime_ms", render: (r) => r.mtimeMs },
    { key: "title", label: "title", render: (r) => renderCell(r.title) },
    { key: "artist", label: "artist", render: (r) => renderCell(r.artist) },
    { key: "album", label: "album", render: (r) => renderCell(r.album) },
    { key: "genre", label: "genre", render: (r) => renderCell(r.genre) },
    { key: "year", label: "year", render: (r) => renderCell(r.year) },
    {
      key: "duration_sec",
      label: "duration_sec",
      render: (r) => renderCell(r.durationSec),
    },
    {
      key: "bitrate_kbps",
      label: "bitrate_kbps",
      render: (r) => renderCell(r.bitrateKbps),
    },
    { key: "codec", label: "codec", render: (r) => renderCell(r.codec) },
    {
      key: "updated_at",
      label: "updated_at",
      render: (r) => formatTs(r.updatedAt),
    },
  ];

  const discogsArtistColumns: Column<(typeof discogsRows)[number]>[] = [
    {
      key: "library_artist_name",
      label: "library_artist_name",
      render: (r) => r.libraryArtistName,
      className: "max-w-[14rem] break-words px-2 py-1.5 text-zinc-900 dark:text-zinc-100",
    },
    { key: "discogs_id", label: "discogs_id", render: (r) => r.discogsId },
    {
      key: "name_from_json",
      label: "name (from JSON)",
      render: (r) => discogsArtistNameFromJson(r.dataJson),
    },
    {
      key: "data_json",
      label: "data_json",
      render: (r) => <JsonCell value={r.dataJson} />,
      className: "max-w-[28rem] align-top px-2 py-1.5 font-mono text-[11px] text-zinc-700 dark:text-zinc-300",
    },
    {
      key: "fetched_at",
      label: "fetched_at",
      render: (r) => formatTs(r.fetchedAt),
    },
  ];

  const discogsReleaseColumns: Column<(typeof discogsReleaseRows)[number]>[] = [
    {
      key: "library_artist_name",
      label: "library_artist_name",
      render: (r) => r.libraryArtistName,
      className: "max-w-[14rem] break-words px-2 py-1.5 text-zinc-900 dark:text-zinc-100",
    },
    {
      key: "discogs_artist_id",
      label: "discogs_artist_id",
      render: (r) => r.discogsArtistId,
    },
    {
      key: "data_json",
      label: "data_json",
      render: (r) => <JsonCell value={r.dataJson} />,
      className: "max-w-[28rem] align-top px-2 py-1.5 font-mono text-[11px] text-zinc-700 dark:text-zinc-300",
    },
    {
      key: "fetched_at",
      label: "fetched_at",
      render: (r) => formatTs(r.fetchedAt),
    },
  ];

  const discogsTracklistColumns: Column<
    (typeof discogsTracklistRows)[number]
  >[] = [
    { key: "key", label: "key", render: (r) => r.key },
    { key: "discogs_id", label: "discogs_id", render: (r) => r.discogsId },
    { key: "type", label: "type", render: (r) => r.type },
    {
      key: "data_json",
      label: "data_json",
      render: (r) => <JsonCell value={r.dataJson} />,
      className: "max-w-[28rem] align-top px-2 py-1.5 font-mono text-[11px] text-zinc-700 dark:text-zinc-300",
    },
    {
      key: "fetched_at",
      label: "fetched_at",
      render: (r) => formatTs(r.fetchedAt),
    },
  ];

  const setlistColumns: Column<(typeof setlistRows)[number]>[] = [
    { key: "id", label: "id", render: (r) => r.id },
    { key: "name", label: "name", render: (r) => r.name },
    {
      key: "created_at",
      label: "created_at",
      render: (r) => formatTs(r.createdAt),
    },
    {
      key: "updated_at",
      label: "updated_at",
      render: (r) => formatTs(r.updatedAt),
    },
  ];

  const setlistTrackColumns: Column<(typeof setlistTrackRows)[number]>[] = [
    { key: "id", label: "id", render: (r) => r.id },
    { key: "setlist_id", label: "setlist_id", render: (r) => r.setlistId },
    {
      key: "filename",
      label: "filename",
      render: (r) => r.filename,
      className: "max-w-[14rem] break-all px-2 py-1.5 text-zinc-900 dark:text-zinc-100",
    },
    { key: "position", label: "position", render: (r) => r.position },
    {
      key: "added_at",
      label: "added_at",
      render: (r) => formatTs(r.addedAt),
    },
  ];

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-10 lg:items-stretch lg:px-8">
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

      <TableSection
        title="tracks"
        rows={trackRows}
        columns={trackColumns}
        minWidth="min-w-[64rem]"
        ariaLabel="Cached track rows"
      />
      <TableSection
        title="discogs_artists"
        rows={discogsRows}
        columns={discogsArtistColumns}
        minWidth="min-w-[48rem]"
        ariaLabel="Cached Discogs artist payloads"
      />
      <TableSection
        title="discogs_artist_releases"
        rows={discogsReleaseRows}
        columns={discogsReleaseColumns}
        minWidth="min-w-[56rem]"
        ariaLabel="Cached Discogs artist release payloads"
      />
      <TableSection
        title="discogs_release_tracklists"
        rows={discogsTracklistRows}
        columns={discogsTracklistColumns}
        minWidth="min-w-[56rem]"
        ariaLabel="Cached Discogs release tracklist payloads"
      />
      <TableSection
        title="setlists"
        rows={setlistRows}
        columns={setlistColumns}
        minWidth="min-w-[36rem]"
        ariaLabel="Setlist rows"
      />
      <TableSection
        title="setlist_tracks"
        rows={setlistTrackRows}
        columns={setlistTrackColumns}
        minWidth="min-w-[48rem]"
        ariaLabel="Setlist track rows"
      />
    </main>
  );
}
