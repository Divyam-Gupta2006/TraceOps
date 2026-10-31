'use client';

import React, { useState, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  Handle,
  Position,
  Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { Server, AlertCircle, ArrowRight, X, Layers, Activity, Clock, ShieldAlert } from 'lucide-react';

const CustomNode = ({ data }: any) => {
  const isDark = data.isDark !== false;
  const status = data.status || (data.hasError ? 'CRITICAL' : 'HEALTHY');
  const isCrit = status === 'CRITICAL';
  const isDeg = status === 'DEGRADED';

  return (
    <div
      onClick={() => data.onClick?.(data.label)}
      className={`px-3.5 py-3 rounded border text-xs font-mono transition-all cursor-pointer shadow-md ${
        isCrit
          ? isDark
            ? 'bg-[#1A1316] border-[#EF4444] text-[#F1F3F5] ring-1 ring-[#EF4444]/40 hover:border-[#EF4444]'
            : 'bg-[#FEF2F2] border-[#EF4444] text-[#991B1B] ring-1 ring-[#EF4444]/40'
          : isDeg
          ? isDark
            ? 'bg-[#1B1812] border-[#F59E0B] text-[#F1F3F5] ring-1 ring-[#F59E0B]/40'
            : 'bg-[#FFFBEB] border-[#F59E0B] text-[#92400E]'
          : isDark
          ? 'bg-[#15181D] border-[#262A31] text-[#F1F3F5] hover:border-[#3B82F6]'
          : 'bg-[#FFFFFF] border-[#CBD5E1] text-[#0F172A] hover:border-[#2563EB]'
      } min-w-[210px]`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className={isDark ? '!bg-[#262A31] !w-2 !h-2 !border-0' : '!bg-[#CBD5E1] !w-2 !h-2 !border-0'}
      />
      <div className="flex items-center gap-2.5">
        <div
          className={`p-1.5 rounded ${
            isCrit
              ? 'bg-[#EF4444]/20 text-[#EF4444]'
              : isDeg
              ? 'bg-[#F59E0B]/20 text-[#F59E0B]'
              : isDark
              ? 'bg-[#1C2026] text-[#9299A5]'
              : 'bg-[#F1F5F9] text-[#64748B]'
          }`}
        >
          {isCrit ? (
            <AlertCircle className="w-4 h-4 text-[#EF4444] animate-pulse" />
          ) : isDeg ? (
            <ShieldAlert className="w-4 h-4 text-[#F59E0B]" />
          ) : (
            <Server className="w-4 h-4 text-accent" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="font-semibold text-xs truncate text-text-primary">{data.label}</span>
            <span
              className={`text-[9px] uppercase font-semibold px-1 py-0.2 rounded ${
                isCrit
                  ? 'bg-status-error/15 text-status-error'
                  : isDeg
                  ? 'bg-status-warning/15 text-status-warning'
                  : 'bg-status-success/15 text-status-success'
              }`}
            >
              {status}
            </span>
          </div>
          <div className="text-[10px] text-text-secondary mt-1 flex items-center justify-between">
            <span>{data.totalRequests || 0} reqs</span>
            <span className={isCrit ? 'text-status-error font-semibold' : ''}>
              {data.avgLatencyMs ? `${data.avgLatencyMs} ms` : '< 50 ms'}
            </span>
          </div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className={isDark ? '!bg-[#262A31] !w-2 !h-2 !border-0' : '!bg-[#CBD5E1] !w-2 !h-2 !border-0'}
      />
    </div>
  );
};

const nodeTypes = { custom: CustomNode };

interface ServiceMapProps {
  traces: any[];
  serviceMetrics?: any[];
  isDark?: boolean;
  onSelectService?: (serviceName: string) => void;
}

export default function ServiceMap({
  traces = [],
  serviceMetrics = [],
  isDark = true,
  onSelectService,
}: ServiceMapProps) {
  const [selectedServiceName, setSelectedServiceName] = useState<string | null>(null);

  const { nodes, edges, serviceDependencies } = useMemo(() => {
    if (!traces || traces.length === 0) {
      return { nodes: [], edges: [], serviceDependencies: new Map<string, any>() };
    }

    const spanMap = new Map<string, string>();
    const edgesMap = new Map<string, any>();
    const services = new Set<string>();
    const depsMap = new Map<string, { callers: Set<string>; dependencies: Set<string> }>();

    // Pass 1: Catalog all spans to services
    traces.forEach((trace) => {
      (trace.spans || []).forEach((span: any) => {
        spanMap.set(span.spanId, span.serviceName);
        services.add(span.serviceName);
        if (!depsMap.has(span.serviceName)) {
          depsMap.set(span.serviceName, { callers: new Set(), dependencies: new Set() });
        }
      });
    });

    // Pass 2: Connect the dots using parentSpanId references
    traces.forEach((trace) => {
      (trace.spans || []).forEach((span: any) => {
        if (span.parentSpanId && spanMap.has(span.parentSpanId)) {
          const parentService = spanMap.get(span.parentSpanId)!;
          const childService = span.serviceName;

          if (parentService !== childService) {
            const edgeId = `${parentService}-${childService}`;
            const isError = span.statusCode === 2;

            if (!edgesMap.has(edgeId)) {
              edgesMap.set(edgeId, {
                source: parentService,
                target: childService,
                hasError: isError,
                calls: 0,
              });
            }
            const edge = edgesMap.get(edgeId);
            edge.calls++;
            if (isError) edge.hasError = true;

            depsMap.get(childService)?.callers.add(parentService);
            depsMap.get(parentService)?.dependencies.add(childService);
          }
        }
      });
    });

    // Dagre layout
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 120 });
    g.setDefaultEdgeLabel(() => ({}));

    const layoutNodes = Array.from(services).map((name) => {
      const metric = serviceMetrics.find((s) => s.name === name);
      const node = {
        id: name,
        type: 'custom',
        data: {
          label: name,
          status: metric?.status || 'HEALTHY',
          hasError: metric?.status === 'CRITICAL' || metric?.errorRate >= 25,
          totalRequests: metric?.totalRequests || 0,
          avgLatencyMs: metric?.avgLatencyMs || 0,
          errorRate: metric?.errorRate || 0,
          isDark,
          onClick: (svc: string) => {
            setSelectedServiceName(svc);
            onSelectService?.(svc);
          },
        },
        position: { x: 0, y: 0 },
      };
      g.setNode(name, { width: 220, height: 64 });
      return node;
    });

    const edgeColor = isDark ? '#3B82F6' : '#2563EB';
    const edgeErrorColor = isDark ? '#EF4444' : '#DC2626';

    const layoutEdges = Array.from(edgesMap.values()).map((edge) => {
      g.setEdge(edge.source, edge.target);
      return {
        id: `${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        animated: edge.hasError,
        label: `${edge.calls} calls`,
        labelStyle: { fill: isDark ? '#9299A5' : '#64748B', fontSize: 10, fontFamily: 'monospace' },
        labelBgStyle: { fill: isDark ? '#15181D' : '#FFFFFF', fillOpacity: 0.9 },
        style: {
          stroke: edge.hasError ? edgeErrorColor : edgeColor,
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edge.hasError ? edgeErrorColor : edgeColor,
          width: 14,
          height: 14,
        },
      };
    });

    dagre.layout(g);

    layoutNodes.forEach((node) => {
      const nodeWithPosition = g.node(node.id);
      node.position = {
        x: nodeWithPosition.x - 110,
        y: nodeWithPosition.y - 32,
      };
    });

    return { nodes: layoutNodes, edges: layoutEdges, serviceDependencies: depsMap };
  }, [traces, serviceMetrics, isDark, onSelectService]);

  const activeServiceMetric = selectedServiceName
    ? serviceMetrics.find((s) => s.name === selectedServiceName)
    : null;
  const activeServiceDeps = selectedServiceName
    ? serviceDependencies.get(selectedServiceName)
    : null;

  if (nodes.length === 0) {
    return (
      <div
        className={`w-full h-[480px] flex flex-col items-center justify-center rounded border ${
          isDark ? 'border-[#262A31] bg-[#15181D]' : 'border-[#E2E8F0] bg-[#FFFFFF]'
        }`}
      >
        <Layers className="w-8 h-8 text-text-secondary mb-2" />
        <p className="text-sm font-medium text-text-primary">No Architecture Topology Detected</p>
        <p className="text-xs text-text-secondary mt-1">
          Awaiting distributed traces with parent-child spans to render communication topology.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[600px] rounded border border-border bg-bg overflow-hidden flex">
      {/* Flow Diagram */}
      <div className="flex-1 h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background color={isDark ? '#1F2329' : '#CBD5E1'} gap={20} size={1} />
          <Controls
            className={
              isDark
                ? '!bg-[#15181D] !border-[#262A31] !fill-[#9299A5] !rounded !shadow-sm'
                : '!bg-[#FFFFFF] !border-[#E2E8F0] !fill-[#64748B] !rounded !shadow-sm'
            }
          />
        </ReactFlow>
      </div>

      {/* Side Inspector Panel (Revealed on click) */}
      {selectedServiceName && (
        <div className="w-80 border-l border-border bg-surface p-4 space-y-4 overflow-y-auto animate-in slide-in-from-right duration-200 shadow-xl z-20">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <div className="text-[10px] font-mono text-text-secondary uppercase tracking-wider">
                Service Inspector
              </div>
              <h4 className="text-sm font-semibold text-text-primary mt-0.5">{selectedServiceName}</h4>
            </div>
            <button
              onClick={() => setSelectedServiceName(null)}
              className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Health & Metrics Cards */}
          <div className="grid grid-cols-2 gap-2 font-mono text-xs">
            <div className="rounded border border-border bg-bg p-2.5">
              <span className="text-[10px] text-text-secondary block">Status</span>
              <span
                className={`font-semibold uppercase ${
                  activeServiceMetric?.status === 'CRITICAL'
                    ? 'text-status-error'
                    : activeServiceMetric?.status === 'DEGRADED'
                    ? 'text-status-warning'
                    : 'text-status-success'
                }`}
              >
                {activeServiceMetric?.status || 'HEALTHY'}
              </span>
            </div>

            <div className="rounded border border-border bg-bg p-2.5">
              <span className="text-[10px] text-text-secondary block">Error Rate</span>
              <span
                className={`font-semibold ${
                  activeServiceMetric?.errorRate > 0 ? 'text-status-error' : 'text-text-primary'
                }`}
              >
                {activeServiceMetric?.errorRate ? `${activeServiceMetric.errorRate.toFixed(1)}%` : '0.0%'}
              </span>
            </div>

            <div className="rounded border border-border bg-bg p-2.5">
              <span className="text-[10px] text-text-secondary block">Avg Latency</span>
              <span className="font-semibold text-text-primary">
                {activeServiceMetric?.avgLatencyMs || 0} ms
              </span>
            </div>

            <div className="rounded border border-border bg-bg p-2.5">
              <span className="text-[10px] text-text-secondary block">Total Requests</span>
              <span className="font-semibold text-text-primary">
                {activeServiceMetric?.totalRequests || 0}
              </span>
            </div>
          </div>

          {/* Upstream Callers */}
          <div className="space-y-1.5 font-mono text-xs">
            <div className="text-[11px] font-semibold text-text-primary flex items-center gap-1.5">
              <ArrowRight className="w-3.5 h-3.5 text-text-secondary rotate-180" /> Upstream Callers
            </div>
            {activeServiceDeps?.callers.size === 0 ? (
              <div className="text-[11px] text-text-secondary bg-bg p-2 rounded border border-border">
                Root entrance service (no upstream callers).
              </div>
            ) : (
              <div className="space-y-1">
                {Array.from<string>(activeServiceDeps?.callers || []).map((caller: string) => (
                  <button
                    key={caller}
                    onClick={() => setSelectedServiceName(caller)}
                    className="w-full text-left px-2.5 py-1.5 rounded border border-border bg-bg hover:border-accent text-accent transition flex items-center justify-between"
                  >
                    <span>{caller}</span>
                    <span className="text-[10px] text-text-secondary">Inspect →</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Downstream Dependencies */}
          <div className="space-y-1.5 font-mono text-xs">
            <div className="text-[11px] font-semibold text-text-primary flex items-center gap-1.5">
              <ArrowRight className="w-3.5 h-3.5 text-accent" /> Downstream Dependencies
            </div>
            {activeServiceDeps?.dependencies.size === 0 ? (
              <div className="text-[11px] text-text-secondary bg-bg p-2 rounded border border-border">
                Leaf service (database / external termination).
              </div>
            ) : (
              <div className="space-y-1">
                {Array.from<string>(activeServiceDeps?.dependencies || []).map((dep: string) => (
                  <button
                    key={dep}
                    onClick={() => setSelectedServiceName(dep)}
                    className="w-full text-left px-2.5 py-1.5 rounded border border-border bg-bg hover:border-accent text-text-primary transition flex items-center justify-between"
                  >
                    <span>{dep}</span>
                    <span className="text-[10px] text-accent">Inspect →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
