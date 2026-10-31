'use client';

import React from 'react';
import {
  Sparkles,
  AlertOctagon,
  AlertTriangle,
  Info,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Server,
  Zap,
} from 'lucide-react';

export interface InsightItem {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  description: string;
  evidence: {
    metric: string;
    value: string;
    baseline?: string;
    ratio?: string;
  };
  affectedServices: string[];
  affectedEndpoints: string[];
  suggestedAction: string;
}

interface IntelligentInsightsProps {
  insights: InsightItem[];
  onInvestigate?: (serviceOrEndpoint: string) => void;
}

export default function IntelligentInsights({
  insights = [],
  onInvestigate,
}: IntelligentInsightsProps) {
  if (insights.length === 0) {
    return (
      <div className="rounded border border-border bg-surface p-6 text-center space-y-2">
        <div className="inline-flex p-2 rounded-full bg-status-success/15 text-status-success border border-status-success/30">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-semibold text-text-primary">System Telemetry Stable & Nominal</h4>
        <p className="text-xs text-text-secondary max-w-md mx-auto">
          The deterministic analytics engine detected no baseline latency divergence, error clustering, or dependency saturation in the active window.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-primary">
            Automated Telemetry Insights & Correlations ({insights.length})
          </h3>
        </div>
        <span className="text-[11px] text-text-secondary font-mono">
          Deterministic Rule Engine · Live Analytics
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {insights.map((insight) => {
          const isCrit = insight.severity === 'CRITICAL';
          const isWarn = insight.severity === 'WARNING';

          return (
            <div
              key={insight.id}
              className={`rounded border p-4 space-y-3 transition-colors ${
                isCrit
                  ? 'border-status-error/40 bg-surface hover:border-status-error/70'
                  : isWarn
                  ? 'border-status-warning/40 bg-surface hover:border-status-warning/70'
                  : 'border-accent/40 bg-surface hover:border-accent/70'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <div
                    className={`p-1.5 rounded mt-0.5 ${
                      isCrit
                        ? 'bg-status-error/15 text-status-error'
                        : isWarn
                        ? 'bg-status-warning/15 text-status-warning'
                        : 'bg-accent/15 text-accent'
                    }`}
                  >
                    {isCrit ? (
                      <AlertOctagon className="w-4 h-4" />
                    ) : isWarn ? (
                      <AlertTriangle className="w-4 h-4" />
                    ) : (
                      <Info className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold uppercase ${
                        isCrit
                          ? 'bg-status-error/15 text-status-error border border-status-error/30'
                          : isWarn
                          ? 'bg-status-warning/15 text-status-warning border border-status-warning/30'
                          : 'bg-accent/15 text-accent border border-accent/30'
                      }`}
                    >
                      {insight.severity}
                    </span>
                    <h4 className="text-xs font-semibold text-text-primary mt-1.5 leading-snug">
                      {insight.title}
                    </h4>
                  </div>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-text-secondary leading-relaxed">
                {insight.description}
              </p>

              {/* Supporting Evidence Card */}
              {insight.evidence && (
                <div className="rounded bg-bg border border-border p-2.5 font-mono text-[11px] space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-text-secondary font-sans font-semibold">
                    Supporting Evidence:
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                    <span className="text-text-secondary">{insight.evidence.metric}:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-text-primary">{insight.evidence.value}</span>
                      {insight.evidence.baseline && (
                        <span className="text-text-secondary text-[10px]">
                          (baseline: {insight.evidence.baseline})
                        </span>
                      )}
                      {insight.evidence.ratio && (
                        <span
                          className={`px-1.5 py-0.2 rounded font-semibold text-[10px] ${
                            isCrit
                              ? 'bg-status-error/20 text-status-error'
                              : 'bg-status-warning/20 text-status-warning'
                          }`}
                        >
                          {insight.evidence.ratio}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Affected Services & Endpoints */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                <span className="text-text-secondary text-[10px]">Affected:</span>
                {insight.affectedServices.map((svc) => (
                  <button
                    key={svc}
                    onClick={() => onInvestigate?.(svc)}
                    className="flex items-center gap-1 bg-bg hover:bg-surface-hover text-accent border border-border px-1.5 py-0.5 rounded transition text-[10px]"
                  >
                    <Server className="w-2.5 h-2.5" />
                    {svc}
                  </button>
                ))}
                {insight.affectedEndpoints.slice(0, 2).map((ep) => (
                  <button
                    key={ep}
                    onClick={() => onInvestigate?.(ep)}
                    className="flex items-center gap-1 bg-bg hover:bg-surface-hover text-text-primary border border-border px-1.5 py-0.5 rounded transition text-[10px] truncate max-w-[180px]"
                  >
                    <Zap className="w-2.5 h-2.5 text-accent" />
                    {ep}
                  </button>
                ))}
              </div>

              {/* Suggested Action Callout */}
              <div className="rounded bg-accent/10 border border-accent/25 p-2.5 flex items-start justify-between gap-2">
                <div className="flex items-start gap-1.5 text-xs text-text-primary">
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
                  <span className="leading-snug">
                    <strong className="font-semibold text-accent">Action:</strong> {insight.suggestedAction}
                  </span>
                </div>
                {onInvestigate && (
                  <button
                    onClick={() =>
                      onInvestigate(
                        insight.affectedEndpoints[0] ||
                          insight.affectedServices[0] ||
                          'traces',
                      )
                    }
                    className="shrink-0 flex items-center gap-1 text-[11px] font-mono text-accent hover:underline mt-0.5"
                  >
                    Investigate <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

