import React, { useEffect, useRef, useState } from "react";
import {
  Terminal,
  Network,
  Settings2,
  Search,
  Activity,
  Plus,
  ChevronDown,
} from "lucide-react";
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

  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);

  const status = connectionStatus[workspace.id] || "disconnected";
  const activeDb =
    activeDatabaseByWorkspace[workspace.id] || workspace.defaultDatabase;

  useEffect(() => {
    if (!newMenuOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (
        newMenuRef.current &&
        !newMenuRef.current.contains(e.target as Node)
      ) {
        setNewMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setNewMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [newMenuOpen]);

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
    setNewMenuOpen(false);
  };

  const handleOpenErd = () => {
    openTab(workspace.id, {
      kind: "erd",
      title: `ER Diagram (${activeDb})`,
      database: activeDb,
    });
    setNewMenuOpen(false);
  };

  const handleOpenMonitor = () => {
    openTab(workspace.id, {
      kind: "monitor",
      title: `Monitor (${activeDb})`,
      database: activeDb,
    });
    setNewMenuOpen(false);
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
        {/* + New Dropdown */}
        <div className="relative" ref={newMenuRef}>
          <button
            type="button"
            onClick={() => setNewMenuOpen((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
              newMenuOpen
                ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                : "bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-200"
            }`}
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span>New</span>
            <ChevronDown
              className={`w-3 h-3 text-zinc-400 transition-transform duration-150 ${
                newMenuOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {newMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-52 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl py-1 z-40">
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Open in Workspace
              </div>

              <button
                type="button"
                onClick={handleNewQueryTab}
                className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-zinc-800/80 transition-colors cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-zinc-100">
                    New Query
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {workspace.engine === "mongodb"
                      ? "Open MQL query editor"
                      : "Open SQL query editor"}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleOpenErd}
                className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-zinc-800/80 transition-colors cursor-pointer"
              >
                <Network className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-zinc-100">
                    ER Diagram
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    Inspect schema relationships
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleOpenMonitor}
                className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-zinc-800/80 transition-colors cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-zinc-100">
                    Monitor
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    Live resources & telemetry
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>

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
