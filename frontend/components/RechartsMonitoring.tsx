'use client';

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from 'recharts';
import { Activity, Clock, AlertTriangle } from 'lucide-react';

interface TimeSeriesPoint {
  timestamp: number;
  label: string;
  requests: number;
  rps: number;
  errors: number;
  errorRate: number;
  avgLatency: number;
  p50: number;
  p95: number;
  p99: number;
}

interface RechartsMonitoringProps {
  data: TimeSeriesPoint[];
  isDark?: boolean;
  timeWindow: string;
  onWindowChange: (w: string) => void;
  onDrillDown?: (metric: string) => void;
}

export default function RechartsMonitoring({
  data,
  isDark = true,
  timeWindow,
  onWindowChange,
  onDrillDown,
}: RechartsMonitoringProps) {
  const gridColor = isDark ? '#262A31' : '#E2E8F0';
  const textColor = isDark ? '#9299A5' : '#64748B';
  const tooltipBg = isDark ? '#15181D' : '#FFFFFF';
  const tooltipBorder = isDark ? '#262A31' : '#CBD5E1';

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div
          style={{
            backgroundColor: tooltipBg,
            borderColor: tooltipBorder,
          }}
          className="rounded border p-2.5 shadow-lg text-xs font-mono space-y-1 z-50 pointer-events-none"
        >
          <div className="text-[11px] font-sans font-semibold text-text-primary pb-1 border-b border-border">
            Time: {label}
          </div>
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                {entry.name}:
              </span>
              <span className="font-semibold text-text-primary">
                {entry.value} {entry.unit || ''}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Time Window Selector & Real-Time Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-border rounded px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold text-text-primary">Continuous Telemetry Streams</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-bg border border-border text-text-secondary">
            {data.length} telemetry samples
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-text-secondary mr-1">Time Range:</span>
          {['10s', '15m', '1h', '6h', '24h'].map((w) => (
            <button
              key={w}
              onClick={() => onWindowChange(w)}
              className={`text-xs font-mono px-2.5 py-1 rounded border transition flex items-center gap-1 ${
                timeWindow === w
                  ? 'bg-accent/15 border-accent text-accent font-semibold ring-1 ring-accent/30'
                  : 'bg-bg border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              {w === '10s' && (
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    timeWindow === '10s' ? 'bg-accent animate-ping' : 'bg-status-success'
                  }`}
                />
              )}
              {w === '10s' ? '10s' : w}
            </button>
          ))}
        </div>
      </div>

      {/* 3 Interactive Grid Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart 1: Request Throughput */}
        <div
          onClick={() => onDrillDown?.('throughput')}
          className="rounded border border-border bg-surface p-4 space-y-3 cursor-pointer hover:border-accent/40 transition"
          title="Click to inspect endpoint throughput breakdown"
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-primary flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-accent" /> Request Throughput & Errors
              </h4>
              <p className="text-[11px] text-text-secondary mt-0.5">Traffic volume and failed requests over time</p>
            </div>
            <span className="text-[10px] font-mono text-accent">Drill-down →</span>
          </div>

          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="reqGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="errGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" stroke={textColor} fontSize={10} tickLine={false} />
                <YAxis stroke={textColor} fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="requests"
                  name="Requests"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#reqGradient)"
                />
                <Area
                  type="monotone"
                  dataKey="errors"
                  name="Errors"
                  stroke="#EF4444"
                  strokeWidth={1.5}
                  fillOpacity={1}
                  fill="url(#errGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-text-secondary border-t border-border pt-2">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1 bg-[#3B82F6] rounded" /> Requests
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1 bg-[#EF4444] rounded" /> Failed Requests
            </span>
          </div>
        </div>

        {/* Chart 2: Latency Percentiles */}
        <div
          onClick={() => onDrillDown?.('latency')}
          className="rounded border border-border bg-surface p-4 space-y-3 cursor-pointer hover:border-accent/40 transition"
          title="Click to view slowest operations"
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-primary flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-status-warning" /> Latency Percentiles (p50 / p95 / p99)
              </h4>
              <p className="text-[11px] text-text-secondary mt-0.5">Response degradation and tail latency</p>
            </div>
            <span className="text-[10px] font-mono text-accent">Drill-down →</span>
          </div>

          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" stroke={textColor} fontSize={10} tickLine={false} />
                <YAxis stroke={textColor} fontSize={10} tickLine={false} unit="ms" />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="p50"
                  name="p50 Latency"
                  unit="ms"
                  stroke="#3B82F6"
                  strokeWidth={1.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="p95"
                  name="p95 Latency"
                  unit="ms"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="p99"
                  name="p99 Latency"
                  unit="ms"
                  stroke="#EF4444"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-text-secondary border-t border-border pt-2">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1 bg-[#3B82F6] rounded" /> p50 (median)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1 bg-[#F59E0B] rounded" /> p95 (critical)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1 bg-[#EF4444] rounded border-b border-dashed" /> p99 (tail)
            </span>
          </div>
        </div>

        {/* Chart 3: Error Rate Timeline */}
        <div
          onClick={() => onDrillDown?.('errors')}
          className="rounded border border-border bg-surface p-4 space-y-3 cursor-pointer hover:border-accent/40 transition"
          title="Click to view error distribution"
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-primary flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-status-error" /> Error Rate Timeline
              </h4>
              <p className="text-[11px] text-text-secondary mt-0.5">Failure rate against 1.0% SLO error budget</p>
            </div>
            <span className="text-[10px] font-mono text-accent">Drill-down →</span>
          </div>

          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="rateGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" stroke={textColor} fontSize={10} tickLine={false} />
                <YAxis stroke={textColor} fontSize={10} tickLine={false} unit="%" domain={[0, 'auto']} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={1.0} stroke="#F59E0B" strokeDasharray="3 3" label="" />
                <Area
                  type="monotone"
                  dataKey="errorRate"
                  name="Error Rate"
                  unit="%"
                  stroke="#EF4444"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#rateGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-text-secondary border-t border-border pt-2">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1 bg-[#EF4444] rounded" /> Measured Failure %
            </span>
            <span className="flex items-center gap-1.5 text-status-warning">
              <span className="w-2.5 h-0.5 bg-[#F59E0B] rounded border-b border-dashed" /> 1.0% SLO Threshold
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

