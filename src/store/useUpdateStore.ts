import { create } from "zustand";
import { getVersion } from "@tauri-apps/api/app";
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauriRuntime } from "../lib/ipc";
import { useWorkspaceStore } from "./useWorkspaceStore";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "up_to_date"
  | "error";

interface UpdateStoreState {
  status: UpdateStatus;
  currentVersion: string | null;
  updateVersion: string | null;
  downloadProgress: number | null;
  lastCheckedAt: string | null;
  error: string | null;

  loadCurrentVersion: () => Promise<void>;
  checkForUpdates: (options?: { manual?: boolean }) => Promise<void>;
  startBackgroundCheckAndDownload: () => Promise<void>;
  relaunchApp: () => Promise<void>;
}

export const useUpdateStore = create<UpdateStoreState>((set, get) => ({
  status: "idle",
  currentVersion: null,
  updateVersion: null,
  downloadProgress: null,
  lastCheckedAt: null,
  error: null,

  loadCurrentVersion: async () => {
    if (!isTauriRuntime()) {
      set({ currentVersion: "0.1.0" });
      return;
    }
    try {
      const ver = await getVersion();
      set({ currentVersion: ver });
    } catch {
      set({ currentVersion: "0.1.0" });
    }
  },

  checkForUpdates: async (options) => {
    const manual = Boolean(options?.manual);
    const pushToast = useWorkspaceStore.getState().pushToast;

    if (!isTauriRuntime()) {
      if (manual) {
        pushToast({
          kind: "info",
          title: "Updates unavailable in browser preview",
          message: "Run the native Docpine desktop app to check for updates.",
        });
      }
      return;
    }

    const currentStatus = get().status;
    if (currentStatus === "checking" || currentStatus === "downloading") {
      return;
    }

    if (currentStatus === "ready") {
      if (manual) {
        pushToast({
          kind: "success",
          title: `Docpine ${get().updateVersion || ""} is ready`,
          message: "Click 'Restart to Update' in the top bar to apply.",
        });
      }
      return;
    }

    set({ status: "checking", error: null, downloadProgress: null });

    try {
      const update = await check();
      const checkedAt = new Date().toISOString();

      if (!update) {
        set({
          status: "up_to_date",
          updateVersion: null,
          lastCheckedAt: checkedAt,
        });
        if (manual) {
          const ver = get().currentVersion;
          pushToast({
            kind: "success",
            title: "Docpine is up to date",
            message: ver ? `You are running the latest version (v${ver}).` : undefined,
          });
        }
        return;
      }

      set({
        status: "downloading",
        updateVersion: update.version,
        downloadProgress: 0,
        lastCheckedAt: checkedAt,
      });

      if (manual) {
        pushToast({
          kind: "info",
          title: `Downloading Docpine v${update.version}`,
          message: "The update is downloading in the background.",
        });
      }

      let contentLength = 0;
      let downloaded = 0;

      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          contentLength = event.data.contentLength ?? 0;
          downloaded = 0;
          set({ downloadProgress: 0 });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (contentLength > 0) {
            const pct = Math.min(
              99,
              Math.round((downloaded / contentLength) * 100)
            );
            set({ downloadProgress: pct });
          }
        } else if (event.event === "Finished") {
          set({ downloadProgress: 100 });
        }
      });

      set({ status: "ready", downloadProgress: 100 });

      if (manual) {
        pushToast({
          kind: "success",
          title: `Docpine v${update.version} ready to install`,
          message: "Click 'Restart to Update' in the top bar to apply.",
        });
      }
    } catch (err: any) {
      const message = err?.message || String(err);
      console.warn("Update check/download failed:", err);
      set({
        status: "error",
        error: message,
        downloadProgress: null,
        lastCheckedAt: new Date().toISOString(),
      });
      if (manual) {
        pushToast({
          kind: "error",
          title: "Update check failed",
          message,
        });
      }
    }
  },

  startBackgroundCheckAndDownload: async () => {
    await get().checkForUpdates({ manual: false });
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
