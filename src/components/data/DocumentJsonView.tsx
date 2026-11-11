import React, { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { Check, AlertCircle } from "lucide-react";
import { buildRowIdentity } from "./DataTableGrid";

interface DocumentJsonViewProps {
  rows: Record<string, any>[];
  primaryKeys: string[];
  readOnly: boolean;
  onStageFullDocumentReplace: (
    rowKey: string,
    identity: Record<string, any>,
    changes: Record<string, any>,
    original: Record<string, any>
  ) => void;
}

export function DocumentJsonView({
  rows,
  primaryKeys,
  readOnly,
  onStageFullDocumentReplace,
}: DocumentJsonViewProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [jsonText, setJsonText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const activeRow = rows[selectedIdx] || rows[0];

  useEffect(() => {
    if (activeRow) {
      setJsonText(JSON.stringify(activeRow, null, 2));
      setParseError(null);
    } else {
      setJsonText("[]");
    }
  }, [selectedIdx, activeRow]);

  const handleApplyDocumentEdit = () => {
    if (!activeRow || readOnly) return;
    try {
      const parsed = JSON.parse(jsonText);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setParseError("Document must be a valid JSON object.");
        return;
      }
      setParseError(null);

      const { rowKey, identity } = buildRowIdentity(
        activeRow,
        primaryKeys,
        selectedIdx
      );
      const changes: Record<string, any> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (JSON.stringify(v) !== JSON.stringify(activeRow[k])) {
          changes[k] = v;
        }
      }
      onStageFullDocumentReplace(rowKey, identity, changes, activeRow);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  return (
    <div className="flex-1 h-full flex bg-zinc-950 overflow-hidden">
      {/* Left Document Selector List */}
      <div className="w-60 border-r border-zinc-800 overflow-y-auto p-2 space-y-1 shrink-0">
        {rows.map((r, i) => {
          const label =
            r._id !== undefined
              ? String(r._id)
              : r.id !== undefined
                ? `id: ${r.id}`
                : `Record #${i + 1}`;
          return (
            <button
              key={i}
              onClick={() => setSelectedIdx(i)}
              className={`w-full px-3 py-2 rounded-lg text-left font-mono text-xs truncate transition-colors ${
                selectedIdx === i
                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Right Monaco JSON Editor */}
      <div className="flex-1 flex flex-col h-full">
        <div className="px-4 py-2 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between">
          <div className="text-xs text-zinc-400 font-mono">
            Editing Document #{selectedIdx + 1}
          </div>
          {!readOnly && activeRow && (
            <button
              onClick={handleApplyDocumentEdit}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Stage / Apply JSON Changes
            </button>
          )}
        </div>

        {parseError && (
          <div className="px-4 py-2 bg-rose-500/10 border-b border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{parseError}</span>
          </div>
        )}

        <div className="flex-1">
          <Editor
            height="100%"
            defaultLanguage="json"
            theme="vs-dark"
            value={jsonText}
            onChange={(v) => setJsonText(v || "")}
            options={{
              readOnly,
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
            }}
          />
        </div>
      </div>
    </div>
  );
}
