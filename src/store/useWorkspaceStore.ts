import { create } from "zustand";
import { ipc, parseAppError } from "../lib/ipc";
import type {
  CommitMode,
  DataViewMode,
  QueryHistoryRecord,
  RecordUpdate,
  SafetyMode,
  SaveWorkspaceInput,
  SavedQueryRecord,
  SchemaOverview,
  TabStagedState,
  WorkspaceConfig,
  WorkspaceTab,
  WorkspaceTabKind,
} from "../types/docpine";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface ToastNotice {
  id: string;
  kind: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
}

export interface ImportExportModalTarget {
  mode: "import" | "export";
  workspaceId: string;
  database: string;
  schema?: string | null;
  container: string;
  rows?: Record<string, any>[] | null;
}

interface WorkspaceStoreState {
  workspaces: WorkspaceConfig[];
  activeWorkspaceId: string | null;
  connectionStatus: Record<string, ConnectionStatus>;
  connectionLatency: Record<string, number | undefined>;
  connectionError: Record<string, string | undefined>;

  databasesByWorkspace: Record<string, string[]>;
  activeDatabaseByWorkspace: Record<string, string>;
  schemaByWorkspaceDb: Record<string, SchemaOverview>;
  schemaLoading: Record<string, boolean>;

  tabsByWorkspace: Record<string, WorkspaceTab[]>;
  activeTabIdByWorkspace: Record<string, string | null>;
  stagedByTab: Record<string, TabStagedState>;
  refreshTokenByTab: Record<string, number>;

  savedQueriesByWorkspace: Record<string, SavedQueryRecord[]>;
  historyByWorkspace: Record<string, QueryHistoryRecord[]>;

  connectionModalOpen: boolean;
  editingWorkspace: WorkspaceConfig | null;
  commandPaletteOpen: boolean;
  importExportTarget: ImportExportModalTarget | null;
  toasts: ToastNotice[];

  // Actions
  loadWorkspaces: () => Promise<void>;
  selectWorkspace: (workspaceId: string | null) => Promise<void>;
  openConnectionModal: (workspace?: WorkspaceConfig | null) => void;
  closeConnectionModal: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setImportExportTarget: (target: ImportExportModalTarget | null) => void;

  saveWorkspace: (input: SaveWorkspaceInput) => Promise<WorkspaceConfig>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  updateWorkspaceModes: (
    workspaceId: string,
    commitMode?: CommitMode,
    safetyMode?: SafetyMode
  ) => Promise<void>;

  connectToWorkspace: (workspaceId: string) => Promise<void>;
  disconnectFromWorkspace: (workspaceId: string) => Promise<void>;
  switchDatabase: (workspaceId: string, database: string) => Promise<void>;
  refreshSchema: (workspaceId: string, database?: string) => Promise<void>;

  openTab: (
    workspaceId: string,
    tab: Omit<WorkspaceTab, "id" | "workspaceId">
  ) => string;
  closeTab: (workspaceId: string, tabId: string) => void;
  setActiveTab: (workspaceId: string, tabId: string) => void;
  updateTab: (
    workspaceId: string,
    tabId: string,
    patch: Partial<WorkspaceTab>
  ) => void;
  setTabViewMode: (
    workspaceId: string,
    tabId: string,
    viewMode: DataViewMode
  ) => void;
  bumpTabRefresh: (tabId: string) => void;

  // Staged mutation actions
  stageInsertRow: (tabId: string, initialRow?: Record<string, any>) => string;
  updateStagedInsertRow: (
    tabId: string,
    draftId: string,
    row: Record<string, any>
  ) => void;
  removeStagedInsertRow: (tabId: string, draftId: string) => void;
  stageRecordCellUpdate: (
    tabId: string,
    rowKey: string,
    identity: Record<string, any>,
    field: string,
    newValue: any,
    originalValue: any
  ) => void;
  stageFullRecordUpdate: (
    tabId: string,
    rowKey: string,
    identity: Record<string, any>,
    changes: Record<string, any>,
    original: Record<string, any>
  ) => void;
  toggleStageDeleteRecord: (
    tabId: string,
    rowKey: string,
    identity: Record<string, any>
  ) => void;
  discardTabStagedChanges: (tabId: string) => void;

