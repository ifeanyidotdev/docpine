import React, { useState } from "react";
import {
  Search,
  Database,
  Table2,
  Terminal,
  Network,
  Activity,
  Plus,
  GitCommitHorizontal,
  X,
} from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";

export function CommandPaletteModal() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    workspaces,
    activeWorkspaceId,
    activeDatabaseByWorkspace,
    schemaByWorkspaceDb,
    selectWorkspace,
    openConnectionModal,
    openTab,
    updateWorkspaceModes,
  } = useWorkspaceStore();

  const [query, setQuery] = useState("");

  if (!commandPaletteOpen) return null;

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
  const activeDb = activeWs
    ? activeDatabaseByWorkspace[activeWs.id] || activeWs.defaultDatabase
    : "";
  const overview = activeWs
    ? schemaByWorkspaceDb[`${activeWs.id}:${activeDb}`]
    : undefined;

  const q = query.trim().toLowerCase();

  const actions: Array<{
    id: string;
    label: string;
    category: string;
    icon: React.ReactNode;
    run: () => void;
  }> = [];

  if (activeWs) {
    actions.push({
      id: "new-query",
      label: `New Query Tab in ${activeWs.name}`,
      category: "Workspace Action",
      icon: <Terminal className="w-4 h-4 text-amber-400" />,
      run: () => {
        openTab(activeWs.id, {
          kind: "query",
          title: "Query",
          database: activeDb,
          queryText:
            activeWs.engine === "mongodb"
              ? '{\n  "action": "find",\n  "collection": "users",\n  "filter": {}\n}'
              : "SELECT * FROM information_schema.tables LIMIT 25;",
        });
      },
    });

    actions.push({
      id: "open-erd",
      label: `Open ER Diagram Visualizer (${activeDb})`,
      category: "Workspace Action",
      icon: <Network className="w-4 h-4 text-indigo-400" />,
      run: () => {
        openTab(activeWs.id, {
          kind: "erd",
          title: `ER Diagram (${activeDb})`,
          database: activeDb,
        });
      },
    });

    actions.push({
      id: "open-monitor",
      label: `Open Resource Monitor & Observability (${activeDb})`,
      category: "Workspace Action",
      icon: <Activity className="w-4 h-4 text-cyan-400" />,
      run: () => {
        openTab(activeWs.id, {
          kind: "monitor",
          title: `Monitor (${activeDb})`,
          database: activeDb,
        });
      },
    });

    actions.push({
      id: "toggle-commit",
      label: `Switch Commit Mode to ${
        activeWs.commitMode === "staged" ? "Immediate Mode" : "Staged Diff Mode"
      }`,
      category: "Workspace Action",
      icon: <GitCommitHorizontal className="w-4 h-4 text-emerald-400" />,
      run: () => {
        void updateWorkspaceModes(
          activeWs.id,
          activeWs.commitMode === "staged" ? "immediate" : "staged"
        );
      },
    });

    for (const c of overview?.containers || []) {
      actions.push({
        id: `container-${c.schema || ""}-${c.name}`,
        label: `Open ${c.name} (${c.kind})`,
        category: `${activeWs.name} • ${activeDb}`,
        icon: <Table2 className="w-4 h-4 text-emerald-400" />,
        run: () => {
          openTab(activeWs.id, {
            kind: "data",
            title: c.name,
            database: activeDb,
            schema: c.schema,
            container: c.name,
            dataViewMode: "table",
          });
        },
      });
    }
  }

  for (const ws of workspaces) {
    actions.push({
      id: `ws-${ws.id}`,
      label: `Switch to Workspace: ${ws.name} (${ws.engine.toUpperCase()})`,
      category: "Workspaces",
      icon: <Database className="w-4 h-4 text-sky-400" />,
      run: () => {
        void selectWorkspace(ws.id);
      },
    });
  }

  actions.push({
    id: "create-ws",
    label: "Create New Database Connection Workspace",
    category: "Global",
    icon: <Plus className="w-4 h-4 text-emerald-400" />,
    run: () => {
      openConnectionModal(null);
    },
  });

  const filtered = actions.filter(
    (a) =>
      !q ||
      a.label.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q)
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-start justify-center pt-24 p-4"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-3">
          <Search className="w-4 h-4 text-emerald-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to workspace, table, collection, ER diagram, or command..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          <button
            onClick={() => setCommandPaletteOpen(false)}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {filtered.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                item.run();
                setCommandPaletteOpen(false);
              }}
              className="w-full px-3 py-2.5 rounded-xl hover:bg-zinc-800 flex items-center justify-between gap-3 text-left transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {item.icon}
                <span className="text-xs font-medium text-zinc-100 truncate">
                  {item.label}
                </span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                {item.category}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
