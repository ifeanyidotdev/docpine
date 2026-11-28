import { create } from "zustand";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauriRuntime } from "../lib/ipc";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "error";

interface UpdateStoreState {
  status: UpdateStatus;
  updateVersion: string | null;
  error: string | null;

  startBackgroundCheckAndDownload: () => Promise<void>;
  relaunchApp: () => Promise<void>;
}

export const useUpdateStore = create<UpdateStoreState>((set, get) => ({
  status: "idle",
  updateVersion: null,
  error: null,

  startBackgroundCheckAndDownload: async () => {
    if (!isTauriRuntime()) {
      return;
    }

    if (get().status === "downloading" || get().status === "ready") {
      return;
    }

    set({ status: "checking", error: null });

    try {
      const update = await check();

      if (!update || !update.available) {
        set({ status: "idle", updateVersion: null });
        return;
      }

      set({
        status: "downloading",
        updateVersion: update.version,
      });

      // Download and install update payload silently in the background
      await update.downloadAndInstall();

      // Download and signature verification completed, app is ready to restart
      set({ status: "ready" });
    } catch (err: any) {
      console.warn("Background update check/download failed:", err);
      set({
        status: "error",
        error: err?.message || String(err),
      });
    }
  },

  relaunchApp: async () => {
    if (!isTauriRuntime()) return;
    try {
      await relaunch();
    } catch (err) {
      console.error("Failed to relaunch application:", err);
    }
  },
}));
