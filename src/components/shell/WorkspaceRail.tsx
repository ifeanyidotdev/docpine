import React from "react";
import {
  Database,
  LayoutGrid,
  Plus,
  Search,
  ShieldAlert,
  Lock,
  Folder,
  FolderOpen,
} from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import type { DatabaseEngine, WorkspaceConfig } from "../../types/docpine";

export function engineShortLabel(engine: DatabaseEngine): string {
  switch (engine) {
    case "postgres":
      return "PG";
    case "mysql":
      return "MY";
    case "mongodb":
      return "MG";
  }
}

export function engineFullName(engine: DatabaseEngine): string {
  switch (engine) {
    case "postgres":
      return "PostgreSQL";
    case "mysql":
      return "MySQL / MariaDB";
    case "mongodb":
      return "MongoDB";
  }
}

export function WorkspaceRail() {
  const {
    workspaces,
    folders,
    expandedFolderIds,
    activeWorkspaceId,
    connectionStatus,
    selectWorkspace,
    openConnectionModal,
    setCommandPaletteOpen,
    toggleFolderExpanded,
  } = useWorkspaceStore();

  const getInitials = (ws: WorkspaceConfig) => {
    const words = ws.name.trim().split(/\s+/);
    if (words.length >= 2) {
      return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
    }
    return ws.name.slice(0, 2).toUpperCase();
  };

  const indexById = new Map<string, number>();
  workspaces.forEach((ws, idx) => indexById.set(ws.id, idx));

  const folderIds = new Set(folders.map((f) => f.id));
  const workspacesByFolder = new Map<string, WorkspaceConfig[]>();
  const ungroupedWorkspaces: WorkspaceConfig[] = [];

  for (const ws of workspaces) {
    if (ws.folderId && folderIds.has(ws.folderId)) {
      const list = workspacesByFolder.get(ws.folderId) || [];
      list.push(ws);
      workspacesByFolder.set(ws.folderId, list);
    } else {
      ungroupedWorkspaces.push(ws);
    }
  }

  const renderWorkspaceButton = (ws: WorkspaceConfig, inFolder: boolean) => {
    const isActive = activeWorkspaceId === ws.id;
    const status = connectionStatus[ws.id] || "disconnected";
    const index = indexById.get(ws.id) ?? 99;

    return (
      <button
        key={ws.id}
        onClick={() => void selectWorkspace(ws.id)}
        title={`${ws.name} (${engineFullName(ws.engine)} • ${ws.environment.toUpperCase()})${index < 9 ? ` — ⌘${index + 1}` : ""}`}
        className={`group relative ${
          inFolder ? "w-10 h-10 rounded-xl" : "w-11 h-11 rounded-2xl"
        } flex flex-col items-center justify-center transition-all shrink-0 cursor-pointer ${
          isActive
            ? "bg-zinc-900 text-white shadow-lg ring-2"
            : "bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/90 hover:text-zinc-100"
        }`}
        style={
          isActive
            ? {
                borderColor: ws.accentColor,
                boxShadow: `0 0 20px -4px ${ws.accentColor}55`,
              }
            : undefined
        }
      >
        {/* Active Pill Indicator */}
        {isActive && (
          <span
            className={`absolute ${inFolder ? "-left-2" : "-left-2.5"} w-1.5 h-6 rounded-r-full transition-all`}
            style={{ backgroundColor: ws.accentColor }}
          />
        )}

        {/* Initials + Engine Micro-Tag */}
        <span className="text-xs font-bold tracking-tight leading-none">
          {getInitials(ws)}
        </span>
        <span
          className="text-[9px] font-mono font-semibold mt-0.5 px-1 rounded"
          style={{ color: ws.accentColor }}
        >
          {engineShortLabel(ws.engine)}
        </span>

        {/* Live Connection Status Dot */}
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-zinc-950 ${
            status === "connected"
              ? "bg-emerald-400"
              : status === "connecting"
                ? "bg-amber-400 animate-pulse"
                : status === "error"
                  ? "bg-rose-500"
                  : "bg-zinc-600"
          }`}
        />

        {/* Safety Badge Icon if ReadOnly or Production */}
        {ws.safetyMode === "read_only" ? (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-300">
            <Lock className="w-2.5 h-2.5" />
          </span>
        ) : ws.environment === "production" ? (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-400">
            <ShieldAlert className="w-2.5 h-2.5" />
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <aside className="w-16 h-full bg-zinc-950 border-r border-zinc-800/80 flex flex-col items-center py-3 select-none shrink-0 z-20">
      {/* Brand / Launchpad Home Button */}
      <button
        onClick={() => void selectWorkspace(null)}
        title="Docpine Launchpad (⌘0)"
        className={`group relative w-11 h-11 rounded-2xl flex items-center justify-center transition-all mb-2 cursor-pointer ${
          activeWorkspaceId === null
            ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40 shadow-lg shadow-emerald-950/50"
            : "bg-zinc-900/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        }`}
      >
        <LayoutGrid className="w-5 h-5" />
        {activeWorkspaceId === null && (
          <span className="absolute -left-2.5 w-1 h-5 rounded-r-full bg-emerald-400" />
        )}
      </button>

      {/* Command Palette Trigger */}
      <button
        onClick={() => setCommandPaletteOpen(true)}
        title="Quick Switch & Command Palette (⌘K)"
        className="w-11 h-9 rounded-xl bg-zinc-900/50 hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition-colors mb-3 border border-zinc-800/60 cursor-pointer"
      >
        <Search className="w-4 h-4" />
      </button>

      <div className="w-8 h-px bg-zinc-800/80 mb-3" />

      {/* Workspace Folders & Ungrouped Icons List */}
      <div className="flex-1 w-full overflow-y-auto flex flex-col items-center gap-2.5 px-1.5">
        {folders.map((folder) => {
          const children = workspacesByFolder.get(folder.id) || [];
          const isExpanded = Boolean(expandedFolderIds[folder.id]);
          const hasActiveChild = children.some(
            (w) => w.id === activeWorkspaceId
          );
          const hasConnectedChild = children.some(
            (w) => connectionStatus[w.id] === "connected"
          );

          if (isExpanded) {
            return (
              <div
                key={folder.id}
                className="w-12 rounded-2xl p-1 flex flex-col items-center gap-2 border transition-all shrink-0"
                style={{
                  backgroundColor: `${folder.color}14`,
                  borderColor: `${folder.color}40`,
                }}
              >
                <button
                  onClick={() => toggleFolderExpanded(folder.id)}
                  title={`Collapse ${folder.name} (${children.length})`}
                  className="w-10 h-8 rounded-xl flex items-center justify-center hover:bg-zinc-800/60 transition-colors cursor-pointer"
                >
                  <FolderOpen
                    className="w-4 h-4"
                    style={{ color: folder.color }}
                  />
                </button>

                {children.length === 0 ? (
                  <div
                    title="Empty folder — assign workspaces from Launchpad"
                    className="text-[9px] font-mono text-zinc-500 pb-1"
                  >
                    0
                  </div>
                ) : (
                  children.map((ws) => renderWorkspaceButton(ws, true))
                )}
              </div>
            );
          }

          return (
            <button
              key={folder.id}
              onClick={() => toggleFolderExpanded(folder.id)}
              title={`${folder.name} (${children.length} workspace${children.length === 1 ? "" : "s"}) — click to expand`}
              className="group relative w-11 h-11 rounded-2xl border flex items-center justify-center transition-all shrink-0 cursor-pointer hover:brightness-110"
              style={{
                backgroundColor: `${folder.color}1C`,
                borderColor: hasActiveChild
                  ? folder.color
                  : `${folder.color}48`,
                boxShadow: hasActiveChild
                  ? `0 0 18px -4px ${folder.color}66`
                  : undefined,
              }}
            >
              {hasActiveChild && (
                <span
                  className="absolute -left-2.5 w-1.5 h-6 rounded-r-full"
                  style={{ backgroundColor: folder.color }}
                />
              )}

              {/* Discord-style 2x2 mini-grid preview of child workspaces */}
              {children.length === 0 ? (
                <Folder
                  className="w-4 h-4 opacity-80"
                  style={{ color: folder.color }}
                />
              ) : (
                <div className="grid grid-cols-2 gap-1 p-1.5 w-full h-full">
                  {children.slice(0, 4).map((child) => (
                    <span
                      key={child.id}
                      className="rounded-md flex items-center justify-center text-[7px] font-mono font-bold text-zinc-950 leading-none"
                      style={{ backgroundColor: child.accentColor }}
                    >
                      {engineShortLabel(child.engine)[0]}
                    </span>
                  ))}
                </div>
              )}

              {/* Connected indicator if any child workspace is connected */}
              {hasConnectedChild && (
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-zinc-950 bg-emerald-400" />
              )}
            </button>
          );
        })}

        {folders.length > 0 && ungroupedWorkspaces.length > 0 && (
          <div className="w-6 h-px bg-zinc-800/80 my-0.5 shrink-0" />
        )}

        {ungroupedWorkspaces.map((ws) => renderWorkspaceButton(ws, false))}

        {/* Add New Workspace Button */}
        <button
          onClick={() => openConnectionModal(null)}
          title="Create New Database Workspace"
          className="w-11 h-11 rounded-2xl border border-dashed border-zinc-700/80 hover:border-emerald-500/60 bg-zinc-900/30 hover:bg-emerald-500/10 text-zinc-400 hover:text-emerald-300 flex items-center justify-center transition-all shrink-0 mt-1 cursor-pointer"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Footer Brand Badge */}
      <div className="pt-2 flex flex-col items-center gap-1 opacity-60">
        <Database className="w-4 h-4 text-emerald-400" />
        <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">
          v0.1
        </span>
      </div>
    </aside>
  );
}
