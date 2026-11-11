import React, { useState } from "react";
import { Database, RefreshCw, Bookmark, History } from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { SidebarObjectsSection } from "./sidebar/SidebarObjectsSection";
import { SidebarSavedQueriesSection } from "./sidebar/SidebarSavedQueriesSection";
import { SidebarHistorySection } from "./sidebar/SidebarHistorySection";
import type { WorkspaceConfig } from "../../types/docpine";

interface WorkspaceSidebarProps {
  workspace: WorkspaceConfig;
}

export function WorkspaceSidebar({ workspace }: WorkspaceSidebarProps) {
  const {
    databasesByWorkspace,
    activeDatabaseByWorkspace,
    schemaByWorkspaceDb,
    schemaLoading,
    savedQueriesByWorkspace,
    historyByWorkspace,
    switchDatabase,
    refreshSchema,
  } = useWorkspaceStore();

  const [section, setSection] = useState<"schema" | "saved" | "history">(
    "schema"
  );

  const databases = databasesByWorkspace[workspace.id] || [];
  const activeDb =
    activeDatabaseByWorkspace[workspace.id] || workspace.defaultDatabase;
  const cacheKey = `${workspace.id}:${activeDb}`;
  const overview = schemaByWorkspaceDb[cacheKey];
  const isLoading = schemaLoading[cacheKey];

  const savedQueries = savedQueriesByWorkspace[workspace.id] || [];
  const historyList = historyByWorkspace[workspace.id] || [];

  return (
    <aside className="w-68 h-full bg-zinc-950 border-r border-zinc-800/80 flex flex-col select-none shrink-0">
      {/* Database Switcher Header */}
      <div className="p-3 border-b border-zinc-800/80 space-y-2">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span>Database</span>
          </div>
          <button
            onClick={() => void refreshSchema(workspace.id, activeDb)}
            title="Refresh Schema"
            className="p-1 rounded-md hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-emerald-400" : ""}`}
            />
          </button>
        </div>

        <select
          value={activeDb}
          onChange={(e) => void switchDatabase(workspace.id, e.target.value)}
          className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
        >
          {databases.length === 0 ? (
            <option value={activeDb}>{activeDb || "(default)"}</option>
          ) : (
            databases.map((db) => (
              <option key={db} value={db}>
                {db}
              </option>
            ))
          )}
        </select>

        {/* Sidebar Mode Switcher */}
        <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-zinc-900/90 border border-zinc-800/80 text-[11px]">
          <button
            onClick={() => setSection("schema")}
            className={`py-1 rounded-md font-medium transition-colors ${
              section === "schema"
                ? "bg-zinc-800 text-zinc-100 shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Objects ({overview?.containers.length ?? 0})
          </button>
          <button
            onClick={() => setSection("saved")}
            className={`py-1 rounded-md font-medium transition-colors flex items-center justify-center gap-1 ${
              section === "saved"
                ? "bg-zinc-800 text-zinc-100 shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Bookmark className="w-3 h-3" />
            Saved
          </button>
          <button
            onClick={() => setSection("history")}
            className={`py-1 rounded-md font-medium transition-colors flex items-center justify-center gap-1 ${
              section === "history"
                ? "bg-zinc-800 text-zinc-100 shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <History className="w-3 h-3" />
            Logs
          </button>
        </div>
      </div>

      {section === "schema" && (
        <SidebarObjectsSection
          workspace={workspace}
          activeDb={activeDb}
          containers={overview?.containers || []}
          isLoading={isLoading}
          hasOverview={Boolean(overview)}
        />
      )}

      {section === "saved" && (
        <SidebarSavedQueriesSection
          workspace={workspace}
          activeDb={activeDb}
          savedQueries={savedQueries}
        />
      )}

      {section === "history" && (
        <SidebarHistorySection
          workspace={workspace}
          activeDb={activeDb}
          historyList={historyList}
        />
      )}
    </aside>
  );
}
