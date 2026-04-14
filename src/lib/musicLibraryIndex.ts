import { createHash } from "node:crypto";
import { realpath, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { asc, count, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { libraryState, tracks, type NewTrack } from "@/db/schema";

export type Mp3DiskEntry = {
  name: string;
  sizeBytes: number;
  mtimeMs: number;
};

const STAT_CONCURRENCY = 64;

function isSafeBasename(name: string): boolean {
  return (
    name.length > 0 &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !name.includes("\0") &&
    name.toLowerCase().endsWith(".mp3")
  );
}

export async function scanMp3Files(
  musicFolderRealpath: string,
): Promise<Mp3DiskEntry[]> {
  const names = (await readdir(musicFolderRealpath))
    .filter(isSafeBasename)
    .sort((a, b) => a.localeCompare(b));

  const out: Mp3DiskEntry[] = [];
  for (let i = 0; i < names.length; i += STAT_CONCURRENCY) {
    const chunk = names.slice(i, i + STAT_CONCURRENCY);
    const rows = await Promise.all(
      chunk.map(async (name) => {
        const full = path.join(musicFolderRealpath, name);
        try {
          const st = await stat(full);
          if (!st.isFile()) return null;
          return {
            name,
            sizeBytes: st.size,
            mtimeMs: Math.trunc(st.mtimeMs),
          };
        } catch {
          return null;
        }
      }),
    );
    for (const r of rows) {
      if (r) out.push(r);
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Count of regular .mp3 files on disk (same rules as {@link scanMp3Files}). */
export async function countMp3FilesOnDisk(
  musicFolderRealpath: string,
): Promise<number> {
  const names = (await readdir(musicFolderRealpath))
    .filter(isSafeBasename)
    .sort((a, b) => a.localeCompare(b));

  let n = 0;
  for (let i = 0; i < names.length; i += STAT_CONCURRENCY) {
    const chunk = names.slice(i, i + STAT_CONCURRENCY);
    const rows = await Promise.all(
      chunk.map(async (name) => {
        const full = path.join(musicFolderRealpath, name);
        try {
          const st = await stat(full);
          return st.isFile() ? 1 : 0;
        } catch {
          return 0;
        }
      }),
    );
    for (const r of rows) n += r;
  }
  return n;
}

export function fingerprintEntries(entries: Mp3DiskEntry[]): string {
  const lines = entries.map(
    (e) => `${e.name}\t${e.mtimeMs}\t${e.sizeBytes}`,
  );
  return createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
}

function listCacheTtlMs(): number {
  const raw = process.env.LIBRARY_LIST_CACHE_TTL_MS;
  if (raw === undefined || raw === "") return 30_000;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 30_000;
}

export async function resolveMusicFolderRealpath(
  musicFolder: string,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  try {
    const pathResolved = await realpath(musicFolder);
    return { ok: true, path: pathResolved };
  } catch {
    return { ok: false, error: "Music folder not found" };
  }
}

export function getLibraryStateRow() {
  try {
    const db = getDb();
    return db.select().from(libraryState).where(eq(libraryState.id, 1)).get();
  } catch {
    return undefined;
  }
}

export function listFilenamesFromDb(): string[] {
  const db = getDb();
  return db
    .select({ filename: tracks.filename })
    .from(tracks)
    .orderBy(asc(tracks.filename))
    .all()
    .map((r) => r.filename);
}

/**
 * If TTL has not expired and the indexed folder matches, return filenames from DB only (no full scan).
 * Also verifies the current on-disk .mp3 file count matches the index; otherwise returns null so a new
 * file (or removal) on disk is picked up immediately instead of serving a stale DB-only list.
 */
function trackRowCount(): number {
  const db = getDb();
  const row = db.select({ n: count() }).from(tracks).get();
  return row?.n ?? 0;
}

export async function tryListFromDbCache(
  musicFolderRealpath: string,
): Promise<string[] | null> {
  const ttl = listCacheTtlMs();
  if (ttl === 0) return null;

  const state = getLibraryStateRow();
  if (!state) return null;
  if (state.musicFolderRealpath !== musicFolderRealpath) return null;
  if (Date.now() - state.indexedAt > ttl) return null;
  if (trackRowCount() !== state.fileCount) return null;

  const diskCount = await countMp3FilesOnDisk(musicFolderRealpath);
  if (diskCount !== state.fileCount || diskCount !== trackRowCount()) {
    return null;
  }

  return listFilenamesFromDb();
}

/** Basenames of .mp3 files in the configured library folder (same rules as GET /api/mp3s). */
export async function listMusicLibraryMp3Names(): Promise<
  | { ok: true; names: string[] }
  | { ok: false; error: string }
> {
  const musicFolder = process.env.MUSIC_FOLDER;
  if (!musicFolder || musicFolder.trim() === "") {
    return { ok: false, error: "MUSIC_FOLDER is not configured" };
  }

  const resolved = await resolveMusicFolderRealpath(musicFolder);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  const folderReal = resolved.path;

  const fromTtl = await tryListFromDbCache(folderReal);
  if (fromTtl !== null) {
    return { ok: true, names: fromTtl };
  }

  const entries = await scanMp3Files(folderReal);
  const fingerprint = fingerprintEntries(entries);
  const state = getLibraryStateRow();

  if (
    state &&
    libraryIndexMatchesScan(state, folderReal, fingerprint, entries.length)
  ) {
    touchLibraryIndexStamp();
    return { ok: true, names: entries.map((e) => e.name) };
  }

  reconcileLibraryIndex(folderReal, entries, fingerprint);
  return { ok: true, names: entries.map((e) => e.name) };
}

export function libraryIndexMatchesScan(
  state: NonNullable<ReturnType<typeof getLibraryStateRow>>,
  folderReal: string,
  fingerprint: string,
  entryCount: number,
): boolean {
  return (
    state.musicFolderRealpath === folderReal &&
    state.contentFingerprint === fingerprint &&
    state.fileCount === entryCount &&
    state.fileCount === trackRowCount()
  );
}

export function touchLibraryIndexStamp(): void {
  try {
    const db = getDb();
    db.update(libraryState)
      .set({ indexedAt: Date.now() })
      .where(eq(libraryState.id, 1))
      .run();
  } catch {
    /* optional */
  }
}

export function reconcileLibraryIndex(
  musicFolderRealpath: string,
  entries: Mp3DiskEntry[],
  contentFingerprint: string,
): void {
  const db = getDb();
  const now = Date.now();

  db.transaction((tx) => {
    const existing = tx.select().from(tracks).all();
    const existingByName = new Map(existing.map((r) => [r.filename, r]));
    const diskNames = new Set(entries.map((e) => e.name));

    const orphanFilenames = existing
      .filter((r) => !diskNames.has(r.filename))
      .map((r) => r.filename);

    const chunk = 400;
    for (let i = 0; i < orphanFilenames.length; i += chunk) {
      const slice = orphanFilenames.slice(i, i + chunk);
      if (slice.length === 0) continue;
      tx.delete(tracks).where(inArray(tracks.filename, slice)).run();
    }

    for (const e of entries) {
      const prev = existingByName.get(e.name);
      const unchanged =
        prev &&
        prev.sizeBytes === e.sizeBytes &&
        prev.mtimeMs === e.mtimeMs;

      if (unchanged) continue;

      const base: NewTrack = {
        filename: e.name,
        sizeBytes: e.sizeBytes,
        mtimeMs: e.mtimeMs,
        updatedAt: now,
      };

      if (!prev) {
        tx.insert(tracks)
          .values({
            ...base,
            title: null,
            artist: null,
            album: null,
            genre: null,
            year: null,
            durationSec: null,
            bitrateKbps: null,
            codec: null,
          })
          .run();
        continue;
      }

      tx.update(tracks)
        .set({
          sizeBytes: e.sizeBytes,
          mtimeMs: e.mtimeMs,
          title: null,
          artist: null,
          album: null,
          genre: null,
          year: null,
          durationSec: null,
          bitrateKbps: null,
          codec: null,
          updatedAt: now,
        })
        .where(eq(tracks.filename, e.name))
        .run();
    }

    tx.insert(libraryState)
      .values({
        id: 1,
        musicFolderRealpath,
        contentFingerprint,
        fileCount: entries.length,
        indexedAt: now,
      })
      .onConflictDoUpdate({
        target: libraryState.id,
        set: {
          musicFolderRealpath,
          contentFingerprint,
          fileCount: entries.length,
          indexedAt: now,
        },
      })
      .run();
  });
}
