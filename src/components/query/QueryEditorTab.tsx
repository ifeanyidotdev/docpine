import React, { useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { format as formatSql } from "sql-formatter";
import { handleMonacoBeforeMount, DOCPINE_THEME_NAME } from "../../lib/monacoTheme";
import {
  Play,
  Bookmark,
  Download,
  Table2,
  Braces,
  Loader2,
  ShieldAlert,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  AlignLeft,
  Edit3,
  Lock,
} from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { ipc, parseAppError } from "../../lib/ipc";
import { DataTableGrid, buildRowIdentity } from "../data/DataTableGrid";
import { StagedChangesBar } from "../data/StagedChangesBar";
import { RowInspectorDrawer } from "../data/RowInspectorDrawer";
import type {
  ColumnMeta,
  ContainerSummary,
  QueryExecutionResult,
  RecordUpdate,
  TabStagedState,
  WorkspaceConfig,
  WorkspaceTab,
} from "../../types/docpine";

interface QueryEditorTabProps {
  workspace: WorkspaceConfig;
  tab: WorkspaceTab;
}

const MONGO_TEMPLATES = [
  {
    label: "find()",
    code: JSON.stringify(
      {
        action: "find",
        collection: "users",
        filter: {},
        sort: { _id: -1 },
        limit: 50,
      },
      null,
      2
    ),
  },
  {
    label: "aggregate()",
    code: JSON.stringify(
      {
        action: "aggregate",
        collection: "orders",
        pipeline: [
          { $match: {} },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ],
      },
      null,
      2
    ),
  },
  {
    label: "runCommand (dbStats)",
    code: JSON.stringify(
      {
        action: "runCommand",
        command: { dbStats: 1 },
      },
      null,
      2
    ),
  },
];

const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "INSERT INTO", "UPDATE", "DELETE FROM",
  "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "FULL OUTER JOIN",
  "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET", "UNION ALL",
  "CREATE TABLE", "ALTER TABLE", "DROP TABLE", "INDEX", "PRIMARY KEY",
  "AND", "OR", "NOT", "IN", "LIKE", "ILIKE", "IS NULL", "IS NOT NULL",
  "COUNT", "SUM", "AVG", "MIN", "MAX", "COALESCE", "CASE", "WHEN", "THEN", "ELSE", "END",
  "DISTINCT", "AS", "ON", "CASCADE", "RETURNING"
];

