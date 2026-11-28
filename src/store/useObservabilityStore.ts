import { create } from "zustand";
import { ipc, parseAppError } from "../lib/ipc";
import type {
  PollingIntervalMs,
  WorkspaceObservabilitySnapshot,
} from "../types/docpine";

const MAX_SAMPLES = 60;

export interface ObservabilitySample {
  timestampMs: number;
  snapshot: WorkspaceObservabilitySnapshot;
  opsPerSec: number | null;
}

interface ObservabilityStoreState {
  samplesByKey: Record<string, ObservabilitySample[]>;
  loadingByKey: Record<string, boolean>;
  errorByKey: Record<string, string | null>;
  pollingIntervalByWorkspace: Record<string, PollingIntervalMs>;

  pollNow: (workspaceId: string, database: string) => Promise<void>;
  setPollingInterval: (workspaceId: string, intervalMs: PollingIntervalMs) => void;
  clearWorkspaceSamples: (workspaceId: string) => void;
}

export function observabilityKey(workspaceId: string, database: string): string {
  return `${workspaceId}:${database}`;
}

export const useObservabilityStore = create<ObservabilityStoreState>(
  (set, get) => ({
    samplesByKey: {},
    loadingByKey: {},
    errorByKey: {},
    pollingIntervalByWorkspace: {},

    pollNow: async (workspaceId, database) => {
      const key = observabilityKey(workspaceId, database);
      if (get().loadingByKey[key]) return;

      set((s) => ({
        loadingByKey: { ...s.loadingByKey, [key]: true },
      }));

      try {
        const snapshot = await ipc.getWorkspaceObservability(
          workspaceId,
          database
        );
        const nowMs = Date.now();

        set((s) => {
          const prevList = s.samplesByKey[key] || [];
          const prev = prevList[prevList.length - 1];

          let opsPerSec: number | null = null;
          if (
            prev &&
            typeof snapshot.server.totalOperations === "number" &&
            typeof prev.snapshot.server.totalOperations === "number"
          ) {
            const elapsedSec = (nowMs - prev.timestampMs) / 1000;
            const deltaOps =
              snapshot.server.totalOperations -
              prev.snapshot.server.totalOperations;
            if (elapsedSec > 0.2 && deltaOps >= 0) {
              opsPerSec = deltaOps / elapsedSec;
            }
          }

          const nextSample: ObservabilitySample = {
            timestampMs: nowMs,
            snapshot,
            opsPerSec,
          };

          const nextList = [...prevList, nextSample].slice(-MAX_SAMPLES);

          return {
            samplesByKey: { ...s.samplesByKey, [key]: nextList },
            loadingByKey: { ...s.loadingByKey, [key]: false },
            errorByKey: { ...s.errorByKey, [key]: null },
          };
        });
      } catch (err) {
        const parsed = parseAppError(err);
        set((s) => ({
          loadingByKey: { ...s.loadingByKey, [key]: false },
          errorByKey: { ...s.errorByKey, [key]: parsed.message },
        }));
      }
    },

    setPollingInterval: (workspaceId, intervalMs) => {
      set((s) => ({
        pollingIntervalByWorkspace: {
          ...s.pollingIntervalByWorkspace,
          [workspaceId]: intervalMs,
        },
      }));
    },

    clearWorkspaceSamples: (workspaceId) => {
      const prefix = `${workspaceId}:`;
      set((s) => {
        const nextSamples = { ...s.samplesByKey };
        const nextLoading = { ...s.loadingByKey };
        const nextError = { ...s.errorByKey };
        for (const k of Object.keys(nextSamples)) {
          if (k.startsWith(prefix)) {
            delete nextSamples[k];
            delete nextLoading[k];
            delete nextError[k];
          }
        }
        return {
          samplesByKey: nextSamples,
          loadingByKey: nextLoading,
          errorByKey: nextError,
        };
      });
    },
  })
);
