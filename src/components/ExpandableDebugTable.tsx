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

  return (
    <div className="max-h-[min(60vh,40rem)] overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
      <table className={`w-full ${minWidth} border-collapse text-left text-xs`}>
        <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
          <tr>
            {columns.map((col, index) => (
              <th
                key={col.key}
                className="whitespace-nowrap px-2 py-2 font-medium text-zinc-700 dark:text-zinc-300"
              >
                {index === 0 && hiddenCount > 0 ? (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setExpanded((prev) => !prev)}
                    className="mr-2 inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                    <span>
                      {expanded
                        ? "Show first row"
                        : `Show all ${hiddenCount + 1} rows`}
                    </span>
                  </button>
                ) : null}
                {col.label}
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
