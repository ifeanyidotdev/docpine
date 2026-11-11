import React, { useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
} from "@xyflow/react";
import dagre from "dagre";
import { KeyRound, Link2, Search, Table2, RefreshCw } from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import type {
  ColumnMeta,
  WorkspaceConfig,
  WorkspaceTab,
} from "../../types/docpine";

interface ErDiagramTabProps {
  workspace: WorkspaceConfig;
  tab: WorkspaceTab;
}

interface EntityNodeData extends Record<string, unknown> {
  label: string;
  schema?: string | null;
  kind: string;
  columns: ColumnMeta[];
  onOpenData: () => void;
}

function EntitySchemaNode({ data }: { data: EntityNodeData }) {
  return (
    <div className="w-64 rounded-xl bg-zinc-900/95 border border-zinc-700 shadow-2xl overflow-hidden text-xs font-mono">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-indigo-400 !w-2.5 !h-2.5"
      />
      <div
        onClick={data.onOpenData}
        className="px-3 py-2 bg-zinc-800/90 border-b border-zinc-700 flex items-center justify-between cursor-pointer hover:bg-zinc-800"
      >
        <div className="flex items-center gap-1.5 truncate">
          <Table2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-bold text-zinc-100 truncate">{data.label}</span>
        </div>
        <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400">
          {data.kind}
        </span>
      </div>

      <div className="divide-y divide-zinc-800/60 max-h-60 overflow-y-auto">
        {data.columns.slice(0, 14).map((col) => (
          <div
            key={col.name}
            className="px-3 py-1.5 flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-1.5 truncate">
              {col.isPrimaryKey && (
                <KeyRound className="w-3 h-3 text-amber-400 shrink-0" />
              )}
              {col.foreignKeyTarget && (
                <Link2 className="w-3 h-3 text-indigo-400 shrink-0" />
              )}
              <span className="text-zinc-200 truncate">{col.name}</span>
            </div>
            <span className="text-[10px] text-zinc-500 shrink-0">
              {col.dataType}
            </span>
          </div>
        ))}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-emerald-400 !w-2.5 !h-2.5"
      />
    </div>
  );
}

const nodeTypes = {
  entity: EntitySchemaNode,
};

export function ErDiagramTab({ workspace, tab }: ErDiagramTabProps) {
  const { schemaByWorkspaceDb, refreshSchema, openTab } = useWorkspaceStore();
  const [filter, setFilter] = useState("");

  const overview = schemaByWorkspaceDb[`${workspace.id}:${tab.database}`];

  const { nodes, edges } = useMemo(() => {
    if (!overview) return { nodes: [], edges: [] };

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 110 });
    g.setDefaultEdgeLabel(() => ({}));

    const q = filter.trim().toLowerCase();
    const filteredContainers = overview.containers.filter(
      (c) => !q || c.name.toLowerCase().includes(q)
    );

    const rawNodes: Node<EntityNodeData>[] = filteredContainers.map((c) => {
      const colKey = c.schema ? `${c.schema}.${c.name}` : c.name;
      const cols =
        overview.columnsByContainer[colKey] ||
        overview.columnsByContainer[c.name] ||
        [];

      const height = Math.min(300, 48 + cols.length * 26);
      g.setNode(c.name, { width: 260, height });

      return {
        id: c.name,
        type: "entity",
        position: { x: 0, y: 0 },
        data: {
          label: c.name,
          schema: c.schema,
          kind: c.kind,
          columns: cols,
          onOpenData: () =>
            openTab(workspace.id, {
              kind: "data",
              title: c.name,
              database: tab.database,
              schema: c.schema,
              container: c.name,
              dataViewMode: "table",
            }),
        },
      };
    });

    const nodeSet = new Set(rawNodes.map((n) => n.id));
    const rawEdges: Edge[] = [];

    overview.foreignKeys.forEach((fk, idx) => {
      if (
        nodeSet.has(fk.sourceContainer) &&
        nodeSet.has(fk.targetContainer)
      ) {
        g.setEdge(fk.sourceContainer, fk.targetContainer);
        rawEdges.push({
          id: `fk-${idx}-${fk.constraintName}`,
          source: fk.sourceContainer,
          target: fk.targetContainer,
          label: `${fk.sourceColumn} → ${fk.targetColumn}`,
          animated: true,
          style: { stroke: "#818cf8", strokeWidth: 1.75 },
          labelStyle: { fill: "#d4d4d8", fontSize: 10, fontFamily: "monospace" },
          labelBgStyle: { fill: "#18181b", fillOpacity: 0.85 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#818cf8",
          },
        });
      }
    });

    dagre.layout(g);

    const positionedNodes = rawNodes.map((node) => {
      const pos = g.node(node.id);
      return {
        ...node,
        position: {
          x: (pos?.x || 0) - 130,
          y: (pos?.y || 0) - 80,
        },
      };
    });

    return { nodes: positionedNodes, edges: rawEdges };
  }, [overview, filter, workspace.id, tab.database, openTab]);

  return (
    <div className="flex-1 h-full flex flex-col bg-zinc-950 overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-2 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between gap-4 select-none shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-zinc-200">
            ER Schema Visualizer —{" "}
            <span className="font-mono text-emerald-400">{tab.database}</span>
          </span>
          <span className="text-[11px] text-zinc-500">
            Click any table/collection card header to open its Data Grid
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter entities..."
              className="pl-8 pr-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none"
            />
          </div>
          <button
            onClick={() => void refreshSchema(workspace.id, tab.database)}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300"
            title="Refresh Schema Graph"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          colorMode="dark"
        >
          <Background color="#27272a" gap={20} />
          <Controls />
          <MiniMap
            nodeColor="#10b981"
            maskColor="rgba(9, 9, 11, 0.75)"
            className="!bg-zinc-900 !border !border-zinc-800 !rounded-xl"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
