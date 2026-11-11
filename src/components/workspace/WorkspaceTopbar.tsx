import React from "react";
import {
  GitCommitHorizontal,
  Zap,
  Shield,
  Lock,
  Unlock,
  Terminal,
  Network,
  RefreshCw,
  Settings2,
  Search,
  PlugZap,
} from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { engineFullName } from "../shell/WorkspaceRail";
import type { SafetyMode, WorkspaceConfig } from "../../types/docpine";

interface WorkspaceTopbarProps {
  workspace: WorkspaceConfig;
}

export function WorkspaceTopbar({ workspace }: WorkspaceTopbarProps) {
  const {
    connectionStatus,
    connectionLatency,
    activeDatabaseByWorkspace,
    updateWorkspaceModes,
    connectToWorkspace,
    openConnectionModal,
    openTab,
    setCommandPaletteOpen,
  } = useWorkspaceStore();

  const status = connectionStatus[workspace.id] || "disconnected";
  const latency = connectionLatency[workspace.id];
  const activeDb =
    activeDatabaseByWorkspace[workspace.id] || workspace.defaultDatabase;

  const cycleSafetyMode = () => {
    const order: SafetyMode[] = ["safe", "standard", "read_only"];
    const next =
      order[(order.indexOf(workspace.safetyMode) + 1) % order.length];
    void updateWorkspaceModes(workspace.id, undefined, next);
  };

  const toggleCommitMode = () => {
    const next = workspace.commitMode === "staged" ? "immediate" : "staged";
    void updateWorkspaceModes(workspace.id, next, undefined);
  };

  const handleNewQueryTab = () => {
    const defaultQuery =
      workspace.engine === "mongodb"
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
      style={{
        borderTop: `2px solid ${workspace.accentColor}`,
      }}
    >
      {/* Left: Workspace Identity & Environment Badge */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: workspace.accentColor }}
          />
          <h2 className="text-sm font-bold text-zinc-100 truncate">
            {workspace.name}
          </h2>
        </div>

        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-zinc-900 border border-zinc-800 text-zinc-300 shrink-0">
          {engineFullName(workspace.engine)}
        </span>

        <span
          className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0"
          style={{
            backgroundColor: `${workspace.accentColor}22`,
            color: workspace.accentColor,
            border: `1px solid ${workspace.accentColor}55`,
          }}
        >
          {workspace.environment}
        </span>

        {/* Live Connection Pill */}
        <button
          onClick={() => void connectToWorkspace(workspace.id)}
          title="Click to reconnect / refresh ping"
          className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 transition-colors"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              status === "connected"
                ? "bg-emerald-400"
                : status === "connecting"
                  ? "bg-amber-400 animate-pulse"
                  : "bg-rose-500"
            }`}
          />
          <span className="font-mono">
            {status === "connected"
              ? `${workspace.host}:${workspace.port}${latency !== undefined ? ` (${latency}ms)` : ""}`
              : status === "connecting"
                ? "Connecting..."
                : "Reconnect"}
          </span>
          {status !== "connected" && <RefreshCw className="w-3 h-3 ml-0.5" />}
        </button>
      </div>

      {/* Right: Mode Controls & Quick Tools */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Commit Mode Toggle (Staged vs Immediate) */}
        <button
          onClick={toggleCommitMode}
          disabled={workspace.safetyMode === "read_only"}
          title="Switch between Staged Changes Mode (review SQL/MQL diff before ⌘S) and Immediate Auto-Commit Mode"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all disabled:opacity-40 ${
            workspace.commitMode === "staged"
              ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20"
              : "bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
          }`}
        >
          {workspace.commitMode === "staged" ? (
            <>
              <GitCommitHorizontal className="w-3.5 h-3.5" />
              <span>Staged Mode</span>
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5" />
              <span>Immediate Mode</span>
            </>
          )}
        </button>

        {/* Safety Mode Switcher */}
        <button
          onClick={cycleSafetyMode}
          title="Click to cycle Safety Mode: Safe Mode -> Standard -> Read-Only Lock"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
            workspace.safetyMode === "read_only"
              ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
              : workspace.safetyMode === "safe"
                ? "bg-sky-500/10 border-sky-500/40 text-sky-300"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {workspace.safetyMode === "read_only" ? (
            <>
              <Lock className="w-3.5 h-3.5" />
              <span>Read-Only</span>
            </>
          ) : workspace.safetyMode === "safe" ? (
            <>
              <Shield className="w-3.5 h-3.5" />
              <span>Safe Guard</span>
            </>
          ) : (
            <>
              <Unlock className="w-3.5 h-3.5" />
              <span>Standard</span>
            </>
          )}
        </button>

        <div className="w-px h-4 bg-zinc-800 mx-0.5" />

        {/* New Query Button */}
        <button
          onClick={handleNewQueryTab}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 transition-colors"
        >
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span>New Query</span>
        </button>

        {/* ER Diagram Button */}
        <button
          onClick={handleOpenErd}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 transition-colors"
        >
          <Network className="w-3.5 h-3.5 text-indigo-400" />
          <span>ER Diagram</span>
        </button>

        {/* Command Palette Button */}
        <button
          onClick={() => setCommandPaletteOpen(true)}
          title="Command Palette (⌘K)"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="font-mono text-[10px]">⌘K</span>
        </button>

        {/* Edit Connection Settings */}
        <button
          onClick={() => openConnectionModal(workspace)}
          title="Workspace Connection Settings"
          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
