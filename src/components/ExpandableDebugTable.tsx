"use client";

import type { ReactNode } from "react";
import { useState } from "react";

export function ExpandableDebugTable({
  minWidth,
  columns,
  hiddenCount,
  visibleRows,
  hiddenRows,
}: {
  minWidth: string;
  columns: Array<{ key: string; label: string }>;
  hiddenCount: number;
  visibleRows: ReactNode;
  hiddenRows: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const rowCount = hiddenCount + 1;

  return (
    <div className="max-h-[min(60vh,40rem)] overflow-auto rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <table className={`w-full ${minWidth} border-collapse text-left text-xs`}>
        <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-100/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
          <tr>
            {columns.map((col, index) => (
              <th
                key={col.key}
                className="whitespace-nowrap px-2 py-2 font-semibold text-zinc-700 dark:text-zinc-300"
              >
                <span className="inline-flex items-center gap-2">
                  {index === 0 && hiddenCount > 0 ? (
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setExpanded((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
                    >
                      <span
                        aria-hidden="true"
                        className="text-zinc-500 dark:text-zinc-400"
                      >
                        {expanded ? "▾" : "▸"}
                      </span>
                      <span>{expanded ? "Collapse" : `Show ${rowCount}`}</span>
                    </button>
                  ) : null}
                  <span>{col.label}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows}
          {expanded ? hiddenRows : null}
        </tbody>
      </table>
    </div>
  );
}
