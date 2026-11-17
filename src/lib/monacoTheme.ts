import type { Monaco } from "@monaco-editor/react";
import { loader } from "@monaco-editor/react";

export const DOCPINE_THEME_NAME = "docpine-dark";

export const docpineThemeConfig: Parameters<Monaco["editor"]["defineTheme"]>[1] = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "keyword", foreground: "34d399", fontStyle: "bold" },
    { token: "keyword.sql", foreground: "34d399", fontStyle: "bold" },
    { token: "operator.sql", foreground: "6ee7b7" },
    { token: "string.sql", foreground: "fde047" },
    { token: "string", foreground: "fde047" },
    { token: "number", foreground: "38bdf8" },
    { token: "number.sql", foreground: "38bdf8" },
    { token: "comment", foreground: "71717a", fontStyle: "italic" },
    { token: "comment.sql", foreground: "71717a", fontStyle: "italic" },
    { token: "type", foreground: "a78bfa" },
  ],
  colors: {
    "editor.background": "#09090b", // zinc-950 exact match
    "editor.foreground": "#e4e4e7", // zinc-200
    "editorLineNumber.foreground": "#52525b", // zinc-600
    "editorLineNumber.activeForeground": "#34d399", // emerald-400
    "editorCursor.foreground": "#34d399", // emerald-400
    "editor.lineHighlightBackground": "#18181b80", // subtle zinc-900 highlight
    "editor.selectionBackground": "#10b98135", // emerald translucent selection
    "editor.inactiveSelectionBackground": "#10b98118",
    "editorGutter.background": "#09090b", // seamless gutter
    "editorWidget.background": "#18181b",
    "editorWidget.border": "#27272a",
    "editorSuggestWidget.background": "#18181b",
    "editorSuggestWidget.border": "#27272a",
    "editorSuggestWidget.foreground": "#e4e4e7",
    "editorSuggestWidget.selectedBackground": "#27272a",
    "editorSuggestWidget.highlightForeground": "#34d399",
  },
};

export function handleMonacoBeforeMount(monaco: Monaco) {
  try {
    monaco.editor.defineTheme(DOCPINE_THEME_NAME, docpineThemeConfig);
    monaco.editor.setTheme(DOCPINE_THEME_NAME);
  } catch {
    // ignore if already defined
  }
}

// Early pre-registration on app start
if (typeof window !== "undefined") {
  loader.init().then((monaco) => {
    handleMonacoBeforeMount(monaco);
  }).catch(() => {
    // Monaco will define theme on beforeMount
  });
}
