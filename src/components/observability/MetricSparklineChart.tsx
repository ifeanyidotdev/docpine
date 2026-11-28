import React, { useId, useState } from "react";

export interface SparklinePoint {
  timestampMs: number;
  value: number | null;
}

interface MetricSparklineChartProps {
  title: string;
  subtitle?: string;
  points: SparklinePoint[];
  unit: string;
  strokeColor: string;
  emptyText?: string;
  formatValue?: (v: number) => string;
}

export function MetricSparklineChart({
  title,
  subtitle,
  points,
  unit,
  strokeColor,
  emptyText = "Collecting samples...",
  formatValue,
}: MetricSparklineChartProps) {
  const gradId = useId();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const validPoints = points.filter(
    (p): p is { timestampMs: number; value: number } =>
      typeof p.value === "number" && Number.isFinite(p.value)
  );

  const fmt = (v: number) =>
    formatValue
      ? formatValue(v)
      : `${v >= 100 ? v.toFixed(0) : v.toFixed(1)}${unit}`;

  const latest = validPoints[validPoints.length - 1]?.value ?? null;
  const maxVal =
    validPoints.length > 0
      ? Math.max(...validPoints.map((p) => p.value), 1)
      : 1;
  const minVal =
    validPoints.length > 0 ? Math.min(...validPoints.map((p) => p.value), 0) : 0;
  const range = Math.max(maxVal - minVal, 1e-6);

  const width = 420;
  const height = 108;
  const padX = 6;
  const padY = 10;
  const usableW = width - padX * 2;
  const usableH = height - padY * 2;

  const coords = validPoints.map((pt, i) => {
    const x =
      validPoints.length === 1
        ? width - padX
        : padX + (i / (validPoints.length - 1)) * usableW;
    const y = padY + usableH - ((pt.value - minVal) / range) * usableH;
    return {
      x,
      y,
      xPct: (x / width) * 100,
      yPct: (y / height) * 100,
      value: pt.value,
      timestampMs: pt.timestampMs,
    };
  });

  const activeCoord =
    hoveredIndex !== null && hoveredIndex < coords.length
      ? coords[hoveredIndex]
      : null;

  const lastCoord = coords.length > 0 ? coords[coords.length - 1] : null;
  const dotCoord = activeCoord ?? lastCoord;

  const linePath =
    coords.length > 1
      ? coords
          .map(
            (c, idx) =>
              `${idx === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`
          )
          .join(" ")
      : "";

  const areaPath =
    coords.length > 1
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(height - padY).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(height - padY).toFixed(1)} Z`
      : "";

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (coords.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;

    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetX = relX * width;

    let nearestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const dist = Math.abs(coords[i].x - targetX);
      if (dist < minDist) {
        minDist = dist;
        nearestIdx = i;
      }
    }
    setHoveredIndex(nearestIdx);
  };

  const tooltipAlignClass = activeCoord
    ? activeCoord.xPct > 68
      ? "-translate-x-full -ml-2"
      : activeCoord.xPct < 32
        ? "translate-x-0 ml-2"
        : "-translate-x-1/2"
    : "";

  return (
    <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/80 p-4 flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold text-zinc-200">{title}</h4>
          {subtitle && (
            <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="text-right">
          <div className="text-sm font-mono font-bold text-zinc-100">
            {activeCoord
              ? fmt(activeCoord.value)
              : latest !== null
                ? fmt(latest)
                : "—"}
          </div>
          {activeCoord ? (
            <div className="text-[10px] font-mono text-zinc-400">
              {new Date(activeCoord.timestampMs).toLocaleTimeString()}
            </div>
          ) : (
            validPoints.length > 1 && (
              <div className="text-[10px] font-mono text-zinc-500">
                max {fmt(maxVal)}
              </div>
            )
          )}
        </div>
      </div>

      {coords.length < 2 ? (
        <div className="h-[108px] rounded-lg bg-zinc-950/60 border border-zinc-800/60 flex items-center justify-center text-[11px] text-zinc-500">
          {emptyText}
        </div>
      ) : (
        <div
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoveredIndex(null)}
          className="relative h-[108px] rounded-lg bg-zinc-950/60 border border-zinc-800/60 overflow-hidden cursor-crosshair select-none touch-none"
        >
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="w-full h-full pointer-events-none"
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity="0.30" />
                <stop offset="100%" stopColor={strokeColor} stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Horizontal subtle reference gridlines */}
            {[0.25, 0.5, 0.75].map((ratio) => {
              const y = padY + usableH * ratio;
              return (
                <line
                  key={ratio}
                  x1={padX}
                  x2={width - padX}
                  y1={y}
                  y2={y}
                  stroke="rgba(161, 161, 170, 0.10)"
                  strokeDasharray="3 3"
                />
              );
            })}

            <path d={areaPath} fill={`url(#${gradId})`} />
            <path
              d={linePath}
              fill="none"
              stroke={strokeColor}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>

          {/* Vertical Hover Crosshair */}
          {activeCoord && (
            <div
              className="absolute top-0 bottom-0 w-px border-l border-dashed border-zinc-400/50 pointer-events-none"
              style={{ left: `${activeCoord.xPct}%` }}
            />
          )}

          {/* Undistorted Active / Latest Point Dot */}
          {dotCoord && (
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none transition-all duration-75"
              style={{
                left: `${dotCoord.xPct}%`,
                top: `${dotCoord.yPct}%`,
                width: activeCoord ? "9px" : "7px",
                height: activeCoord ? "9px" : "7px",
                backgroundColor: strokeColor,
                boxShadow: activeCoord
                  ? `0 0 0 3px ${strokeColor}33`
                  : undefined,
              }}
            />
          )}

          {/* Edge-Aware Floating Tooltip */}
          {activeCoord && (
            <div
              className={`absolute top-2 z-10 px-2 py-1 rounded-md bg-zinc-900/95 border border-zinc-700/80 shadow-xl backdrop-blur-md pointer-events-none whitespace-nowrap ${tooltipAlignClass}`}
              style={{ left: `${activeCoord.xPct}%` }}
            >
              <div
                className="text-[11px] font-mono font-bold leading-tight"
                style={{ color: strokeColor }}
              >
                {fmt(activeCoord.value)}
              </div>
              <div className="text-[9px] font-mono text-zinc-400 leading-tight mt-0.5">
                {new Date(activeCoord.timestampMs).toLocaleTimeString()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
