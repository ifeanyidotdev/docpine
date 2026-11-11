import React, { useEffect } from "react";
import { WorkspaceRail } from "./components/shell/WorkspaceRail";
import { WorkspaceLaunchpad } from "./components/shell/WorkspaceLaunchpad";
import { ActiveWorkspaceView } from "./components/workspace/ActiveWorkspaceView";
import { WorkspaceConnectionModal } from "./components/modals/WorkspaceConnectionModal";
import { CommandPaletteModal } from "./components/modals/CommandPaletteModal";
import { ImportExportModal } from "./components/io/ImportExportModal";
import { useWorkspaceStore } from "./store/useWorkspaceStore";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export default function App() {
  const {
    workspaces,
    activeWorkspaceId,
    toasts,
    loadWorkspaces,
    selectWorkspace,
    setCommandPaletteOpen,
    dismissToast,
  } = useWorkspaceStore();

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  // Global keyboard shortcuts: Cmd+K (Command Palette), Cmd+0 (Launchpad), Cmd+1..9 (Switch Workspace)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        void selectWorkspace(null);
      } else if (
        (e.metaKey || e.ctrlKey) &&
        e.key >= "1" &&
        e.key <= "9"
      ) {
        const idx = Number(e.key) - 1;
        if (workspaces[idx]) {
          e.preventDefault();
          void selectWorkspace(workspaces[idx].id);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [workspaces, selectWorkspace, setCommandPaletteOpen]);

  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) || null;

  return (
    <div className="h-screen w-screen flex bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Left Dock: Workspace Switcher Rail */}
      <WorkspaceRail />

      {/* Main Content: Either Home Launchpad or Isolated Workspace View */}
      {activeWorkspace ? (
        <ActiveWorkspaceView
          key={activeWorkspace.id}
          workspace={activeWorkspace}
        />
      ) : (
        <WorkspaceLaunchpad />
      )}

      {/* Global Modals */}
      <WorkspaceConnectionModal />
      <CommandPaletteModal />
      <ImportExportModal />

      {/* Toast Notification Stack */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto p-3.5 rounded-xl bg-zinc-900/95 border border-zinc-800 shadow-2xl flex items-start gap-2.5 backdrop-blur-md"
            >
              {t.kind === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : t.kind === "error" ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-zinc-100">
                  {t.title}
                </div>
                {t.message && (
                  <div className="text-[11px] text-zinc-400 mt-0.5 break-all">
                    {t.message}
                  </div>
                )}
              </div>
              <button
                onClick={() => dismissToast(t.id)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
