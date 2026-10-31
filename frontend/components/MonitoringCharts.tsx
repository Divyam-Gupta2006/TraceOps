'use client';

import React, { useState, useMemo } from 'react';

export interface TimeSeriesPoint {
  timestamp: number;
  label: string; // e.g. "19:42"
  value: number;
  secondaryValue?: number;
}

interface TimeSeriesChartProps {
  title: string;
  subtitle?: string;
  data: TimeSeriesPoint[];
  unit: string;
  primaryLabel: string;
  secondaryLabel?: string;
  primaryColor?: string;
  secondaryColor?: string;
  isDark?: boolean;
  height?: number;
}

export function TimeSeriesChart({
  title,
  subtitle,
  data,
  unit,
  primaryLabel,
  secondaryLabel,
  primaryColor = '#3B82F6',
  secondaryColor = '#EF4444',
  isDark = true,
  height = 160,
}: TimeSeriesChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { points, maxVal, minVal, yTicks } = useMemo(() => {
    if (!data || data.length === 0) {
      return { points: [], maxVal: 100, minVal: 0, yTicks: [0, 50, 100] };
    }

    let max = Math.max(
      ...data.map((d) => Math.max(d.value || 0, d.secondaryValue || 0)),
      1,
    );
    // Add 15% headroom
    max = Math.ceil(max * 1.15);
    const min = 0;

    const mid = Math.round(max / 2);
    const yTicks = [0, mid, max];

    return { points: data, maxVal: max, minVal: min, yTicks };
  }, [data]);

  const width = 600;
  const padding = { top: 20, right: 16, bottom: 28, left: 45 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const getX = (index: number) => {
    if (points.length <= 1) return padding.left + chartW / 2;
    return padding.left + (index / (points.length - 1)) * chartW;
  };

  const getY = (val: number) => {
    const norm = Math.min(1, Math.max(0, (val - minVal) / (maxVal - minVal || 1)));
    return padding.top + (1 - norm) * chartH;
  };

  const primaryPath = useMemo(() => {
    if (points.length === 0) return '';
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.value).toFixed(1)}`)
      .join(' ');
  }, [points, maxVal]);

  const primaryArea = useMemo(() => {
    if (points.length === 0) return '';
    const baseLine = getY(0);
    return `${primaryPath} L ${getX(points.length - 1).toFixed(1)} ${baseLine.toFixed(1)} L ${getX(0).toFixed(1)} ${baseLine.toFixed(1)} Z`;
  }, [primaryPath, points, maxVal]);

  const secondaryPath = useMemo(() => {
    if (!secondaryLabel || points.length === 0) return '';
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.secondaryValue || 0).toFixed(1)}`)
      .join(' ');
  }, [points, secondaryLabel, maxVal]);

  const hoveredPoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;

  const gridColor = isDark ? '#262A31' : '#E2E8F0';
  const textColor = isDark ? '#9299A5' : '#64748B';

  return (
    <div
      className={`rounded border p-4 space-y-3 transition-colors ${
        isDark ? 'border-[#262A31] bg-[#15181D]' : 'border-[#E2E8F0] bg-[#FFFFFF]'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h4 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-[#F1F3F5]' : 'text-[#0F172A]'}`}>
            {title}
          </h4>
          {subtitle && (
            <p className={`text-[11px] mt-0.5 ${textColor}`}>
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 rounded" style={{ backgroundColor: primaryColor }} />
            <span className={textColor}>{primaryLabel}</span>
          </div>
          {secondaryLabel && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 rounded" style={{ backgroundColor: secondaryColor }} />
              <span className={textColor}>{secondaryLabel}</span>
            </div>
          )}
        </div>
      </div>

      {points.length === 0 ? (
        <div className="h-[160px] flex items-center justify-center text-xs text-[#9299A5]">
          Awaiting telemetry intervals to plot trend...
        </div>
      ) : (
        <div className="relative w-full">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto overflow-visible select-none"
            onMouseLeave={() => setHoverIndex(null)}
          >
            {/* Grid Lines */}
            {yTicks.map((tick, i) => {
              const y = getY(tick);
              return (
                <g key={i}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={width - padding.right}
                    y2={y}
                    stroke={gridColor}
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <text
                    x={padding.left - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fill={textColor}
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    {tick}
                    {unit ? ` ${unit}` : ''}
                  </text>
                </g>
              );
            })}

            {/* X-axis time marks */}
            {points.map((p, i) => {
              // Show label on first, middle, and last points
              const show =
                i === 0 ||
                i === points.length - 1 ||
                i === Math.floor(points.length / 2);
              if (!show) return null;

              return (
                <text
                  key={i}
                  x={getX(i)}
                  y={height - 8}
                  textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                  fill={textColor}
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {p.label}
                </text>
              );
            })}

            {/* Primary Area Fill */}
            <path d={primaryArea} fill={primaryColor} fillOpacity={isDark ? '0.12' : '0.08'} />

            {/* Primary Line */}
            <path
              d={primaryPath}
              fill="none"
              stroke={primaryColor}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Secondary Line (if present) */}
            {secondaryPath && (
              <path
                d={secondaryPath}
                fill="none"
                stroke={secondaryColor}
                strokeWidth="1.5"
                strokeDasharray="2 2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Interactive Crosshair & Tooltip Overlay */}
            {points.map((p, i) => {
              const x = getX(i);
              return (
                <rect
                  key={i}
                  x={x - chartW / points.length / 2}
                  y={padding.top}
                  width={chartW / points.length}
                  height={chartH}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverIndex(i)}
                />
              );
            })}

            {hoveredPoint && hoverIndex !== null && (
              <g pointerEvents="none">
                <line
                  x1={getX(hoverIndex)}
                  y1={padding.top}
                  x2={getX(hoverIndex)}
                  y2={padding.top + chartH}
                  stroke={textColor}
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <circle
                  cx={getX(hoverIndex)}
                  cy={getY(hoveredPoint.value)}
                  r="3.5"
                  fill={primaryColor}
                  stroke={isDark ? '#15181D' : '#FFFFFF'}
                  strokeWidth="1.5"
                />
                {hoveredPoint.secondaryValue !== undefined && (
                  <circle
                    cx={getX(hoverIndex)}
                    cy={getY(hoveredPoint.secondaryValue)}
                    r="3.5"
                    fill={secondaryColor}
                    stroke={isDark ? '#15181D' : '#FFFFFF'}
                    strokeWidth="1.5"
                  />
                )}
              </g>
            )}
          </svg>

          {/* Hover Tooltip Box */}
          {hoveredPoint && hoverIndex !== null && (
            <div
              className={`absolute top-2 pointer-events-none rounded border px-2.5 py-1.5 text-[11px] font-mono shadow-md z-10 transition-all ${
                isDark
                  ? 'bg-[#0D0F12] border-[#262A31] text-[#F1F3F5]'
                  : 'bg-[#FFFFFF] border-[#E2E8F0] text-[#0F172A]'
              }`}
              style={{
                left: `${Math.min(80, Math.max(10, (hoverIndex / (points.length - 1)) * 100))}%`,
                transform: 'translateX(-50%)',
              }}
            >
              <div className="text-[10px] text-[#9299A5] mb-0.5">{hoveredPoint.label}</div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: primaryColor }} />
                <span>{primaryLabel}:</span>
                <span className="font-semibold">{hoveredPoint.value} {unit}</span>
              </div>
              {hoveredPoint.secondaryValue !== undefined && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: secondaryColor }} />
                  <span>{secondaryLabel}:</span>
                  <span className="font-semibold">{hoveredPoint.secondaryValue} {unit}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Latency Histogram Distribution Component
interface LatencyBucket {
  range: string;
  count: number;
  pct: number;
  status: 'fast' | 'moderate' | 'slow';
}

interface LatencyHistogramProps {
  title: string;
  subtitle?: string;
  buckets: LatencyBucket[];
  isDark?: boolean;
}

export function LatencyHistogram({
  title,
  subtitle,
  buckets,
  isDark = true,
}: LatencyHistogramProps) {
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const textColor = isDark ? '#9299A5' : '#64748B';

  return (
    <div
      className={`rounded border p-4 space-y-3 transition-colors ${
        isDark ? 'border-[#262A31] bg-[#15181D]' : 'border-[#E2E8F0] bg-[#FFFFFF]'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h4 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-[#F1F3F5]' : 'text-[#0F172A]'}`}>
            {title}
          </h4>
          {subtitle && (
            <p className={`text-[11px] mt-0.5 ${textColor}`}>
              {subtitle}
            </p>
          )}
        </div>
        <span className="text-[11px] font-mono text-[#9299A5]">
          {buckets.reduce((a, b) => a + b.count, 0)} spans analyzed
        </span>
      </div>

      <div className="space-y-2 pt-1 font-mono text-xs">
        {buckets.map((b, idx) => {
          const widthPct = Math.max(3, (b.count / maxCount) * 100);
          const barColor =
            b.status === 'slow'
              ? '#EF4444'
              : b.status === 'moderate'
              ? '#F59E0B'
              : '#22C55E';

          return (
            <div key={idx} className="flex items-center gap-3">
              <span className={`w-24 text-[11px] truncate text-right ${textColor}`}>
                {b.range}
              </span>

              <div className="flex-1 h-3 rounded bg-surface relative overflow-hidden">
                <div
                  style={{ width: `${widthPct}%`, backgroundColor: barColor }}
                  className="h-full rounded transition-all duration-300"
                />
              </div>

              <div className="w-16 text-right text-[11px] flex items-center justify-end gap-1.5">
                <span className={isDark ? 'text-[#F1F3F5]' : 'text-[#0F172A]'}>{b.count}</span>
                <span className={textColor}>({b.pct}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Microservice Error Contribution Bar Component
interface ServiceErrorItem {
  name: string;
  errors: number;
  total: number;
  errorRate: number;
}

interface ServiceErrorBreakdownProps {
  title: string;
  subtitle?: string;
  items: ServiceErrorItem[];
  isDark?: boolean;
}

export function ServiceErrorBreakdown({
  title,
  subtitle,
  items,
  isDark = true,
}: ServiceErrorBreakdownProps) {
  const textColor = isDark ? '#9299A5' : '#64748B';
  const totalErrors = items.reduce((a, b) => a + b.errors, 0);

  return (
    <div
      className={`rounded border p-4 space-y-3 transition-colors ${
        isDark ? 'border-[#262A31] bg-[#15181D]' : 'border-[#E2E8F0] bg-[#FFFFFF]'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h4 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-[#F1F3F5]' : 'text-[#0F172A]'}`}>
            {title}
          </h4>
          {subtitle && (
            <p className={`text-[11px] mt-0.5 ${textColor}`}>
              {subtitle}
            </p>
          )}
        </div>
        <span className="text-[11px] font-mono text-[#EF4444]">
          {totalErrors} total failures
        </span>
      </div>

      {items.length === 0 ? (
        <div className="p-6 text-center text-xs text-[#9299A5]">
          No errors detected across microservices.
        </div>
      ) : (
        <div className="space-y-2.5 pt-1 font-mono text-xs">
          {items.map((svc, idx) => {
            const sharePct = totalErrors > 0 ? Math.round((svc.errors / totalErrors) * 100) : 0;

            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className={`font-semibold ${isDark ? 'text-[#F1F3F5]' : 'text-[#0F172A]'}`}>
                    {svc.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[#EF4444]">{svc.errors} errors ({svc.errorRate}%)</span>
                    <span className={textColor}>· {sharePct}% of total</span>
                  </div>
                </div>

                <div className="w-full h-1.5 rounded bg-surface overflow-hidden">
                  <div
                    style={{ width: `${Math.max(2, sharePct)}%` }}
                    className="h-full rounded bg-[#EF4444] transition-all duration-300"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

