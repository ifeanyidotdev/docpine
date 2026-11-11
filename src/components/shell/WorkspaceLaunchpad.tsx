import React, { useState } from "react";
import {
  Database,
  Plus,
  Search,
  Server,
  Shield,
  Lock,
  Zap,
  GitCommitHorizontal,
  Settings2,
  Trash2,
  ArrowUpRight,
  Layers,
  Terminal,
} from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { engineFullName } from "./WorkspaceRail";
import type { DatabaseEngine, EnvironmentTag } from "../../types/docpine";

export function WorkspaceLaunchpad() {
  const {
    workspaces,
    connectionStatus,
    connectionLatency,
    selectWorkspace,
    openConnectionModal,
    deleteWorkspace,
  } = useWorkspaceStore();

  const [search, setSearch] = useState("");
  const [engineFilter, setEngineFilter] = useState<DatabaseEngine | "all">(
    "all"
  );
  const [envFilter, setEnvFilter] = useState<EnvironmentTag | "all">("all");

  const filtered = workspaces.filter((ws) => {
    if (engineFilter !== "all" && ws.engine !== engineFilter) return false;
    if (envFilter !== "all" && ws.environment !== envFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        ws.name.toLowerCase().includes(q) ||
        ws.host.toLowerCase().includes(q) ||
        ws.defaultDatabase.toLowerCase().includes(q) ||
        ws.engine.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const envBadgeStyle = (env: EnvironmentTag) => {
    switch (env) {
      case "production":
        return "bg-rose-500/15 text-rose-300 border-rose-500/30";
      case "staging":
        return "bg-amber-500/15 text-amber-300 border-amber-500/30";
      case "development":
        return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
      case "local":
        return "bg-indigo-500/15 text-indigo-300 border-indigo-500/30";
    }
  };

  const engineBadgeStyle = (engine: DatabaseEngine) => {
    switch (engine) {
      case "postgres":
        return "bg-sky-500/15 text-sky-300 border-sky-500/30";
      case "mysql":
        return "bg-orange-500/15 text-orange-300 border-orange-500/30";
      case "mongodb":
        return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Hero Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <Database className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                Docpine Workspaces
              </h1>
            </div>
            <p className="text-sm text-zinc-400 mt-1.5">
              Each database connection opens as an isolated SQL or NoSQL
              workspace with staged diff previews, instant editing, and schema
              tools.
            </p>
          </div>

          <button
            onClick={() => openConnectionModal(null)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm shadow-lg shadow-emerald-950/50 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            New Connection Workspace
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter workspaces by name, host, database, or engine..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-zinc-900/90 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60"
            />
          </div>

          <div className="flex items-center gap-2">
            {(["all", "postgres", "mysql", "mongodb"] as const).map((eng) => (
              <button
                key={eng}
                onClick={() => setEngineFilter(eng)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  engineFilter === eng
                    ? "bg-zinc-800 text-white border-zinc-600"
                    : "bg-zinc-900/50 text-zinc-400 border-zinc-800/80 hover:text-zinc-200"
                }`}
              >
                {eng === "all"
                  ? "All Engines"
                  : eng === "postgres"
                    ? "PostgreSQL"
                    : eng === "mysql"
                      ? "MySQL"
                      : "MongoDB"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {(
              ["all", "production", "staging", "development", "local"] as const
            ).map((env) => (
              <button
                key={env}
                onClick={() => setEnvFilter(env)}
                className={`px-2.5 py-1.5 rounded-lg text-xs capitalize border transition-colors ${
                  envFilter === env
                    ? "bg-zinc-800 text-white border-zinc-600"
                    : "bg-zinc-900/40 text-zinc-400 border-zinc-800/60 hover:text-zinc-200"
                }`}
              >
                {env === "all" ? "All Envs" : env}
              </button>
            ))}
          </div>
        </div>

        {/* Workspaces Grid */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-12 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <Layers className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base font-semibold text-zinc-200">
                {workspaces.length === 0
                  ? "Create your first database workspace"
                  : "No matching workspaces"}
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Connect to PostgreSQL, MySQL / MariaDB, or MongoDB using a
                connection URI or credentials. Each workspace preserves its own
                open tabs, staged edits, and saved queries.
              </p>
            </div>
            <button
              onClick={() => openConnectionModal(null)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Database Connection
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((ws) => {
              const status = connectionStatus[ws.id] || "disconnected";
              const latency = connectionLatency[ws.id];

              return (
                <div
                  key={ws.id}
                  onClick={() => void selectWorkspace(ws.id)}
                  className="group relative rounded-2xl bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800/90 hover:border-zinc-700 p-5 transition-all cursor-pointer flex flex-col justify-between shadow-lg hover:shadow-xl"
                >
                  {/* Top Accent Line */}
                  <div
                    className="absolute inset-x-0 top-0 h-1 rounded-t-2xl"
                    style={{ backgroundColor: ws.accentColor }}
                  />

                  <div className="space-y-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md border ${engineBadgeStyle(
                              ws.engine
                            )}`}
                          >
                            {engineFullName(ws.engine)}
                          </span>
                          <span
                            className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded-md border ${envBadgeStyle(
                              ws.environment
                            )}`}
                          >
                            {ws.environment}
                          </span>
                        </div>
                        <h3 className="text-base font-semibold text-zinc-100 mt-2 group-hover:text-emerald-300 transition-colors flex items-center gap-1.5">
                          {ws.name}
                          <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-400" />
                        </h3>
                      </div>

                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => openConnectionModal(ws)}
                          title="Edit Workspace Connection"
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                        >
                          <Settings2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => void deleteWorkspace(ws.id)}
                          title="Delete Workspace"
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Host & Default Database */}
                    <div className="space-y-1.5 text-xs text-zinc-400 font-mono bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/60">
                      <div className="flex items-center gap-2 truncate">
                        <Server className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        <span className="truncate">
                          {ws.username ? `${ws.username}@` : ""}
                          {ws.host}:{ws.port}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 truncate">
                        <Terminal className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        <span className="truncate text-zinc-300">
                          db: {ws.defaultDatabase || "(default)"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Footer Pills */}
                  <div className="flex items-center justify-between pt-4 mt-4 border-t border-zinc-800/70 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800/80 text-zinc-300">
                        {ws.commitMode === "staged" ? (
                          <>
                            <GitCommitHorizontal className="w-3 h-3 text-emerald-400" />
                            Staged Diff
                          </>
                        ) : (
                          <>
                            <Zap className="w-3 h-3 text-amber-400" />
                            Immediate
                          </>
                        )}
                      </span>

                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800/80 text-zinc-300">
                        {ws.safetyMode === "read_only" ? (
                          <>
                            <Lock className="w-3 h-3 text-amber-400" />
                            Read-Only
                          </>
                        ) : ws.safetyMode === "safe" ? (
                          <>
                            <Shield className="w-3 h-3 text-sky-400" />
                            Safe Guard
                          </>
                        ) : (
                          "Standard"
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          status === "connected"
                            ? "bg-emerald-400"
                            : status === "connecting"
                              ? "bg-amber-400 animate-pulse"
                              : status === "error"
                                ? "bg-rose-500"
                                : "bg-zinc-600"
                        }`}
                      />
                      <span className="text-zinc-400">
                        {status === "connected"
                          ? latency !== undefined
                            ? `${latency}ms`
                            : "Live"
                          : status === "connecting"
                            ? "Connecting..."
                            : "Open"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
