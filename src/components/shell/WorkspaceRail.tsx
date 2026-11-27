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
            ? "text-white"
            : inFolder
              ? "bg-zinc-950/75 text-zinc-400 border border-zinc-800/70 hover:bg-zinc-900 hover:border-zinc-700 hover:text-zinc-100"
              : "bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/90 hover:text-zinc-100"
        }`}
        style={
          isActive
            ? {
                backgroundColor: `${ws.accentColor}22`,
                boxShadow: `inset 0 0 0 1.5px ${ws.accentColor}, 0 0 16px -3px ${ws.accentColor}66`,
              }
            : undefined
        }
      >
        {/* Active Indicator Pill — inset when inside folder so it never clips */}
        {isActive &&
          (inFolder ? (
            <span
              className="absolute left-0.5 top-2 bottom-2 w-[3px] rounded-full"
              style={{ backgroundColor: ws.accentColor }}
            />
          ) : (
            <span
              className="absolute -left-2.5 w-1.5 h-6 rounded-r-full transition-all"
              style={{ backgroundColor: ws.accentColor }}
            />
          ))}

        <span
          className={`text-xs font-bold tracking-tight leading-none ${
            isActive ? "text-white" : ""
          }`}
        >
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
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 ${
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
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-300">
            <Lock className="w-2 h-2" />
          </span>
        ) : ws.environment === "production" ? (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-400">
            <ShieldAlert className="w-2 h-2" />
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
          const activeChild =
            children.find((w) => w.id === activeWorkspaceId) || null;
          const hasConnectedChild = children.some(
            (w) => connectionStatus[w.id] === "connected"
          );

          if (isExpanded) {
            return (
              <div
                key={folder.id}
                className="relative w-12 rounded-2xl py-1.5 px-1 flex flex-col items-center gap-1.5 border transition-all shrink-0 bg-zinc-900/70 backdrop-blur-xs"
                style={{
                  borderColor: activeChild
                    ? `${folder.color}70`
                    : `${folder.color}38`,
                  boxShadow: activeChild
                    ? `0 0 20px -6px ${folder.color}55`
                    : "inset 0 1px 0 0 rgba(255,255,255,0.03)",
                }}
              >
                {/* Left accent bar on the group when a child inside is active */}
                {activeChild && (
                  <span
                    className="absolute -left-2 top-3 w-1 h-5 rounded-r-full"
                    style={{ backgroundColor: folder.color }}
                  />
                )}

                <button
                  type="button"
                  onClick={() => toggleFolderExpanded(folder.id)}
                  title={`Collapse ${folder.name} (${children.length})`}
                  className="w-10 h-7 rounded-xl flex items-center justify-center gap-1 transition-colors cursor-pointer shrink-0 hover:brightness-125"
                  style={{
                    backgroundColor: `${folder.color}1C`,
                  }}
                >
                  <FolderOpen
                    className="w-3.5 h-3.5"
                    style={{ color: folder.color }}
                  />
                  <span
                    className="text-[9px] font-mono font-bold"
                    style={{ color: folder.color }}
                  >
                    {children.length}
                  </span>
                </button>

                <div
                  className="w-6 h-px shrink-0 opacity-40"
                  style={{ backgroundColor: folder.color }}
                />

                {children.length === 0 ? (
                  <div
                    title="Empty folder — assign workspaces from Launchpad"
                    className="text-[9px] font-mono text-zinc-500 py-1"
                  >
                    —
                  </div>
                ) : (
                  <div className="w-full max-h-64 overflow-y-auto flex flex-col items-center gap-2 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {children.map((ws) => renderWorkspaceButton(ws, true))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <button
              key={folder.id}
              type="button"
              onClick={() => toggleFolderExpanded(folder.id)}
              title={`${folder.name} (${children.length} workspace${children.length === 1 ? "" : "s"})${activeChild ? ` • Active: ${activeChild.name}` : ""} — click to expand`}
              className="group relative w-11 h-11 rounded-2xl border flex flex-col items-center justify-center transition-all shrink-0 cursor-pointer hover:brightness-110"
              style={{
                backgroundColor: activeChild
                  ? `${folder.color}26`
                  : `${folder.color}14`,
                borderColor: activeChild ? folder.color : `${folder.color}40`,
                boxShadow: activeChild
                  ? `0 0 18px -4px ${folder.color}70`
                  : undefined,
              }}
            >
              {activeChild && (
                <span
                  className="absolute -left-2.5 w-1.5 h-6 rounded-r-full"
                  style={{ backgroundColor: activeChild.accentColor }}
                />
              )}

              <Folder
                className={activeChild ? "w-4 h-4" : "w-5 h-5"}
                style={{ color: folder.color }}
              />

              {/* When collapsed with an active workspace inside, show its initials */}
              {activeChild && (
                <span
                  className="text-[8px] font-mono font-bold leading-none mt-0.5"
                  style={{ color: activeChild.accentColor }}
                >
                  {getInitials(activeChild)}
                </span>
              )}

              {children.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-zinc-900 border border-zinc-700 text-[9px] font-mono font-bold text-zinc-200 flex items-center justify-center leading-none">
                  {children.length}
                </span>
              )}

              {hasConnectedChild && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 bg-emerald-400" />
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
