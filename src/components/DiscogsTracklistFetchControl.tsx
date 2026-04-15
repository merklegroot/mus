"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

export function DiscogsTracklistFetchControl({
  id,
  type,
  secondary,
}: {
  id: number;
  type: "release" | "master";
  secondary?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<FetchState>({ status: "idle" });

  const baseBtn =
    "rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const primaryClass =
    "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200";
  const secondaryClass =
    "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";

  async function onFetch() {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/discogs/tracklist/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : res.statusText;
        setState({ status: "error", message });
        return;
      }
      setState({ status: "idle" });
      router.refresh();
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={state.status === "loading"}
        onClick={onFetch}
        className={`${baseBtn} ${secondary ? secondaryClass : primaryClass}`}
      >
        {state.status === "loading" ? "Tracks…" : "Load tracks"}
      </button>
      {state.status === "error" ? (
        <p className="text-[11px] text-red-600 dark:text-red-400">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