  // Queries & History
  loadSavedQueriesAndHistory: (workspaceId: string) => Promise<void>;
  saveQueryToWorkspace: (params: {
    id?: string | null;
    workspaceId: string;
    title: string;
    folder?: string | null;
    database: string;
    queryText: string;
  }) => Promise<void>;
  deleteSavedQueryFromWorkspace: (
    workspaceId: string,
    queryId: string
  ) => Promise<void>;

  pushToast: (toast: Omit<ToastNotice, "id">) => void;
  dismissToast: (id: string) => void;
}

const emptyStaged = (): TabStagedState => ({
  inserts: {},
  updates: {},
  deletes: {},
});

function persistTabs(workspaceId: string, tabs: WorkspaceTab[]) {
  void ipc.saveWorkspaceTabs(workspaceId, JSON.stringify(tabs));
}

export const useWorkspaceStore = create<WorkspaceStoreState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  connectionStatus: {},
  connectionLatency: {},
  connectionError: {},

  databasesByWorkspace: {},
  activeDatabaseByWorkspace: {},
  schemaByWorkspaceDb: {},
  schemaLoading: {},

  tabsByWorkspace: {},
  activeTabIdByWorkspace: {},
  stagedByTab: {},
  refreshTokenByTab: {},

  savedQueriesByWorkspace: {},
  historyByWorkspace: {},

  connectionModalOpen: false,
  editingWorkspace: null,
  commandPaletteOpen: false,
  importExportTarget: null,
  toasts: [],

  loadWorkspaces: async () => {
    try {
      const list = await ipc.listWorkspaces();
      set({ workspaces: list });
    } catch (err) {
      const parsed = parseAppError(err);
      get().pushToast({
        kind: "error",
        title: "Failed to load workspaces",
        message: parsed.message,
      });
    }
  },

  selectWorkspace: async (workspaceId) => {
    set({ activeWorkspaceId: workspaceId });
    if (!workspaceId) return;

    const ws = get().workspaces.find((w) => w.id === workspaceId);
    if (!ws) return;

    // Restore persisted tabs if not loaded yet
    if (!get().tabsByWorkspace[workspaceId]) {
      try {
        const rawTabs = await ipc.getWorkspaceTabs(workspaceId);
        if (rawTabs) {
          const parsedTabs: WorkspaceTab[] = JSON.parse(rawTabs);
          if (Array.isArray(parsedTabs) && parsedTabs.length > 0) {
            set((s) => ({
              tabsByWorkspace: {
                ...s.tabsByWorkspace,
                [workspaceId]: parsedTabs,
              },
              activeTabIdByWorkspace: {
                ...s.activeTabIdByWorkspace,
                [workspaceId]: parsedTabs[0].id,
              },
            }));
          }
        }
      } catch {
        // ignore tab restore error
      }
    }

    const status = get().connectionStatus[workspaceId];
    if (!status || status === "disconnected") {
      await get().connectToWorkspace(workspaceId);
    }
  },

  openConnectionModal: (workspace = null) => {
    set({ connectionModalOpen: true, editingWorkspace: workspace });
  },

  closeConnectionModal: () => {
    set({ connectionModalOpen: false, editingWorkspace: null });
  },

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  setImportExportTarget: (target) => set({ importExportTarget: target }),

  saveWorkspace: async (input) => {
    const saved = await ipc.saveWorkspace(input);
    const list = await ipc.listWorkspaces();
    set({
      workspaces: list,
      connectionModalOpen: false,
      editingWorkspace: null,
    });
    get().pushToast({
      kind: "success",
      title: input.id ? "Workspace updated" : "Workspace created",
      message: `${saved.name} (${saved.engine.toUpperCase()}) is ready.`,
    });
    return saved;
  },

  deleteWorkspace: async (workspaceId) => {
    await ipc.deleteWorkspace(workspaceId);
    const list = await ipc.listWorkspaces();
    set((s) => ({
      workspaces: list,
      activeWorkspaceId:
        s.activeWorkspaceId === workspaceId ? null : s.activeWorkspaceId,
    }));
    get().pushToast({
      kind: "info",
      title: "Workspace removed",
    });
  },

  updateWorkspaceModes: async (workspaceId, commitMode, safetyMode) => {
    const updated = await ipc.updateWorkspaceModes(
      workspaceId,
      commitMode,
      safetyMode
    );
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId ? updated : w
      ),
    }));
    get().pushToast({
      kind: "info",
      title: "Workspace mode updated",
      message: `Commit: ${updated.commitMode.toUpperCase()} • Safety: ${updated.safetyMode.toUpperCase()}`,
    });
  },

  connectToWorkspace: async (workspaceId) => {
    const ws = get().workspaces.find((w) => w.id === workspaceId);
    if (!ws) return;

    set((s) => ({
      connectionStatus: { ...s.connectionStatus, [workspaceId]: "connecting" },
      connectionError: { ...s.connectionError, [workspaceId]: undefined },
    }));

    try {
      const latency = await ipc.connectWorkspace(workspaceId);
      const dbs = await ipc.listDatabases(workspaceId);
      const activeDb =
        get().activeDatabaseByWorkspace[workspaceId] ||
        ws.defaultDatabase ||
        dbs[0] ||
        "";

      set((s) => ({
        connectionStatus: { ...s.connectionStatus, [workspaceId]: "connected" },
        connectionLatency: { ...s.connectionLatency, [workspaceId]: latency },
        databasesByWorkspace: { ...s.databasesByWorkspace, [workspaceId]: dbs },
        activeDatabaseByWorkspace: {
          ...s.activeDatabaseByWorkspace,
          [workspaceId]: activeDb,
        },
      }));

      await Promise.all([
        get().refreshSchema(workspaceId, activeDb),
        get().loadSavedQueriesAndHistory(workspaceId),
      ]);
    } catch (err) {
      const parsed = parseAppError(err);
      set((s) => ({
        connectionStatus: { ...s.connectionStatus, [workspaceId]: "error" },
        connectionError: {
          ...s.connectionError,
          [workspaceId]: parsed.message,
        },
      }));
      get().pushToast({
        kind: "error",
        title: `Could not connect to ${ws.name}`,
        message: parsed.message,
      });
    }
  },

  disconnectFromWorkspace: async (workspaceId) => {
    await ipc.disconnectWorkspace(workspaceId);
    set((s) => ({
      connectionStatus: {
        ...s.connectionStatus,
        [workspaceId]: "disconnected",
      },
      connectionLatency: { ...s.connectionLatency, [workspaceId]: undefined },
    }));
  },

  switchDatabase: async (workspaceId, database) => {
    set((s) => ({
      activeDatabaseByWorkspace: {
        ...s.activeDatabaseByWorkspace,
        [workspaceId]: database,
      },
    }));
    await get().refreshSchema(workspaceId, database);
  },

  refreshSchema: async (workspaceId, database) => {
    const ws = get().workspaces.find((w) => w.id === workspaceId);
    if (!ws) return;
    const db =
      database ??
      get().activeDatabaseByWorkspace[workspaceId] ??
      ws.defaultDatabase;
    if (!db) return;

    const cacheKey = `${workspaceId}:${db}`;
    set((s) => ({
      schemaLoading: { ...s.schemaLoading, [cacheKey]: true },
    }));

    try {
      const overview = await ipc.getSchemaOverview(workspaceId, db);
      set((s) => ({
        schemaByWorkspaceDb: { ...s.schemaByWorkspaceDb, [cacheKey]: overview },
        schemaLoading: { ...s.schemaLoading, [cacheKey]: false },
      }));

      // If workspace has no open tabs yet, open a default tab for immediate exploration
      const existingTabs = get().tabsByWorkspace[workspaceId] || [];
      if (existingTabs.length === 0) {
        if (overview.containers.length > 0) {
          const first = overview.containers[0];
          get().openTab(workspaceId, {
            kind: "data",
            title: first.name,
            database: db,
            schema: first.schema,
            container: first.name,
            dataViewMode: "table",
          });
        } else {
          get().openTab(workspaceId, {
            kind: "query",
            title: "Query 1",
            database: db,
            queryText:
              ws.engine === "mongodb"
                ? JSON.stringify(
                    {
                      action: "find",
                      collection: "users",
                      filter: {},
                      limit: 50,
                    },
                    null,
                    2
                  )
                : "SELECT * FROM information_schema.tables LIMIT 25;",
          });
        }
      }
    } catch (err) {
      set((s) => ({
        schemaLoading: { ...s.schemaLoading, [cacheKey]: false },
      }));
      const parsed = parseAppError(err);
      get().pushToast({
        kind: "error",
        title: "Schema introspection error",
        message: parsed.message,
      });
    }
  },

  openTab: (workspaceId, tabInput) => {
    const existing = get().tabsByWorkspace[workspaceId] || [];
    if (tabInput.kind === "data" || tabInput.kind === "structure") {
      const found = existing.find(
        (t) =>
          t.kind === tabInput.kind &&
          t.database === tabInput.database &&
          (t.schema || null) === (tabInput.schema || null) &&
          t.container === tabInput.container
      );
      if (found) {
        set((s) => ({
          activeTabIdByWorkspace: {
            ...s.activeTabIdByWorkspace,
            [workspaceId]: found.id,
          },
        }));
        return found.id;
      }
    }
    if (tabInput.kind === "erd") {
      const foundErd = existing.find(
        (t) => t.kind === "erd" && t.database === tabInput.database
      );
      if (foundErd) {
        set((s) => ({
          activeTabIdByWorkspace: {
            ...s.activeTabIdByWorkspace,
            [workspaceId]: foundErd.id,
          },
        }));
        return foundErd.id;
      }
    }

    const id = crypto.randomUUID();
    const newTab: WorkspaceTab = {
      id,
      workspaceId,
      ...tabInput,
    };
    const nextTabs = [...existing, newTab];
    set((s) => ({
      tabsByWorkspace: { ...s.tabsByWorkspace, [workspaceId]: nextTabs },
      activeTabIdByWorkspace: {
        ...s.activeTabIdByWorkspace,
        [workspaceId]: id,
      },
    }));
    persistTabs(workspaceId, nextTabs);
    return id;
  },

  closeTab: (workspaceId, tabId) => {
    const existing = get().tabsByWorkspace[workspaceId] || [];
    const idx = existing.findIndex((t) => t.id === tabId);
    const nextTabs = existing.filter((t) => t.id !== tabId);
    const currentActive = get().activeTabIdByWorkspace[workspaceId];
    let nextActive = currentActive;
    if (currentActive === tabId) {
      nextActive =
        nextTabs[Math.min(idx, nextTabs.length - 1)]?.id ??
        nextTabs[0]?.id ??
        null;
    }

    set((s) => {
      const nextStaged = { ...s.stagedByTab };
      delete nextStaged[tabId];
      return {
        tabsByWorkspace: { ...s.tabsByWorkspace, [workspaceId]: nextTabs },
        activeTabIdByWorkspace: {
          ...s.activeTabIdByWorkspace,
          [workspaceId]: nextActive,
        },
        stagedByTab: nextStaged,
      };
    });
    persistTabs(workspaceId, nextTabs);
  },

  setActiveTab: (workspaceId, tabId) => {
    set((s) => ({
      activeTabIdByWorkspace: {
        ...s.activeTabIdByWorkspace,
        [workspaceId]: tabId,
      },
    }));
  },

  updateTab: (workspaceId, tabId, patch) => {
    const existing = get().tabsByWorkspace[workspaceId] || [];
    const nextTabs = existing.map((t) =>
      t.id === tabId ? { ...t, ...patch } : t
    );
    set((s) => ({
      tabsByWorkspace: { ...s.tabsByWorkspace, [workspaceId]: nextTabs },
    }));
    persistTabs(workspaceId, nextTabs);
  },

  setTabViewMode: (workspaceId, tabId, viewMode) => {
    get().updateTab(workspaceId, tabId, { dataViewMode: viewMode });
  },

  bumpTabRefresh: (tabId) => {
    set((s) => ({
      refreshTokenByTab: {
        ...s.refreshTokenByTab,
        [tabId]: (s.refreshTokenByTab[tabId] || 0) + 1,
      },
    }));
  },

  stageInsertRow: (tabId, initialRow = {}) => {
    const draftId = `draft_${crypto.randomUUID().slice(0, 8)}`;
    set((s) => {
      const curr = s.stagedByTab[tabId] || emptyStaged();
      return {
        stagedByTab: {
          ...s.stagedByTab,
          [tabId]: {
            ...curr,
            inserts: {
              [draftId]: initialRow,
              ...curr.inserts,
            },
          },
        },
      };
    });
    return draftId;
  },

  updateStagedInsertRow: (tabId, draftId, row) => {
    set((s) => {
      const curr = s.stagedByTab[tabId] || emptyStaged();
      return {
        stagedByTab: {
          ...s.stagedByTab,
          [tabId]: {
            ...curr,
            inserts: {
              ...curr.inserts,
              [draftId]: row,
            },
          },
        },
      };
    });
  },

  removeStagedInsertRow: (tabId, draftId) => {
    set((s) => {
      const curr = s.stagedByTab[tabId] || emptyStaged();
      const nextInserts = { ...curr.inserts };
      delete nextInserts[draftId];
      return {
        stagedByTab: {
          ...s.stagedByTab,
          [tabId]: {
            ...curr,
            inserts: nextInserts,
          },
        },
      };
    });
  },

  stageRecordCellUpdate: (
    tabId,
    rowKey,
    identity,
    field,
    newValue,
    originalValue
  ) => {
    set((s) => {
      const curr = s.stagedByTab[tabId] || emptyStaged();
      const existing: RecordUpdate = curr.updates[rowKey] || {
        identity,
        changes: {},
        original: {},
      };

      const nextChanges = { ...existing.changes };
      const nextOriginal = { ...existing.original };
      if (!(field in nextOriginal)) {
        nextOriginal[field] = originalValue;
      }

      if (JSON.stringify(newValue) === JSON.stringify(nextOriginal[field])) {
        delete nextChanges[field];
      } else {
        nextChanges[field] = newValue;
      }

      const nextUpdates = { ...curr.updates };
      if (Object.keys(nextChanges).length === 0) {
        delete nextUpdates[rowKey];
      } else {
        nextUpdates[rowKey] = {
          identity,
          changes: nextChanges,
          original: nextOriginal,
        };
      }

      return {
        stagedByTab: {
          ...s.stagedByTab,
          [tabId]: {
            ...curr,
            updates: nextUpdates,
          },
        },
      };
    });
  },

  stageFullRecordUpdate: (tabId, rowKey, identity, changes, original) => {
    set((s) => {
      const curr = s.stagedByTab[tabId] || emptyStaged();
      const nextUpdates = { ...curr.updates };
      if (Object.keys(changes).length === 0) {
        delete nextUpdates[rowKey];
      } else {
        nextUpdates[rowKey] = { identity, changes, original };
      }
      return {
        stagedByTab: {
          ...s.stagedByTab,
          [tabId]: {
            ...curr,
            updates: nextUpdates,
          },
        },
      };
    });
  },

  toggleStageDeleteRecord: (tabId, rowKey, identity) => {
    set((s) => {
      const curr = s.stagedByTab[tabId] || emptyStaged();
      const nextDeletes = { ...curr.deletes };
      if (nextDeletes[rowKey]) {
        delete nextDeletes[rowKey];
      } else {
        nextDeletes[rowKey] = identity;
      }
      return {
        stagedByTab: {
          ...s.stagedByTab,
          [tabId]: {
            ...curr,
            deletes: nextDeletes,
          },
        },
      };
    });
  },

  discardTabStagedChanges: (tabId) => {
    set((s) => ({
      stagedByTab: {
        ...s.stagedByTab,
        [tabId]: emptyStaged(),
      },
    }));
  },

  loadSavedQueriesAndHistory: async (workspaceId) => {
    try {
      const [saved, history] = await Promise.all([
        ipc.listSavedQueries(workspaceId),
        ipc.listQueryHistory(workspaceId, 100),
      ]);
      set((s) => ({
        savedQueriesByWorkspace: {
          ...s.savedQueriesByWorkspace,
          [workspaceId]: saved,
        },
        historyByWorkspace: {
          ...s.historyByWorkspace,
          [workspaceId]: history,
        },
      }));
    } catch {
      // ignore
    }
  },

  saveQueryToWorkspace: async (params) => {
    await ipc.saveWorkspaceQuery(params);
    await get().loadSavedQueriesAndHistory(params.workspaceId);
    get().pushToast({
      kind: "success",
      title: "Query saved to workspace",
      message: params.title,
    });
  },

  deleteSavedQueryFromWorkspace: async (workspaceId, queryId) => {
    await ipc.deleteSavedQuery(queryId);
    await get().loadSavedQueriesAndHistory(workspaceId);
  },

  pushToast: (toast) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => {
      get().dismissToast(id);
    }, 4500);
  },

  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));
