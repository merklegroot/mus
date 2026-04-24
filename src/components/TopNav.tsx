"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PAGE_TITLE: Record<string, string> = {
  "/": "Home",
  "/playlists": "Playlists",
  "/tube": "Tube",
  "/data": "Data",
};

function titleForPath(pathname: string | null): string {
  if (!pathname) return "";
  if (pathname.startsWith("/artist/")) {
    const raw = pathname.slice("/artist/".length);
    try {
      return decodeURIComponent(raw).trim() || "Artist";
    } catch {
      return "Artist";
    }
  }
  return PAGE_TITLE[pathname] ?? "";
}

export function TopNav() {
  const pathname = usePathname();
  const title = titleForPath(pathname);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <nav
        className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4 sm:px-6"
        aria-label="Main"
      >
        <Link
          href="/"
          className="text-sm font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
        >
          Home
        </Link>
        <Link
          href="/playlists"
          className="text-sm font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
        >
          Playlists
        </Link>
        <Link
          href="/tube"
          className="text-sm font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
        >
          Tube
        </Link>
        <Link
          href="/data"
          className="text-sm font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
        >
          Data
        </Link>
        {title ? (
          <h1 className="ml-auto min-w-0 truncate text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {title}
          </h1>
        ) : null}
      </nav>
    </header>
  );
}
