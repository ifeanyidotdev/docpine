import React, { useEffect, useState } from "react";
import {
  X,
  Download,
  Upload,
  Copy,
  Check,
  Loader2,
  FileSpreadsheet,
  FileJson,
  FileCode2,
} from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { ipc, parseAppError } from "../../lib/ipc";
import type { DataFormat } from "../../types/docpine";

export function ImportExportModal() {
  const {
    importExportTarget,
    setImportExportTarget,
    tabsByWorkspace,
    bumpTabRefresh,
    pushToast,
  } = useWorkspaceStore();

  const [format, setFormat] = useState<DataFormat>("csv");
  const [content, setContent] = useState("");
  const [filePath, setFilePath] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const isExport = importExportTarget?.mode === "export";

  useEffect(() => {
    if (!importExportTarget) return;
    setCopied(false);
    setFilePath("");

    if (importExportTarget.mode === "export") {
      setLoading(true);
      void ipc
        .exportContainerData({
          workspaceId: importExportTarget.workspaceId,
          database: importExportTarget.database,
          schema: importExportTarget.schema ?? null,
          container: importExportTarget.container,
          format,
          rows: importExportTarget.rows ?? null,
          filePath: null,
        })
        .then((res) => setContent(res))
        .catch((err) => {
          const parsed = parseAppError(err);
          setContent(`-- Export error: ${parsed.message}`);
        })
        .finally(() => setLoading(false));
    } else {
      setContent("");
      if (format === "sql_insert") {
        setFormat("csv");
      }
    }
  }, [importExportTarget, format]);

  if (!importExportTarget) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBrowserDownload = () => {
    const ext =
      format === "csv" ? "csv" : format === "json" ? "json" : "sql";
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${importExportTarget.container}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveToFile = async () => {
    if (!filePath.trim()) {
      handleBrowserDownload();
      return;
    }
    setLoading(true);
    try {
      await ipc.exportContainerData({
        workspaceId: importExportTarget.workspaceId,
        database: importExportTarget.database,
        schema: importExportTarget.schema ?? null,
        container: importExportTarget.container,
        format,
        rows: importExportTarget.rows ?? null,
        filePath: filePath.trim(),
      });
      pushToast({
        kind: "success",
        title: "Export saved to file",
        message: filePath.trim(),
      });
      setImportExportTarget(null);
    } catch (err) {
      const parsed = parseAppError(err);
      pushToast({
        kind: "error",
        title: "File export failed",
        message: parsed.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.endsWith(".json")) setFormat("json");
    if (file.name.endsWith(".csv")) setFormat("csv");

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setContent(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleRunImport = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      const res = await ipc.importContainerData({
        workspaceId: importExportTarget.workspaceId,
        database: importExportTarget.database,
        schema: importExportTarget.schema ?? null,
        container: importExportTarget.container,
        format,
        rawContent: content,
      });
      pushToast({
        kind: "success",
        title: `Imported ${res.insertedCount} record(s)`,
        message: `into ${importExportTarget.container} (${res.executionMs}ms)`,
      });

      const wsTabs = tabsByWorkspace[importExportTarget.workspaceId] || [];
      for (const t of wsTabs) {
        if (t.container === importExportTarget.container) {
          bumpTabRefresh(t.id);
        }
      }
      setImportExportTarget(null);
    } catch (err) {
      const parsed = parseAppError(err);
      pushToast({
        kind: "error",
        title: "Import failed",
        message: parsed.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {isExport ? (
              <Download className="w-5 h-5 text-amber-400" />
            ) : (
              <Upload className="w-5 h-5 text-emerald-400" />
            )}
            <div>
              <h3 className="text-sm font-bold text-zinc-100">
                {isExport ? "Export Data" : "Import Data"} —{" "}
                <span className="font-mono text-emerald-400">
                  {importExportTarget.container}
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                Database: {importExportTarget.database}
              </p>
            </div>
          </div>

          <button
            onClick={() => setImportExportTarget(null)}
            className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Format Selector */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {(
                [
                  { id: "csv", label: "CSV", icon: FileSpreadsheet },
                  { id: "json", label: "JSON", icon: FileJson },
                  ...(isExport
                    ? [
                        {
                          id: "sql_insert",
                          label: "SQL INSERT",
                          icon: FileCode2,
                        },
                      ]
                    : []),
                ] as const
              ).map((fmt) => {
                const Icon = fmt.icon;
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => setFormat(fmt.id as DataFormat)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                      format === fmt.id
                        ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {fmt.label}
                  </button>
                );
              })}
            </div>

            {!isExport && (
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                <span>Choose .csv or .json File</span>
                <input
                  type="file"
                  accept=".csv,.json,.ndjson"
                  onChange={handleFileUploadChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {isExport && (
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">
                Optional Local Destination Path (leave blank to download
                directly)
              </label>
              <input
                type="text"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder={`/tmp/${importExportTarget.container}.${
                  format === "sql_insert" ? "sql" : format
                }`}
                className="w-full px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
              />
            </div>
          )}

          {/* Payload Preview / Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>
                {isExport
                  ? "Generated Output Preview"
                  : `Paste ${format.toUpperCase()} Content or Upload File`}
              </span>
              {isExport && (
                <button
                  onClick={() => void handleCopy()}
                  className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy to Clipboard
                    </>
                  )}
                </button>
              )}
            </div>

            <textarea
              rows={12}
              value={content}
              readOnly={isExport}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                isExport
                  ? "Generating export..."
                  : format === "csv"
                    ? "name,email,active\nAda Lovelace,ada@docpine.dev,true"
                    : '[\n  { "name": "Ada Lovelace", "active": true }\n]'
              }
              className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500/60"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-950 border-t border-zinc-800 flex items-center justify-end gap-2">
          <button
            onClick={() => setImportExportTarget(null)}
            className="px-3.5 py-2 rounded-xl text-xs text-zinc-400 hover:text-zinc-200"
          >
            Close
          </button>

          {isExport ? (
            <button
              disabled={loading}
              onClick={() => void handleSaveToFile()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{filePath.trim() ? "Write to Path" : "Download File"}</span>
            </button>
          ) : (
            <button
              disabled={loading || !content.trim()}
              onClick={() => void handleRunImport()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs disabled:opacity-40"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>Import Records Now</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