export function inferTableFromQuery(
  query: string,
  containers: ContainerSummary[] = []
): { container: string; schema?: string | null } | null {
  const clean = query.trim().replace(/\/\*[\s\S]*?\*\/|--.*$/gm, "");
  // Match simple SELECT ... FROM [schema.]table
  const match = clean.match(/\bFROM\s+([`"'\w]+(?:\.[`"'\w]+)?)/i);
  if (!match) return null;
  const raw = match[1].replace(/[`"']/g, "");
  if (raw.includes(".")) {
    const [s, c] = raw.split(".");
    return { schema: s, container: c };
  }
  const found = containers.find(
    (c) => c.name.toLowerCase() === raw.toLowerCase()
  );
  return {
    schema: found?.schema ?? null,
    container: found ? found.name : raw,
  };
}

export function QueryEditorTab({ workspace, tab }: QueryEditorTabProps) {
  const {
    schemaByWorkspaceDb,
    updateTab,
    openTab,
    saveQueryToWorkspace,
    loadSavedQueriesAndHistory,
    refreshSchema,
    setImportExportTarget,
    pushToast,
  } = useWorkspaceStore();

  const [queryText, setQueryText] = useState(
    tab.queryText ||
      (workspace.engine === "mongodb"
        ? MONGO_TEMPLATES[0].code
        : "SELECT * FROM information_schema.tables LIMIT 50;")
  );
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryExecutionResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultView, setResultView] = useState<"table" | "json">("table");
  const [executedStatement, setExecutedStatement] = useState<string | null>(null);

  // Staged mutations for query results
  const [stagedUpdates, setStagedUpdates] = useState<Record<string, RecordUpdate>>({});
  const [stagedDeletes, setStagedDeletes] = useState<Record<string, Record<string, any>>>({});
  const [applyingStaged, setApplyingStaged] = useState(false);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [selectedRowData, setSelectedRowData] = useState<{
    rowKey: string;
    data: Record<string, any>;
    identity: Record<string, any>;
  } | null>(null);

  // Draggable Splitter Height for Monaco Editor
  const [editorHeight, setEditorHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("docpine:query_editor_height");
      return saved ? Math.max(120, Math.min(800, Number(saved))) : 240;
    } catch {
      return 240;
    }
  });
  const isDraggingSplitRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSplitRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = editorHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingSplitRef.current) return;
      const deltaY = moveEvent.clientY - startYRef.current;
      const newHeight = Math.max(
        100,
        Math.min(window.innerHeight - 240, startHeightRef.current + deltaY)
      );
      setEditorHeight(newHeight);
      try {
        localStorage.setItem("docpine:query_editor_height", String(newHeight));
      } catch {}
    };

    const onMouseUp = () => {
      isDraggingSplitRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Save Query Popover State
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState(tab.title || "Saved Query");

  // Safe Mode Confirmation Modal State
  const [confirmPrompt, setConfirmPrompt] = useState<{
    reason: string;
    query: string;
  } | null>(null);

  const overview = schemaByWorkspaceDb[`${workspace.id}:${tab.database}`];
  const overviewRef = useRef(overview);
  overviewRef.current = overview;

  const editorRef = useRef<any>(null);

  // Inferred target table from executed statement or current query
  const targetTableInfo = useMemo(() => {
    const sql = executedStatement || queryText;
    return inferTableFromQuery(sql, overview?.containers || []);
  }, [executedStatement, queryText, overview]);

  // Primary keys and enriched columns
  const { primaryKeys, enrichedColumns, canEdit } = useMemo(() => {
    if (!result) {
      return { primaryKeys: [], enrichedColumns: [], canEdit: false };
    }

    let pks: string[] = [];
    let cols = result.columns;

    if (targetTableInfo && overview) {
      const colKey = targetTableInfo.schema
        ? `${targetTableInfo.schema}.${targetTableInfo.container}`
        : targetTableInfo.container;
      const knownCols =
        overview.columnsByContainer[colKey] ||
        overview.columnsByContainer[targetTableInfo.container] ||
        [];

      if (knownCols.length > 0) {
        pks = knownCols.filter((c) => c.isPrimaryKey).map((c) => c.name);

        cols = result.columns.map((c) => {
          const match = knownCols.find(
            (kc) => kc.name.toLowerCase() === c.name.toLowerCase()
          );
          if (match) {
            return {
              ...c,
              isPrimaryKey: match.isPrimaryKey,
              foreignKeyTarget: match.foreignKeyTarget,
              dataType: match.dataType,
            };
          }
          return c;
        });
      }
    }

    // Fallback if not found: check for id / _id in results
    if (pks.length === 0) {
      if (result.columns.some((c) => c.name === "_id")) {
        pks = ["_id"];
      } else if (result.columns.some((c) => c.name === "id")) {
        pks = ["id"];
      }
    }

    const editable =
      Boolean(targetTableInfo) &&
      pks.length > 0 &&
      workspace.safetyMode !== "read_only" &&
      !result.isMutation;

    return { primaryKeys: pks, enrichedColumns: cols, canEdit: editable };
  }, [result, targetTableInfo, overview, workspace.safetyMode]);

  // Determine target statement: selected text OR statement at cursor OR full query
  const getTargetQuery = (): { query: string; isSelection: boolean; isStatement: boolean } => {
    const editor = editorRef.current;
    if (!editor) return { query: queryText, isSelection: false, isStatement: false };

    const selection = editor.getSelection();
    if (selection && !selection.isEmpty()) {
      const selected = editor.getModel()?.getValueInRange(selection)?.trim();
      if (selected) {
        return { query: selected, isSelection: true, isStatement: false };
      }
    }

    const model = editor.getModel();
    const position = editor.getPosition();
    if (model && position && workspace.engine !== "mongodb") {
      const fullText = model.getValue();
      const currentOffset = model.getOffsetAt(position);

      const statements: { text: string; start: number; end: number }[] = [];
      let start = 0;
      for (let i = 0; i < fullText.length; i++) {
        if (fullText[i] === ";") {
          statements.push({ text: fullText.substring(start, i).trim(), start, end: i + 1 });
          start = i + 1;
        }
      }
      if (start < fullText.length) {
        statements.push({ text: fullText.substring(start).trim(), start, end: fullText.length });
      }

      const activeStmt = statements.find(
        (s) => currentOffset >= s.start && currentOffset <= s.end && s.text.length > 0
      );
      if (activeStmt && activeStmt.text) {
        return { query: activeStmt.text, isSelection: false, isStatement: true };
      }
    }

    return { query: queryText, isSelection: false, isStatement: false };
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Register Cmd+Enter / Ctrl+Enter shortcut to run query
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      void executeQuery(false);
    });

    // Register Shift+Alt+F / Cmd+K Cmd+F for formatting
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
      handleFormatQuery();
    });

    // Register schema-aware completion provider for SQL
    if (workspace.engine !== "mongodb") {
      monaco.languages.registerCompletionItemProvider("sql", {
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const suggestions: any[] = [];
          const curOverview = overviewRef.current;

          // 1. SQL Keywords
          for (const kw of SQL_KEYWORDS) {
            suggestions.push({
              label: kw,
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: kw,
              range,
            });
          }

          // 2. Tables and Views
          if (curOverview) {
            for (const c of curOverview.containers) {
              suggestions.push({
                label: c.name,
                kind: monaco.languages.CompletionItemKind.Class,
                insertText: c.name,
                detail: `${c.kind} (${c.schema || tab.database})`,
                documentation: `Table in schema: ${c.schema || tab.database}`,
                range,
              });
            }

            // 3. Columns
            for (const [containerKey, cols] of Object.entries(
              curOverview.columnsByContainer
            )) {
              for (const col of cols) {
                suggestions.push({
                  label: col.name,
                  kind: monaco.languages.CompletionItemKind.Field,
                  insertText: col.name,
                  detail: `${col.dataType} (${containerKey})`,
                  documentation: `Column of ${containerKey} [${col.dataType}]`,
                  range,
                });
              }
            }
          }

          return { suggestions };
        },
      });
    }
  };

  const handleFormatQuery = () => {
    if (workspace.engine === "mongodb") {
      try {
        const parsed = JSON.parse(queryText);
        const formatted = JSON.stringify(parsed, null, 2);
        setQueryText(formatted);
        updateTab(workspace.id, tab.id, { queryText: formatted });
        pushToast({ kind: "success", title: "JSON formatted" });
      } catch {
        pushToast({ kind: "error", title: "Invalid JSON query format" });
      }
      return;
    }

    try {
      const dialect = workspace.engine === "mysql" ? "mysql" : "postgresql";
      const formatted = formatSql(queryText, {
        language: dialect,
        tabWidth: 2,
        keywordCase: "upper",
        linesBetweenQueries: 2,
      });
      setQueryText(formatted);
      updateTab(workspace.id, tab.id, { queryText: formatted });
      pushToast({ kind: "success", title: "SQL formatted" });
    } catch (err: any) {
      pushToast({ kind: "error", title: "Formatting error", message: err?.message });
    }
  };

  const executeQuery = async (confirmed: boolean) => {
    const { query: targetSql, isSelection, isStatement } = getTargetQuery();
    if (!targetSql.trim()) return;

    setRunning(true);
    setErrorMsg(null);
    setConfirmPrompt(null);
    setExecutedStatement(targetSql);
    setStagedUpdates({});
    setStagedDeletes({});

    try {
      const res = await ipc.executeQuery(
        workspace.id,
        tab.database,
        targetSql,
        confirmed
      );
      setResult(res);
      void loadSavedQueriesAndHistory(workspace.id);
      if (res.isMutation) {
        void refreshSchema(workspace.id, tab.database);
      }
      if (isSelection) {
        pushToast({ kind: "info", title: "Executed selected snippet" });
      } else if (isStatement) {
        pushToast({ kind: "info", title: "Executed statement at cursor" });
      }
    } catch (err) {
      const parsed = parseAppError(err);
      if (parsed.code === "confirmation_required") {
        setConfirmPrompt({
          reason: parsed.message,
          query: targetSql,
        });
      } else {
        setErrorMsg(parsed.message);
        pushToast({
          kind: "error",
          title: "Query Error",
          message: parsed.message,
        });
      }
    } finally {
      setRunning(false);
    }
  };

  // Cell Editing in Query Results
  const handleCellCommit = async (
    rowKey: string,
    identity: Record<string, any>,
    field: string,
    newValue: any,
    originalValue: any
  ) => {
    if (!targetTableInfo || !canEdit) return;
    if (newValue === originalValue) return;

    const isImmediate = workspace.commitMode === "immediate";

    if (isImmediate) {
      try {
        await ipc.applyMutations(
          workspace.id,
          {
            database: tab.database,
            schema: targetTableInfo.schema ?? tab.schema ?? null,
            container: targetTableInfo.container,
            inserts: [],
            updates: [
              {
                identity,
                changes: { [field]: newValue },
                original: { [field]: originalValue },
              },
            ],
            deletes: [],
            atomic: true,
          },
          true
        );

        setResult((curr) => {
          if (!curr) return null;
          const nextRows = curr.rows.map((r, idx) => {
            const { rowKey: rk } = buildRowIdentity(r, primaryKeys, idx);
            if (rk === rowKey) {
              return { ...r, [field]: newValue };
            }
            return r;
          });
          return { ...curr, rows: nextRows };
        });

        pushToast({
          kind: "success",
          title: "Record updated",
          message: `Updated ${field} in ${targetTableInfo.container}`,
        });
      } catch (err) {
        const parsed = parseAppError(err);
        pushToast({
          kind: "error",
          title: "Update failed",
          message: parsed.message,
        });
      }
    } else {
      setStagedUpdates((prev) => {
        const existing = prev[rowKey] || {
          identity,
          changes: {},
          original: {},
        };
        return {
          ...prev,
          [rowKey]: {
            identity,
            changes: { ...existing.changes, [field]: newValue },
            original: { ...existing.original, [field]: originalValue },
          },
        };
      });
    }
  };

  const handleToggleDeleteRow = async (
    rowKey: string,
    identity: Record<string, any>
  ) => {
    if (!targetTableInfo || !canEdit) return;
    const isImmediate = workspace.commitMode === "immediate";

    if (isImmediate) {
      try {
        await ipc.applyMutations(
          workspace.id,
          {
            database: tab.database,
            schema: targetTableInfo.schema ?? tab.schema ?? null,
            container: targetTableInfo.container,
            inserts: [],
            updates: [],
            deletes: [identity],
            atomic: true,
          },
          true
        );

        setResult((curr) => {
          if (!curr) return null;
          const nextRows = curr.rows.filter((r, idx) => {
            const { rowKey: rk } = buildRowIdentity(r, primaryKeys, idx);
            return rk !== rowKey;
          });
          return { ...curr, rows: nextRows };
        });

        pushToast({
          kind: "info",
          title: "Record deleted",
          message: `Removed from ${targetTableInfo.container}`,
        });
      } catch (err) {
        const parsed = parseAppError(err);
        pushToast({
          kind: "error",
          title: "Delete failed",
          message: parsed.message,
        });
      }
    } else {
      setStagedDeletes((prev) => {
        const next = { ...prev };
        if (next[rowKey]) {
          delete next[rowKey];
        } else {
          next[rowKey] = identity;
        }
        return next;
      });
    }
  };

  const handleApplyStagedChanges = async () => {
    if (!targetTableInfo) return;
    setApplyingStaged(true);
    try {
      const res = await ipc.applyMutations(
        workspace.id,
        {
          database: tab.database,
          schema: targetTableInfo.schema ?? tab.schema ?? null,
          container: targetTableInfo.container,
          inserts: [],
          updates: Object.values(stagedUpdates),
          deletes: Object.values(stagedDeletes),
          atomic: true,
        },
        true
      );

      // Apply changes to in-memory result
      setResult((curr) => {
        if (!curr) return null;
        let nextRows = curr.rows.map((r, idx) => {
          const { rowKey } = buildRowIdentity(r, primaryKeys, idx);
          if (stagedUpdates[rowKey]) {
            return { ...r, ...stagedUpdates[rowKey].changes };
          }
          return r;
        });
        if (Object.keys(stagedDeletes).length > 0) {
          nextRows = nextRows.filter((r, idx) => {
            const { rowKey } = buildRowIdentity(r, primaryKeys, idx);
            return !stagedDeletes[rowKey];
          });
        }
        return { ...curr, rows: nextRows };
      });

      setStagedUpdates({});
      setStagedDeletes({});

      pushToast({
        kind: "success",
        title: "Changes committed",
        message: `~${res.updatedCount} updated, -${res.deletedCount} deleted`,
      });
    } catch (err) {
      const parsed = parseAppError(err);
      pushToast({
        kind: "error",
        title: "Commit failed",
        message: parsed.message,
      });
    } finally {
      setApplyingStaged(false);
    }
  };

  const handleSaveQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveTitle.trim()) return;
    await saveQueryToWorkspace({
      workspaceId: workspace.id,
      title: saveTitle.trim(),
      database: tab.database,
      queryText,
    });
    updateTab(workspace.id, tab.id, { title: saveTitle.trim() });
    setSaveOpen(false);
  };

  const stagedCount =
    Object.keys(stagedUpdates).length + Object.keys(stagedDeletes).length;

  return (
    <div className="flex-1 h-full flex flex-col bg-zinc-950 overflow-hidden">
      {/* Query Editor Action Bar */}
      <div className="px-4 py-2 bg-zinc-950 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 select-none shrink-0">
        <div className="flex items-center gap-2">
          <button
            disabled={running}
            onClick={() => void executeQuery(false)}
            title="Run query or statement at cursor (⌘+Enter)"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs shadow-sm transition-colors disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>Run (⌘↵)</span>
          </button>

          <button
            onClick={handleFormatQuery}
            title="Format Query (Shift+Alt+F)"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-200 transition-colors"
          >
            <AlignLeft className="w-3.5 h-3.5 text-zinc-400" />
            <span>Format</span>
          </button>

          {/* Save Query Button & Inline Form */}
          <div className="relative">
            <button
              onClick={() => setSaveOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-200"
            >
              <Bookmark className="w-3.5 h-3.5 text-amber-400" />
              <span>Save Query</span>
            </button>

            {saveOpen && (
              <form
                autoComplete="off"
                onSubmit={(e) => void handleSaveQuery(e)}
                className="absolute left-0 top-9 z-30 w-64 p-3 rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl space-y-2"
              >
                <div className="text-xs font-semibold text-zinc-200">
                  Save to Workspace Queries
                </div>
                <input
                  type="text"
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  placeholder="Query title..."
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100"
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSaveOpen(false)}
                    className="px-2 py-1 text-xs text-zinc-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 rounded-lg bg-emerald-500 text-zinc-950 font-semibold text-xs"
                  >
                    Save
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* MongoDB Command Templates */}
          {workspace.engine === "mongodb" && (
            <div className="flex items-center gap-1 pl-2 border-l border-zinc-800">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 mr-1" />
              {MONGO_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  onClick={() => {
                    setQueryText(tpl.code);
                    updateTab(workspace.id, tab.id, { queryText: tpl.code });
                  }}
                  className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-[10px] text-zinc-300 font-mono"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Database context indicator */}
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>{tab.database}</span>
        </div>
      </div>

      {/* Resizable Monaco Editor Section */}
      <div style={{ height: `${editorHeight}px` }} className="shrink-0 overflow-hidden bg-zinc-950">
        <Editor
          height="100%"
          language={workspace.engine === "mongodb" ? "json" : "sql"}
          theme={DOCPINE_THEME_NAME}
          beforeMount={handleMonacoBeforeMount}
          value={queryText}
          onChange={(val) => {
            const next = val || "";
            setQueryText(next);
            updateTab(workspace.id, tab.id, { queryText: next });
          }}
          onMount={handleEditorMount}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            lineNumbers: "on",
            roundedSelection: true,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            padding: { top: 8, bottom: 8 },
          }}
        />
      </div>

      {/* Draggable Divider to Resize Editor and Results Pane */}
      <div
        onMouseDown={handleSplitterMouseDown}
        className="h-1.5 bg-zinc-900 hover:bg-emerald-500/60 active:bg-emerald-500 cursor-row-resize flex items-center justify-center transition-colors select-none group border-y border-zinc-800/80 z-20 shrink-0"
        title="Drag up/down to resize editor and results panel"
      >
        <div className="w-12 h-0.5 rounded-full bg-zinc-700 group-hover:bg-emerald-300 transition-colors" />
      </div>

      {/* Results / Error Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
        {errorMsg && (
          <div className="p-4 m-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs font-mono text-rose-200 whitespace-pre-wrap">
              {errorMsg}
            </div>
          </div>
        )}

        {!errorMsg && !result && (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-xs font-mono select-none">
            <div className="p-3 rounded-full bg-zinc-900 border border-zinc-800 mb-3">
              <Play className="w-5 h-5 text-zinc-600" />
            </div>
            <span>Press ⌘+Enter to execute statement at cursor or selection</span>
          </div>
        )}

        {result && (
          <>
            {/* Result Header Bar */}
            <div className="px-4 py-2 bg-zinc-900/60 border-b border-zinc-800 flex items-center justify-between text-xs select-none shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Success</span>
                </div>

                <span className="text-zinc-500">|</span>

                <span className="text-zinc-300 font-mono">
                  {result.affectedRows !== null && result.affectedRows !== undefined
                    ? `${result.affectedRows} row(s)`
                    : `${result.rows.length} row(s)`}
                </span>

                {executedStatement && (
                  <span
                    className="text-zinc-500 text-[10px] font-mono truncate max-w-xs"
                    title={executedStatement}
                  >
                    Statement: {executedStatement.replace(/\s+/g, " ")}
                  </span>
                )}

                {/* Editability status pill */}
                {canEdit ? (
                  <span
                    className="flex items-center gap-1 text-[10px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full"
                    title={`Records can be edited inline and saved to ${targetTableInfo?.container}`}
                  >
                    <Edit3 className="w-2.5 h-2.5 text-emerald-400" />
                    <span>Editable ({targetTableInfo?.container})</span>
                  </span>
                ) : (
                  <span
                    className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full"
                    title="Read-only query (custom projection or no primary key found)"
                  >
                    <Lock className="w-2.5 h-2.5" />
                    <span>Read-only</span>
                  </span>
                )}

                {/* View switcher: Table vs JSON */}
                <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
                  <button
                    onClick={() => setResultView("table")}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans ${
                      resultView === "table"
                        ? "bg-zinc-800 text-zinc-100 font-semibold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <Table2 className="w-3 h-3" />
                    <span>Table</span>
                  </button>
                  <button
                    onClick={() => setResultView("json")}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans ${
                      resultView === "json"
                        ? "bg-zinc-800 text-zinc-100 font-semibold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <Braces className="w-3 h-3" />
                    <span>JSON</span>
                  </button>
                </div>

                {/* Export Result Button */}
                {result.rows.length > 0 && (
                  <button
                    onClick={() =>
                      setImportExportTarget({
                        mode: "export",
                        workspaceId: workspace.id,
                        database: tab.database,
                        container: targetTableInfo?.container || "query_result",
                        rows: result.rows,
                      })
                    }
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-300"
                  >
                    <Download className="w-3 h-3" />
                    <span>Export</span>
                  </button>
                )}
              </div>
            </div>

            {/* Results Table or JSON */}
            {result.rows.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs text-zinc-500 font-mono">
                {result.message || "Statement executed with 0 rows returned."}
              </div>
            ) : resultView === "table" ? (
              <div className="flex-1 flex overflow-hidden relative">
                <div className="flex-1 overflow-hidden relative flex flex-col">
                  <DataTableGrid
                    workspaceId={workspace.id}
                    database={tab.database}
                    schema={targetTableInfo?.schema ?? tab.schema}
                    container={targetTableInfo?.container}
                    columns={enrichedColumns}
                    rows={result.rows}
                    primaryKeys={primaryKeys}
                    sorts={[]}
                    staged={{
                      inserts: {},
                      updates: stagedUpdates,
                      deletes: stagedDeletes,
                    }}
                    selectedRowKey={selectedRowKey}
                    readOnly={!canEdit}
                    onSelectRow={(rowKey, rowData) => {
                      if (selectedRowKey === rowKey) {
                        setSelectedRowKey(null);
                        setSelectedRowData(null);
                      } else {
                        setSelectedRowKey(rowKey);
                        const { identity } = buildRowIdentity(rowData, primaryKeys, 0);
                        setSelectedRowData({ rowKey, data: rowData, identity });
                      }
                    }}
                    onToggleSort={() => {}}
                    onCellCommit={(rk, id, f, nv, ov) => {
                      void handleCellCommit(rk, id, f, nv, ov);
                    }}
                    onDraftCellChange={() => {}}
                    onRemoveDraftRow={() => {}}
                    onToggleDeleteRow={(rk, id) => {
                      void handleToggleDeleteRow(rk, id);
                    }}
                    onFollowForeignKey={(targetContainer, targetCol, val, targetSchema) => {
                      openTab(workspace.id, {
                        kind: "data",
                        title: targetSchema
                          ? `${targetSchema}.${targetContainer}`
                          : targetContainer,
                        database: tab.database,
                        schema: targetSchema ?? tab.schema,
                        container: targetContainer,
                        dataViewMode: "table",
                        initialFilters: [
                          {
                            id: `fk_filter_${Date.now()}`,
                            field: targetCol,
                            operator: "eq",
                            value: String(val),
                            enabled: true,
                          },
                        ],
                      });
                      pushToast({
                        kind: "info",
                        title: `Opened ${targetContainer}`,
                        message: `Filtered by ${targetCol} = ${val}`,
                      });
                    }}
                    onCopyNotification={(count) => {
                      pushToast({
                        kind: "info",
                        title: "Copied to clipboard",
                        message: `${count} cell(s) copied as TSV`,
                      });
                    }}
                  />

                  {/* Staged Changes Bar when in Staged Mode */}
                  {stagedCount > 0 && (
                    <StagedChangesBar
                      staged={{
                        inserts: {},
                        updates: stagedUpdates,
                        deletes: stagedDeletes,
                      }}
                      applying={applyingStaged}
                      onApply={handleApplyStagedChanges}
                      onDiscard={() => {
                        setStagedUpdates({});
                        setStagedDeletes({});
                      }}
                    />
                  )}
                </div>

                {/* Row Inspector Drawer */}
                {selectedRowData && (
                  <RowInspectorDrawer
                    rowKey={selectedRowData.rowKey}
                    rowData={selectedRowData.data}
                    originalRowData={
                      result.rows.find(
                        (r, idx) =>
                          buildRowIdentity(r, primaryKeys, idx).rowKey ===
                          selectedRowData.rowKey
                      ) || null
                    }
                    identity={selectedRowData.identity}
                    columns={enrichedColumns}
                    readOnly={!canEdit}
                    onClose={() => {
                      setSelectedRowKey(null);
                      setSelectedRowData(null);
                    }}
                    onFieldChange={(rk, id, f, nv, ov) => {
                      void handleCellCommit(rk, id, f, nv, ov);
                      setSelectedRowData((curr) =>
                        curr && curr.rowKey === rk
                          ? { ...curr, data: { ...curr.data, [f]: nv } }
                          : curr
                      );
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-auto p-4">
                <pre className="text-xs font-mono text-emerald-200 whitespace-pre-wrap">
                  {JSON.stringify(result.rows, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}
      </div>

      {/* Safe Mode Confirmation Modal */}
      {confirmPrompt && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-amber-500/40 shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100">
                  Safe Mode Guardrail Triggered
                </h3>
                <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                  {confirmPrompt.reason}
                </p>
              </div>
            </div>

            <pre className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-amber-200 max-h-36 overflow-auto whitespace-pre-wrap">
              {confirmPrompt.query}
            </pre>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmPrompt(null)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                onClick={() => void executeQuery(true)}
                className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs"
              >
                Confirm &amp; Execute Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
