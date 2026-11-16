import React, { useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
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
} from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { ipc, parseAppError } from "../../lib/ipc";
import { formatCellDisplay } from "../data/DataTableGrid";
import type {
  QueryExecutionResult,
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

export function QueryEditorTab({ workspace, tab }: QueryEditorTabProps) {
  const {
    schemaByWorkspaceDb,
    updateTab,
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

  // Save Query Popover State
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState(tab.title || "Saved Query");

  // Safe Mode Confirmation Modal State
  const [confirmPrompt, setConfirmPrompt] = useState<{
    reason: string;
    query: string;
  } | null>(null);

  const overview = schemaByWorkspaceDb[`${workspace.id}:${tab.database}`];

  const handleEditorMount: OnMount = (editor, monaco) => {
    // Register Cmd+Enter / Ctrl+Enter shortcut to run query
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      void executeQuery(false);
    });

    // Register schema-aware completion provider for SQL
    if (workspace.engine !== "mongodb" && overview) {
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
          for (const c of overview.containers) {
            suggestions.push({
              label: c.name,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: c.name,
              detail: `${c.kind} (${c.schema || tab.database})`,
              range,
            });
          }

          for (const [containerKey, cols] of Object.entries(
            overview.columnsByContainer
          )) {
            for (const col of cols) {
              suggestions.push({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: col.name,
                detail: `${col.dataType} (${containerKey})`,
                range,
              });
            }
          }
          return { suggestions };
        },
      });
    }
  };

  const executeQuery = async (confirmed: boolean) => {
    if (!queryText.trim()) return;
    setRunning(true);
    setErrorMsg(null);
    setConfirmPrompt(null);

    try {
      const res = await ipc.executeQuery(
        workspace.id,
        tab.database,
        queryText,
        confirmed
      );
      setResult(res);
      void loadSavedQueriesAndHistory(workspace.id);
      if (res.isMutation) {
        void refreshSchema(workspace.id, tab.database);
      }
    } catch (err) {
      const parsed = parseAppError(err);
      if (parsed.code === "confirmation_required") {
        setConfirmPrompt({
          reason: parsed.message,
          query: queryText,
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

  return (
    <div className="flex-1 h-full flex flex-col bg-zinc-950 overflow-hidden">
      {/* Query Editor Action Bar */}
      <div className="px-4 py-2 bg-zinc-950 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 select-none shrink-0">
        <div className="flex items-center gap-2">
          <button
            disabled={running}
            onClick={() => void executeQuery(false)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs shadow-sm transition-colors disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>Run (⌘↵)</span>
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
                  className="px-2 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-mono text-zinc-300"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-zinc-500">
            db: <strong className="text-zinc-300">{tab.database}</strong>
          </span>

          {result && result.rows.length > 0 && (
            <>
              <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-900 border border-zinc-800">
                <button
                  onClick={() => setResultView("table")}
                  className={`px-2 py-1 rounded-md flex items-center gap-1 ${
                    resultView === "table"
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400"
                  }`}
                >
                  <Table2 className="w-3.5 h-3.5" />
                  Table
                </button>
                <button
                  onClick={() => setResultView("json")}
                  className={`px-2 py-1 rounded-md flex items-center gap-1 ${
                    resultView === "json"
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400"
                  }`}
                >
                  <Braces className="w-3.5 h-3.5" />
                  JSON
                </button>
              </div>

              <button
                onClick={() =>
                  setImportExportTarget({
                    mode: "export",
                    workspaceId: workspace.id,
                    database: tab.database,
                    container: "query_results",
                    rows: result.rows,
                  })
                }
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                Export
              </button>
            </>
          )}
        </div>
      </div>

      {/* Top Split: Monaco Query Editor */}
      <div className="h-[42%] min-h-[180px] border-b border-zinc-800 relative">
        <Editor
          height="100%"
          language={workspace.engine === "mongodb" ? "json" : "sql"}
          theme="vs-dark"
          value={queryText}
          onChange={(val) => {
            const v = val || "";
            setQueryText(v);
            updateTab(workspace.id, tab.id, { queryText: v });
          }}
          onMount={handleEditorMount}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div>

      {/* Bottom Split: Query Results or Error Banner */}
      <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
        {errorMsg && (
          <div className="m-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-sans font-semibold text-rose-200">
                Execution Error
              </div>
              <div className="whitespace-pre-wrap break-all">{errorMsg}</div>
            </div>
          </div>
        )}

        {!errorMsg && !result && (
          <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">
            Press <kbd className="mx-1 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 font-mono text-zinc-300">⌘ + Enter</kbd> or click Run to execute your query.
          </div>
        )}

        {result && (
          <>
            {/* Status Sub-Bar */}
            <div className="px-4 py-1.5 bg-zinc-900/70 border-b border-zinc-800/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="font-medium">
                  {result.message || "Query completed"}
                </span>
              </div>
              <span className="font-mono text-zinc-400">
                {result.executionMs}ms
              </span>
            </div>

            {/* Results Table or JSON */}
            {result.rows.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs text-zinc-500 font-mono">
                {result.message || "Statement executed with 0 rows returned."}
              </div>
            ) : resultView === "table" ? (
              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-xs font-mono">
                  <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800 text-zinc-300">
                    <tr>
                      <th className="w-12 px-2 py-2 text-center text-[10px] text-zinc-500 border-r border-zinc-800">
                        #
                      </th>
                      {result.columns.map((c) => (
                        <th
                          key={c.name}
                          className="px-3 py-2 text-left border-r border-zinc-800 font-semibold"
                        >
                          {c.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-zinc-900 hover:bg-zinc-900/60"
                      >
                        <td className="px-2 py-1.5 text-center text-zinc-600 border-r border-zinc-900">
                          {idx + 1}
                        </td>
                        {result.columns.map((c) => (
                          <td
                            key={c.name}
                            className="max-w-[340px] px-3 py-1.5 border-r border-zinc-900 truncate text-zinc-200"
                          >
                            {formatCellDisplay(row[c.name])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
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
