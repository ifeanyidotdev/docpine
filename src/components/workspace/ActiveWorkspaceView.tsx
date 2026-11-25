import React from "react";
import { WorkspaceTopbar } from "./WorkspaceTopbar";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { WorkspaceTabBar } from "./WorkspaceTabBar";
import { DataExplorerTab } from "../data/DataExplorerTab";
import { QueryEditorTab } from "../query/QueryEditorTab";
import { StructureDesignerTab } from "../structure/StructureDesignerTab";
import { ErDiagramTab } from "../erd/ErDiagramTab";
import { ObservabilityTab } from "../observability/ObservabilityTab";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { Database, Terminal, Network, Activity } from "lucide-react";
import type { WorkspaceConfig } from "../../types/docpine";

interface ActiveWorkspaceViewProps {
  workspace: WorkspaceConfig;
  /** Whether this workspace is the one currently shown on screen. */
  isVisible?: boolean;
}

export function ActiveWorkspaceView({
  workspace,
  isVisible = true,
}: ActiveWorkspaceViewProps) {
  const {
    tabsByWorkspace,
    activeTabIdByWorkspace,
    activeTabIdByWorkspaceDb,
    activeDatabaseByWorkspace,
    openTab,
  } = useWorkspaceStore();

  const activeDb =
    activeDatabaseByWorkspace[workspace.id] || workspace.defaultDatabase || "";
  // Filter tabs strictly by the currently active database
  const tabs = (tabsByWorkspace[workspace.id] || []).filter(
    (t) => t.database === activeDb
  );
  const activeTabId =
    activeTabIdByWorkspaceDb[`${workspace.id}:${activeDb}`] ??
    activeTabIdByWorkspace[workspace.id];
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0] || null;

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-zinc-950">
      {/* Top Workspace Header Bar */}
      <WorkspaceTopbar workspace={workspace} />

      {/* Main Split: Left Schema Explorer Sidebar + Right Multi-Tab Surface */}
      <div className="flex-1 flex overflow-hidden">
        <WorkspaceSidebar workspace={workspace} />

        <main className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
          <WorkspaceTabBar workspaceId={workspace.id} />

          {!activeTab ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400">
                <Database className="w-6 h-6" />
              </div>
              <div className="max-w-sm space-y-1">
                <h3 className="text-sm font-semibold text-zinc-200">
                  {workspace.name} Workspace Ready
                </h3>
                <p className="text-xs text-zinc-400">
                  Select a{" "}
                  {workspace.engine === "mongodb" ? "collection" : "table"} in
                  the left sidebar to manipulate data, or launch a Query Editor
                  or ER Diagram.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    openTab(workspace.id, {
                      kind: "query",
                      title: "Query 1",
                      database: activeDb,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  New Query Tab
                </button>
                <button
                  onClick={() =>
                    openTab(workspace.id, {
                      kind: "erd",
                      title: `ER Diagram (${activeDb})`,
                      database: activeDb,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-semibold text-xs"
                >
                  <Network className="w-3.5 h-3.5 text-indigo-400" />
                  Open ER Diagram
                </button>
                <button
                  onClick={() =>
                    openTab(workspace.id, {
                      kind: "monitor",
                      title: `Monitor (${activeDb})`,
                      database: activeDb,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-semibold text-xs"
                >
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  Open Monitor
                </button>
              </div>
            </div>
          ) : (
            // Keep every opened tab mounted (hidden when inactive) so each tab
            // preserves its loaded rows, filters, pagination, scroll & selection.
            tabs.map((t) => {
              const isTabActive = t.id === activeTab.id;
              return (
                <div
                  key={t.id}
                  className={
                    isTabActive
                      ? "flex-1 flex flex-col overflow-hidden"
                      : "hidden"
                  }
                >
                  {t.kind === "data" ? (
                    <DataExplorerTab
                      workspace={workspace}
                      tab={t}
                      isActive={isVisible && isTabActive}
                    />
                  ) : t.kind === "query" ? (
                    <QueryEditorTab workspace={workspace} tab={t} />
                  ) : t.kind === "structure" ? (
                    <StructureDesignerTab workspace={workspace} tab={t} />
                  ) : t.kind === "monitor" ? (
                    <ObservabilityTab
                      workspace={workspace}
                      tab={t}
                      isActive={isVisible && isTabActive}
                    />
                  ) : (
                    <ErDiagramTab workspace={workspace} tab={t} />
                  )}
                </div>
              );
            })
          )}
        </main>
      </div>
    </div>
  );
}
