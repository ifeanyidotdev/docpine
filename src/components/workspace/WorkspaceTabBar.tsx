import React from "react";
import {
  Table2,
  Terminal,
  SlidersHorizontal,
  Network,
  Activity,
  X,
  Plus,
} from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import type { WorkspaceTab, WorkspaceTabKind } from "../../types/docpine";

interface WorkspaceTabBarProps {
  workspaceId: string;
}

export function WorkspaceTabBar({ workspaceId }: WorkspaceTabBarProps) {
  const {
    tabsByWorkspace,
    activeTabIdByWorkspace,
    activeTabIdByWorkspaceDb,
    stagedByTab,
    activeDatabaseByWorkspace,
    workspaces,
    setActiveTab,
    closeTab,
    openTab,
  } = useWorkspaceStore();

  const ws = workspaces.find((w) => w.id === workspaceId);
  const activeDb =
    activeDatabaseByWorkspace[workspaceId] || ws?.defaultDatabase || "";

  // Filter tabs strictly by the currently active database
  const tabs = (tabsByWorkspace[workspaceId] || []).filter(
    (t) => t.database === activeDb
  );
  const activeTabId =
    activeTabIdByWorkspaceDb[`${workspaceId}:${activeDb}`] ??
    activeTabIdByWorkspace[workspaceId];

  const tabIcon = (kind: WorkspaceTabKind) => {
    switch (kind) {
      case "data":
        return <Table2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case "query":
        return <Terminal className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      case "structure":
        return (
          <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400 shrink-0" />
        );
      case "erd":
        return <Network className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
      case "monitor":
        return <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
    }
  };

  const getStagedCount = (tab: WorkspaceTab) => {
    const staged = stagedByTab[tab.id];
    if (!staged) return 0;
    return (
      Object.keys(staged.inserts).length +
      Object.keys(staged.updates).length +
      Object.keys(staged.deletes).length
    );
  };

  return (
    <div className="h-9 bg-zinc-950 border-b border-zinc-800/80 flex items-center px-2 gap-1 overflow-x-auto select-none shrink-0">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        const pendingCount = getStagedCount(tab);

        return (
          <div
            key={tab.id}
            onClick={() => setActiveTab(workspaceId, tab.id)}
            className={`group h-7 px-3 rounded-lg flex items-center gap-2 text-xs font-medium cursor-pointer transition-all shrink-0 border ${
              active
                ? "bg-zinc-900 text-zinc-100 border-zinc-700/80 shadow-sm"
                : "bg-zinc-950/40 text-zinc-400 border-transparent hover:bg-zinc-900/50 hover:text-zinc-200"
            }`}
          >
            {tabIcon(tab.kind)}
            <span className="max-w-[160px] truncate">{tab.title}</span>

            {pendingCount > 0 && (
              <span
                title={`${pendingCount} staged modification(s)`}
                className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40"
              >
                {pendingCount}
              </span>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(workspaceId, tab.id);
              }}
              className="p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 opacity-60 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      {/* Quick + Query Tab button */}
      <button
        onClick={() =>
          openTab(workspaceId, {
            kind: "query",
            title: `Query ${tabs.filter((t) => t.kind === "query").length + 1}`,
            database: activeDb,
            queryText:
              ws?.engine === "mongodb"
                ? JSON.stringify(
                    {
                      action: "find",
                      collection: "users",
                      filter: {},
                      limit: 50,
                    },
                    null,
                    2
                  )
                : "SELECT 1;",
          })
        }
        title="Open New Query Tab"
        className="h-7 px-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 flex items-center gap-1 text-xs transition-colors shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
