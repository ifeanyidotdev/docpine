import React from "react";
import { useWorkspaceStore } from "../../../store/useWorkspaceStore";
import type { QueryHistoryRecord, WorkspaceConfig } from "../../../types/docpine";

interface SidebarHistorySectionProps {
  workspace: WorkspaceConfig;
  activeDb: string;
  historyList: QueryHistoryRecord[];
}

export function SidebarHistorySection({
  workspace,
  activeDb,
  historyList,
}: SidebarHistorySectionProps) {
  const { openTab } = useWorkspaceStore();

  if (historyList.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-4 text-center text-xs text-zinc-500">
        Query and mutation history for this workspace will appear here.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
      {historyList.map((item) => (
        <div
          key={item.id}
          onClick={() =>
            openTab(workspace.id, {
              kind: "query",
              title: "History Query",
              database: item.database || activeDb,
              queryText: item.queryText,
            })
          }
          className="p-2.5 rounded-xl bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800/60 cursor-pointer space-y-1 transition-colors"
        >
          <div className="flex items-center justify-between text-[10px]">
            <span
              className={`font-semibold uppercase ${
                item.status === "success"
                  ? "text-emerald-400"
                  : "text-rose-400"
              }`}
            >
              {item.status} • {item.executionMs}ms
            </span>
            <span className="text-zinc-500 font-mono">
              {new Date(item.executedAt).toLocaleTimeString()}
            </span>
          </div>
          <pre className="text-[10px] font-mono text-zinc-300 line-clamp-2 whitespace-pre-wrap break-all">
            {item.queryText}
          </pre>
        </div>
      ))}
    </div>
  );
}
