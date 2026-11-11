import React from "react";
import { Terminal, Network, Settings2, Search } from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { engineFullName } from "../shell/WorkspaceRail";
import type { WorkspaceConfig } from "../../types/docpine";

interface WorkspaceTopbarProps {
  workspace: WorkspaceConfig;
}

export function WorkspaceTopbar({ workspace }: WorkspaceTopbarProps) {
  const {
    connectionStatus,
    activeDatabaseByWorkspace,
    connectToWorkspace,
    openConnectionModal,
    openTab,
    setCommandPaletteOpen,
  } = useWorkspaceStore();

  const status = connectionStatus[workspace.id] || "disconnected";
  const activeDb =
    activeDatabaseByWorkspace[workspace.id] || workspace.defaultDatabase;

  const handleNewQueryTab = () => {
    const defaultQuery =
      workspace.engine === "mongodb"
        ? JSON.stringify(
            { action: "find", collection: "users", filter: {}, limit: 50 },
            null,
            2
          )
        : "SELECT * FROM information_schema.tables LIMIT 50;";

    openTab(workspace.id, {
      kind: "query",
      title: `Query (${activeDb || "default"})`,
      database: activeDb,
      queryText: defaultQuery,
    });
  };

  const handleOpenErd = () => {
    openTab(workspace.id, {
      kind: "erd",
      title: `ER Diagram (${activeDb})`,
      database: activeDb,
    });
  };

  return (
    <header
      className="h-12 px-4 bg-zinc-950 border-b border-zinc-800/90 flex items-center justify-between gap-4 shrink-0 select-none"
      style={{ borderTop: `2px solid ${workspace.accentColor}` }}
    >
      {/* Left: Workspace Identity */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => void connectToWorkspace(workspace.id)}
          title={
            status === "connected"
              ? "Connected — click to refresh"
              : status === "connecting"
                ? "Connecting..."
                : "Disconnected — click to reconnect"
          }
          className="flex items-center gap-2 min-w-0"
        >
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              status === "connected"
                ? "bg-emerald-400"
                : status === "connecting"
                  ? "bg-amber-400 animate-pulse"
                  : "bg-rose-500"
            }`}
          />
          <h2 className="text-sm font-bold text-zinc-100 truncate">
            {workspace.name}
          </h2>
        </button>

        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-zinc-900 border border-zinc-800 text-zinc-300 shrink-0">
          {engineFullName(workspace.engine)}
        </span>
      </div>

      {/* Right: Quick Tools */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleNewQueryTab}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 transition-colors"
        >
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span>New Query</span>
        </button>

        <button
          onClick={handleOpenErd}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 transition-colors"
        >
          <Network className="w-3.5 h-3.5 text-indigo-400" />
          <span>ER Diagram</span>
        </button>

        <button
          onClick={() => setCommandPaletteOpen(true)}
          title="Command Palette (⌘K)"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="font-mono text-[10px]">⌘K</span>
        </button>

        <button
          onClick={() => openConnectionModal(workspace)}
          title="Workspace Settings"
          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
