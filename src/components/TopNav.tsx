import Link from "next/link";

export function TopNav() {
  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
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
          href="/tube"
          className="text-sm font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
        >
          Tube
        </Link>
      </nav>
    </header>
  );
}
