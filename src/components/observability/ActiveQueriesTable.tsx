import React from "react";
import { Terminal, Copy, Check } from "lucide-react";
import { useState } from "react";
import type { ActiveQueryProcess, WorkspaceConfig } from "../../types/docpine";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { formatDurationMs } from "./formatters";

interface ActiveQueriesTableProps {
  workspace: WorkspaceConfig;
  activeDb: string;
  queries: ActiveQueryProcess[];
}

export function ActiveQueriesTable({
  workspace,
  activeDb,
  queries,
}: ActiveQueriesTableProps) {
  const { openTab } = useWorkspaceStore();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (id: string, queryText: string) => {
    try {
      await navigator.clipboard.writeText(queryText);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold text-zinc-200">
            Active Server Queries
          </h4>
          <p className="text-[11px] text-zinc-500">
            Live non-idle queries/operations currently running on the server
          </p>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">
          {queries.length} active
        </span>
      </div>

      {queries.length === 0 ? (
        <div className="p-6 text-center text-xs text-zinc-500">
          No active queries running on the server right now.
        </div>
      ) : (
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-zinc-950/95 text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800/80">
              <tr>
                <th className="px-3 py-2 font-semibold">ID</th>
                <th className="px-3 py-2 font-semibold">User</th>
                <th className="px-3 py-2 font-semibold">Duration</th>
                <th className="px-3 py-2 font-semibold">Query / Operation</th>
                <th className="px-3 py-2 font-semibold text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {queries.map((proc) => (
                <tr
                  key={`${proc.id}-${proc.durationMs}`}
                  className="hover:bg-zinc-900/80 transition-colors"
                >
                  <td className="px-3 py-2 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                    {proc.id}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-zinc-300 whitespace-nowrap">
                    {proc.user || "—"}
                    {proc.state && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-800 text-zinc-400">
                        {proc.state}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap">
                    <span
                      className={
                        proc.durationMs >= 5000
                          ? "text-rose-400 font-semibold"
                          : proc.durationMs >= 1000
                            ? "text-amber-400"
                            : "text-emerald-400"
                      }
                    >
                      {formatDurationMs(proc.durationMs)}
                    </span>
                  </td>
                  <td className="px-3 py-2 max-w-[320px]">
                    <div
                      title={proc.query}
                      className="font-mono text-[11px] text-zinc-300 truncate"
                    >
                      {proc.query || "(empty)"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => void handleCopy(proc.id, proc.query)}
                        title="Copy query"
                        className="p-1 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        {copiedId === proc.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      {proc.query.trim() && (
                        <button
                          onClick={() =>
                            openTab(workspace.id, {
                              kind: "query",
                              title: `Inspect #${proc.id}`,
                              database: proc.database || activeDb,
                              queryText: proc.query,
                            })
                          }
                          title="Open in Query Editor"
                          className="p-1 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 transition-colors"
                        >
                          <Terminal className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
