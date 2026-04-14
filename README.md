# Music

Maintain and play a music collection.

## Database schema

SQLite (default file `data/mus.db`). Tables:

### `library_state`

Singleton index metadata for the music folder (row `id = 1`).

| Column | Type | Notes |
|--------|------|--------|
| `id` | INTEGER | Primary key; use `1` |
| `music_folder_realpath` | TEXT NOT NULL | Resolved `MUSIC_FOLDER` path |
| `content_fingerprint` | TEXT NOT NULL | SHA-256 of sorted `name\tmtime_ms\tsize_bytes` lines |
| `file_count` | INTEGER NOT NULL | Number of indexed `.mp3` files; should match `COUNT(*)` on `tracks` |
| `indexed_at` | INTEGER NOT NULL | Unix ms when this row was last written or “verified” |

### `tracks`

One row per `.mp3` basename under `MUSIC_FOLDER` (library list + tag cache).

| Column | Type | Notes |
|--------|------|--------|
| `id` | INTEGER | Primary key, autoincrement |
| `filename` | TEXT NOT NULL UNIQUE | File basename (no path) |
| `size_bytes` | INTEGER NOT NULL | Last seen file size |
| `mtime_ms` | INTEGER NOT NULL | Last seen modification time (truncated ms) |
| `title` | TEXT | From tags; cleared when size/mtime change |
| `artist` | TEXT | From tags; cleared when size/mtime change |
| `album` | TEXT | From tags; cleared when size/mtime change |
| `genre` | TEXT | From tags; cleared when size/mtime change |
| `year` | INTEGER | From tags; cleared when size/mtime change |
| `duration_sec` | REAL | From tags; cleared when size/mtime change |
| `bitrate_kbps` | INTEGER | From tags; cleared when size/mtime change |
| `codec` | TEXT | From tags; cleared when size/mtime change |
| `updated_at` | INTEGER NOT NULL | Unix ms when this row was last written |

Source of truth in code: `src/db/schema.ts`.
