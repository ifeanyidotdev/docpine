import React from "react";
import { Trash2 } from "lucide-react";
import { useWorkspaceStore } from "../../../store/useWorkspaceStore";
import type { SavedQueryRecord, WorkspaceConfig } from "../../../types/docpine";

interface SidebarSavedQueriesSectionProps {
  workspace: WorkspaceConfig;
  activeDb: string;
  savedQueries: SavedQueryRecord[];
}

export function SidebarSavedQueriesSection({
  workspace,
  activeDb,
  savedQueries,
}: SidebarSavedQueriesSectionProps) {
  const { openTab, deleteSavedQueryFromWorkspace } = useWorkspaceStore();

  if (savedQueries.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-4 text-center text-xs text-zinc-500">
        No saved queries in this workspace yet. Save any query from the Query
        Editor tab.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
      {savedQueries.map((sq) => (
        <div
          key={sq.id}
          onClick={() =>
            openTab(workspace.id, {
              kind: "query",
              title: sq.title,
              database: sq.database || activeDb,
              queryText: sq.queryText,
            })
          }
          className="group p-2.5 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/70 cursor-pointer space-y-1 transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-zinc-200 truncate">
              {sq.title}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void deleteSavedQueryFromWorkspace(workspace.id, sq.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-500/15 text-zinc-400 hover:text-rose-400 transition-all"
              title="Delete Saved Query"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          <pre className="text-[10px] font-mono text-zinc-400 truncate">
            {sq.queryText}
          </pre>
        </div>
      ))}
    </div>
  );
}
