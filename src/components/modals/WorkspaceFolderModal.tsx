import React, { useEffect, useState } from "react";
import { X, Folder, Check } from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { parseAppError } from "../../lib/ipc";

const FOLDER_COLORS = [
  { name: "Indigo", hex: "#6366f1" },
  { name: "Emerald", hex: "#10b981" },
  { name: "Sky", hex: "#0ea5e9" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Rose", hex: "#f43f5e" },
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Zinc", hex: "#71717a" },
];

export function WorkspaceFolderModal() {
  const {
    folderModalOpen,
    editingFolder,
    closeFolderModal,
    saveFolder,
  } = useWorkspaceStore();

  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!folderModalOpen) return;
    setError(null);
    if (editingFolder) {
      setName(editingFolder.name);
      setColor(editingFolder.color || "#6366f1");
    } else {
      setName("");
      setColor("#6366f1");
    }
  }, [folderModalOpen, editingFolder]);

  useEffect(() => {
    if (!folderModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFolderModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [folderModalOpen, closeFolderModal]);

  if (!folderModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a folder name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveFolder({
        id: editingFolder?.id ?? null,
        name: trimmed,
        color,
      });
    } catch (err) {
      setError(parseAppError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={closeFolderModal}
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div
          className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between"
          style={{ borderTop: `3px solid ${color}` }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center border"
              style={{
                backgroundColor: `${color}1F`,
                borderColor: `${color}55`,
              }}
            >
              <Folder className="w-4 h-4" style={{ color }} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100">
                {editingFolder ? "Edit Workspace Folder" : "New Workspace Folder"}
              </h2>
              <p className="text-[11px] text-zinc-400">
                Group related environments (e.g. Local, Staging, Prod)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeFolderModal}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              Folder Name
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Payments, Core API, Client X..."
              autoComplete="off"
              spellCheck={false}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">
              Folder Color
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {FOLDER_COLORS.map((swatch) => {
                const selected = color.toLowerCase() === swatch.hex;
                return (
                  <button
                    key={swatch.hex}
                    type="button"
                    title={swatch.name}
                    onClick={() => setColor(swatch.hex)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                      selected
                        ? "ring-2 ring-white/80 ring-offset-2 ring-offset-zinc-900 scale-105"
                        : "opacity-80 hover:opacity-100"
                    }`}
                    style={{ backgroundColor: swatch.hex }}
                  >
                    {selected && <Check className="w-3.5 h-3.5 text-zinc-950 stroke-[3]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-zinc-950/90 border-t border-zinc-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={closeFolderModal}
            className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-semibold text-zinc-950 transition-colors cursor-pointer disabled:opacity-50"
          >
            {editingFolder ? "Save Changes" : "Create Folder"}
          </button>
        </div>
      </form>
    </div>
  );
}
