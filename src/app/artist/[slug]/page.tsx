import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  discogsArtistReleases,
  discogsArtists,
  discogsReleaseTracklists,
} from "@/db/schema";
import { DiscogsFetchControl } from "@/components/DiscogsFetchControl";
import { DiscogsReleasesFetchControl } from "@/components/DiscogsReleasesFetchControl";
import { DiscogsTracklistFetchControl } from "@/components/DiscogsTracklistFetchControl";
import {
  parseDiscogsArtistJson,
  primaryDiscogsImage,
} from "@/lib/discogsArtistPayload";
import {
  discogsWebUrlForListItem,
  parseStoredReleasesJson,
} from "@/lib/discogsReleasesPayload";
import { parseStoredTracklistJson } from "@/lib/discogsTracklistPayload";

export const dynamic = "force-dynamic";

function tryDecodeSlug(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

function decodeArtistSlug(slug: string): string {
  try {
    const decoded = decodeURIComponent(slug).trim();
    if (!decoded) notFound();
    return decoded;
  } catch {
    notFound();
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = tryDecodeSlug(slug).trim() || "Artist";
  return {
    title: `${name} · Artist`,
    description: `Discogs metadata for ${name}`,
  };
}

function formatTs(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString();
}

export default async function ArtistDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const libraryArtistName = decodeArtistSlug(slug).trim();
  if (!libraryArtistName) notFound();

  const db = getDb();
  const row = db
    .select()
    .from(discogsArtists)
    .where(eq(discogsArtists.libraryArtistName, libraryArtistName))
    .get();
  const releasesRow = row
    ? db
        .select()
        .from(discogsArtistReleases)
        .where(eq(discogsArtistReleases.libraryArtistName, libraryArtistName))
        .get()
    : undefined;

  const panel =
    "w-full max-w-[120rem] rounded-lg border border-zinc-200 bg-zinc-50/80 p-6 text-left dark:border-zinc-800 dark:bg-zinc-900/40";

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-2 py-10 sm:px-4 lg:px-4">
      <div className={`${panel} mx-auto flex flex-col gap-6`}>
        <nav className="text-sm">
          <Link
            href="/"
            className="font-medium text-zinc-800 underline-offset-4 hover:underline dark:text-zinc-200"
          >
            ← Home
          </Link>
        </nav>

        <header className="border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            In your library
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {libraryArtistName}
          </h1>
        </header>

        {!row ? (
          <div className="space-y-4 text-sm text-zinc-700 dark:text-zinc-300">
            <p>
              No Discogs profile is stored for this name yet. Load it from
              Discogs to show biography, images, members, and links. After
              that, you can load this artist&apos;s releases from the same page.
            </p>
            <DiscogsFetchControl
              artist={libraryArtistName}
              label="Load from Discogs"
            />
            <p>
              <Link
                href="/"
                className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
              >
                Go to home
              </Link>
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
              <DiscogsFetchControl
                artist={libraryArtistName}
                label="Refresh from Discogs"
                secondary
              />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Re-fetches the artist from Discogs and updates this page.
              </span>
            </div>
            <DiscogsArtistBody
              libraryArtistName={libraryArtistName}
              dataJson={row.dataJson}
              discogsId={row.discogsId}
              fetchedAt={row.fetchedAt}
              releasesRow={releasesRow ?? null}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function DiscogsArtistBody({
  libraryArtistName,
  dataJson,
  discogsId,
  fetchedAt,
  releasesRow,
}: {
  libraryArtistName: string;
  dataJson: string;
  discogsId: number;
  fetchedAt: number;
  releasesRow: (typeof discogsArtistReleases.$inferSelect) | null;
}) {
  const payload = parseDiscogsArtistJson(dataJson);
  const discogsName = payload?.name?.trim() || "—";
  const profile = payload?.profile?.trim();
  const urls = payload?.urls ?? [];
  const members = payload?.members ?? [];
  const aliases = payload?.aliases ?? [];
  const namevariations = payload?.namevariations ?? [];
  const discogsUri = payload?.uri?.trim();
  const primary = primaryDiscogsImage(payload?.images);
  const heroSrc =
    primary?.uri150 ?? primary?.uri ?? primary?.resource_url ?? null;

  return (
    <div className="flex flex-col gap-8">
      <details className="rounded-md border border-zinc-200 dark:border-zinc-800">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Discogs artist info
          <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
            {discogsName !== "—" ? discogsName : ""} · cached {formatTs(fetchedAt)}
          </span>
        </summary>
        <div className="space-y-6 border-t border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Cached from Discogs · artist id {discogsId} · fetched{" "}
            {formatTs(fetchedAt)}
          </p>

          {discogsUri ? (
            <p>
              <a
                href={discogsUri}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
              >
                Open on Discogs.com
              </a>
            </p>
          ) : null}

          <section className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {heroSrc ? (
              <div className="h-40 w-40 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
                {/* eslint-disable-next-line @next/next/no-img-element -- Discogs CDN URLs; avoid remotePatterns on Image */}
                <img
                  src={heroSrc}
                  alt={discogsName}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Discogs
              </p>
              <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
                {discogsName}
              </h2>
              {discogsName !== libraryArtistName ? (
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Library name: {libraryArtistName}
                </p>
              ) : null}
            </div>
          </section>

          {profile ? (
            <section>
              <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Profile
              </h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {profile}
              </p>
            </section>
          ) : null}

          {urls.length > 0 ? (
            <section>
              <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Links
              </h3>
              <ul className="list-inside list-disc space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                {urls.map((u) => (
                  <li key={u} className="break-all">
                    <a
                      href={u}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
                    >
                      {u}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {members.length > 0 ? (
            <section>
              <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Members
              </h3>
              <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {members.map((m, i) => (
                  <li
                    key={m.id != null ? String(m.id) : `member-${i}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {m.name ?? "—"}
                    </span>
                    {typeof m.active === "boolean" ? (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {m.active ? "Active" : "Past"}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {aliases.length > 0 ? (
            <section>
              <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Aliases
              </h3>
              <ul className="flex flex-wrap gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                {aliases.map((a) => (
                  <li
                    key={a.id ?? a.name}
                    className="rounded-md border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    {a.name ?? "—"}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {namevariations.length > 0 ? (
            <section>
              <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Name variations
              </h3>
              <ul className="flex flex-wrap gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                {namevariations.map((n) => (
                  <li
                    key={n}
                    className="rounded-md border border-zinc-200 px-2 py-1 dark:border-zinc-700"
                  >
                    {n}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </details>

      <DiscogsReleasesSection
        libraryArtistName={libraryArtistName}
        releasesRow={releasesRow}
      />

      <details className="rounded-md border border-zinc-200 dark:border-zinc-800">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Raw JSON
        </summary>
        <pre className="max-h-[min(50vh,24rem)] overflow-auto border-t border-zinc-200 p-3 text-xs leading-relaxed whitespace-pre-wrap text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
          {dataJson}
        </pre>
      </details>
    </div>
  );
}

function DiscogsReleasesSection({
  libraryArtistName,
  releasesRow,
}: {
  libraryArtistName: string;
  releasesRow: (typeof discogsArtistReleases.$inferSelect) | null;
}) {
  const parsed = releasesRow ? parseStoredReleasesJson(releasesRow.dataJson) : null;
  const list = parsed?.releases ?? [];
  const excludedFormats = new Set(["tour", "single", "promo"]);
  const hasExcludedFormat = (format: string | null): boolean => {
    if (!format) return false;
    const tokens = format
      .split(/[,/;+|]/g)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    return tokens.some((t) => excludedFormats.has(t));
  };
  const filtered = list.filter((item) => {
    const typeOk = item.type.trim().toLowerCase() === "release";
    const roleOk = (item.role ?? "").trim().toLowerCase() === "main";
    const formatOk = !hasExcludedFormat(item.format);
    return typeOk && roleOk && formatOk;
  });

  const db = getDb();
  const keys = filtered.map((item) => {
    const type = item.type.toLowerCase() === "master" ? "master" : "release";
    return `${type}:${item.id}`;
  });
  const cachedRows =
    keys.length === 0
      ? []
      : db
          .select({
            key: discogsReleaseTracklists.key,
            dataJson: discogsReleaseTracklists.dataJson,
            fetchedAt: discogsReleaseTracklists.fetchedAt,
          })
          .from(discogsReleaseTracklists)
          .where(inArray(discogsReleaseTracklists.key, keys))
          .all();
  const cachedByKey = new Map(
    cachedRows.map((r) => [r.key, { dataJson: r.dataJson, fetchedAt: r.fetchedAt }]),
  );

  return (
    <section className="border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Releases (Discogs)
          </h3>
          {releasesRow ? (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {filtered.length} shown · {list.length} loaded
              {parsed && parsed.items > list.length
                ? ` · Discogs reports ${parsed.items} total`
                : parsed && parsed.items > 0
                  ? ` · ${parsed.items} reported`
                  : ""}
              {" · "}
              fetched {formatTs(releasesRow.fetchedAt)}
            </p>
          ) : (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Fetch the discography from Discogs and store it in SQLite.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!releasesRow ? (
            <DiscogsReleasesFetchControl
              artist={libraryArtistName}
              label="Load releases from Discogs"
            />
          ) : (
            <DiscogsReleasesFetchControl
              artist={libraryArtistName}
              label="Refresh releases"
              secondary
            />
          )}
        </div>
      </div>

      {releasesRow && list.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No release rows were returned (unexpected empty list).
        </p>
      ) : null}

      {list.length > 0 && filtered.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No items match the default filter (type = release, role = main).
        </p>
      ) : null}

      {filtered.length > 0 ? (
        <div className="max-h-[min(50vh,28rem)] overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[56rem] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                {["Year", "Title", "Type", "Format", "Label", "Role", "Tracks"].map((c) => (
                  <th
                    key={c}
                    className="whitespace-nowrap px-2 py-2 font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, index) => (
                <tr
                  key={`${item.type}-${item.id}-${index}`}
                  className="border-b border-zinc-100 odd:bg-white even:bg-zinc-50/80 dark:border-zinc-800/80 dark:odd:bg-zinc-950 dark:even:bg-zinc-900/50"
                >
                  <td className="whitespace-nowrap px-2 py-1.5 text-zinc-700 dark:text-zinc-300">
                    {item.year ?? "—"}
                  </td>
                  <td className="max-w-[18rem] px-2 py-1.5">
                    <a
                      href={discogsWebUrlForListItem(item)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
                    >
                      {item.title}
                    </a>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-zinc-600 dark:text-zinc-400">
                    {item.type}
                  </td>
                  <td className="max-w-[12rem] break-words px-2 py-1.5 text-zinc-700 dark:text-zinc-300">
                    {item.format ?? "—"}
                  </td>
                  <td className="max-w-[10rem] break-words px-2 py-1.5 text-zinc-700 dark:text-zinc-300">
                    {item.label ?? "—"}
                  </td>
                  <td className="max-w-[8rem] break-words px-2 py-1.5 text-zinc-600 dark:text-zinc-400">
                    {item.role ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <DiscogsTracklistCell
                      id={item.id}
                      type={item.type.toLowerCase() === "master" ? "master" : "release"}
                      cached={cachedByKey.get(
                        `${item.type.toLowerCase() === "master" ? "master" : "release"}:${item.id}`,
                      )}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function DiscogsTracklistCell({
  id,
  type,
  cached,
}: {
  id: number;
  type: "release" | "master";
  cached?: { dataJson: string; fetchedAt: number };
}) {
  const parsed = cached ? parseStoredTracklistJson(cached.dataJson) : null;
  const count = parsed?.tracklist?.length ?? 0;
  return (
    <div className="flex flex-col items-start gap-1">
      <DiscogsTracklistFetchControl id={id} type={type} secondary={!!cached} />
      {cached ? (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {count > 0 ? `${count} tracks` : "Cached"} ·{" "}
          {new Date(cached.fetchedAt).toLocaleDateString()}
        </p>
      ) : null}
    </div>
  );
}
