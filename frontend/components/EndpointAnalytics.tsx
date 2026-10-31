'use client';

import React, { useState } from 'react';
import { Search, ArrowUpDown, AlertCircle, Clock, Zap, AlertTriangle, Layers } from 'lucide-react';

interface EndpointMetric {
  endpoint: string;
  serviceName: string;
  totalRequests: number;
  rps: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errors: number;
  errorRate: number;
  latencyContributionPercent: number;
}

interface ErrorItem {
  errorType: string;
  serviceName: string;
  endpoint: string;
  count: number;
  percentage: number;
  lastSeen: string;
}

interface ServiceHealthItem {
  id: string;
  name: string;
  language: string;
  totalRequests: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs?: number;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
}

interface EndpointAnalyticsProps {
  endpoints: EndpointMetric[];
  errors: ErrorItem[];
  services: ServiceHealthItem[];
  onSelectEndpoint?: (endpoint: string) => void;
  onSelectService?: (service: string) => void;
}

export default function EndpointAnalytics({
  endpoints = [],
  errors = [],
  services = [],
  onSelectEndpoint,
  onSelectService,
}: EndpointAnalyticsProps) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'latency' | 'requests' | 'errors' | 'contribution'>('latency');

  const filtered = endpoints
    .filter(
      (e) =>
        e.endpoint.toLowerCase().includes(search.toLowerCase()) ||
        e.serviceName.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      if (sortBy === 'latency') return b.avgLatencyMs - a.avgLatencyMs;
      if (sortBy === 'requests') return b.totalRequests - a.totalRequests;
      if (sortBy === 'errors') return b.errors - a.errors;
      if (sortBy === 'contribution') return b.latencyContributionPercent - a.latencyContributionPercent;
      return 0;
    });

  return (
    <div className="space-y-6">
      {/* 1. Endpoint Comparison Table */}
      <div className="rounded border border-border bg-surface overflow-hidden">
        <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3 bg-surface">
          <div>
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent" /> Endpoint Comparison & Latency Attribution
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Identifies which API routes and downstream endpoints drive system-wide latency and errors.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                type="text"
                placeholder="Search endpoints..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-bg border border-border text-xs rounded pl-8 pr-3 py-1.5 text-text-primary focus:outline-none focus:border-accent w-56 font-mono"
              />
            </div>

            <div className="flex items-center gap-1 border border-border rounded p-0.5 bg-bg text-[11px] font-mono">
              <button
                onClick={() => setSortBy('latency')}
                className={`px-2 py-1 rounded transition ${
                  sortBy === 'latency' ? 'bg-surface font-semibold text-text-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Slowest
              </button>
              <button
                onClick={() => setSortBy('contribution')}
                className={`px-2 py-1 rounded transition ${
                  sortBy === 'contribution' ? 'bg-surface font-semibold text-text-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                % Latency
              </button>
              <button
                onClick={() => setSortBy('errors')}
                className={`px-2 py-1 rounded transition ${
                  sortBy === 'errors' ? 'bg-surface font-semibold text-text-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Errors
              </button>
              <button
                onClick={() => setSortBy('requests')}
                className={`px-2 py-1 rounded transition ${
                  sortBy === 'requests' ? 'bg-surface font-semibold text-text-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Traffic
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-border bg-bg/50 text-[11px] text-text-secondary uppercase tracking-wider">
                <th className="py-2.5 px-4 font-semibold">Endpoint / Operation</th>
                <th className="py-2.5 px-3 font-semibold">Service</th>
                <th className="py-2.5 px-3 font-semibold text-right">Requests</th>
                <th className="py-2.5 px-3 font-semibold text-right">Avg Latency</th>
                <th className="py-2.5 px-3 font-semibold text-right">p95 / p99</th>
                <th className="py-2.5 px-3 font-semibold text-right">Error Rate</th>
                <th className="py-2.5 px-4 font-semibold">Latency Contribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-text-secondary">
                    No endpoint telemetry records match your filter.
                  </td>
                </tr>
              ) : (
                filtered.map((ep, idx) => {
                  const isCritical = ep.avgLatencyMs > 2000 || ep.errorRate >= 25;
                  const isDegraded = ep.avgLatencyMs > 600 || ep.errorRate >= 5;

                  return (
                    <tr
                      key={idx}
                      onClick={() => onSelectEndpoint?.(ep.endpoint)}
                      className="hover:bg-surface-hover/80 transition cursor-pointer group"
                    >
                      <td className="py-3 px-4 font-medium text-text-primary flex items-center gap-2">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isCritical
                              ? 'bg-status-error'
                              : isDegraded
                              ? 'bg-status-warning'
                              : 'bg-status-success'
                          }`}
                        />
                        <span className="truncate max-w-xs">{ep.endpoint}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectService?.(ep.serviceName);
                          }}
                          className="px-2 py-0.5 rounded bg-bg border border-border text-[11px] text-accent hover:border-accent transition"
                        >
                          {ep.serviceName}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-text-primary">
                        {ep.totalRequests.toLocaleString()}{' '}
                        <span className="text-[10px] text-text-secondary">({ep.rps} rps)</span>
                      </td>
                      <td className="py-3 px-3 text-right font-semibold">
                        <span
                          className={
                            isCritical
                              ? 'text-status-error'
                              : isDegraded
                              ? 'text-status-warning'
                              : 'text-text-primary'
                          }
                        >
                          {ep.avgLatencyMs.toLocaleString()} ms
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right text-text-secondary text-[11px]">
                        {ep.p95LatencyMs} / {ep.p99LatencyMs} ms
                      </td>
                      <td className="py-3 px-3 text-right">
                        {ep.errorRate > 0 ? (
                          <span className="text-status-error font-semibold">
                            {ep.errorRate.toFixed(1)}%{' '}
                            <span className="text-[10px] text-text-secondary">({ep.errors})</span>
                          </span>
                        ) : (
                          <span className="text-text-secondary">0.0%</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-bg border border-border h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                ep.latencyContributionPercent > 40
                                  ? 'bg-status-error'
                                  : ep.latencyContributionPercent > 15
                                  ? 'bg-status-warning'
                                  : 'bg-accent'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(3, ep.latencyContributionPercent))}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-text-secondary w-9 text-right font-semibold">
                            {ep.latencyContributionPercent}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Grid: Error Distribution + Service Health Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Error Distribution Breakdown */}
        <div className="rounded border border-border bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-primary flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-status-error" /> Error Distribution by Root Cause
              </h4>
              <p className="text-[11px] text-text-secondary mt-0.5">Which HTTP errors and exceptions occur most frequently</p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-status-error/15 text-status-error border border-status-error/30">
              {errors.reduce((acc, e) => acc + e.count, 0)} total failures
            </span>
          </div>

          {errors.length === 0 ? (
            <div className="py-8 text-center text-xs text-status-success flex flex-col items-center gap-1.5">
              <span>✓ No error signatures recorded in the active time window.</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              {errors.map((err, i) => (
                <div
                  key={i}
                  className="rounded border border-border bg-bg p-3 space-y-1.5 hover:border-status-error/40 transition font-mono text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-status-error font-semibold flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {err.errorType}
                    </span>
                    <span className="text-text-primary font-semibold">
                      {err.count} errors ({err.percentage}%)
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-text-secondary">
                    <span>
                      Service:{' '}
                      <span className="text-accent hover:underline cursor-pointer">
                        {err.serviceName}
                      </span>
                    </span>
                    <span>Last: {new Date(err.lastSeen).toLocaleTimeString()}</span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-surface border border-border h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-status-error h-full rounded-full"
                      style={{ width: `${err.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Service Health Matrix */}
        <div className="rounded border border-border bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-primary flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-accent" /> Service Health Matrix
              </h4>
              <p className="text-[11px] text-text-secondary mt-0.5">Which microservices are struggling vs performing normally</p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-bg border border-border text-text-secondary">
              {services.length} services tracked
            </span>
          </div>

          <div className="space-y-2">
            {services.map((svc) => {
              const isCrit = svc.status === 'CRITICAL';
              const isDeg = svc.status === 'DEGRADED';

              return (
                <div
                  key={svc.id}
                  onClick={() => onSelectService?.(svc.name)}
                  className="rounded border border-border bg-bg p-3 flex items-center justify-between hover:border-accent/40 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isCrit
                          ? 'bg-status-error animate-pulse'
                          : isDeg
                          ? 'bg-status-warning'
                          : 'bg-status-success'
                      }`}
                    />
                    <div>
                      <div className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                        {svc.name}
                        <span className="text-[10px] font-mono text-text-secondary px-1.5 py-0.2 rounded bg-surface border border-border">
                          {svc.language || 'node'}
                        </span>
                      </div>
                      <div className="text-[11px] text-text-secondary font-mono">
                        {svc.totalRequests} reqs · {svc.avgLatencyMs} ms avg
                        {svc.p95LatencyMs ? ` · ${svc.p95LatencyMs} ms p95` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                        isCrit
                          ? 'bg-status-error/15 text-status-error border border-status-error/30'
                          : isDeg
                          ? 'bg-status-warning/15 text-status-warning border border-status-warning/30'
                          : 'bg-status-success/15 text-status-success border border-status-success/30'
                      }`}
                    >
                      {svc.status}
                    </span>
                    <div className="text-[10px] text-text-secondary mt-0.5">
                      {svc.errorRate.toFixed(1)}% error rate
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

