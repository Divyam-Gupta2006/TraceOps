'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Cpu,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Key,
  Layers,
  FolderPlus,
  LogIn,
  LogOut,
  Moon,
  Network,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  Sun,
  Terminal,
  User,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import ServiceMap from '@/components/ServiceMap';
import RechartsMonitoring from '@/components/RechartsMonitoring';
import EndpointAnalytics from '@/components/EndpointAnalytics';
import IntelligentInsights from '@/components/IntelligentInsights';
import {
  TimeSeriesChart,
  LatencyHistogram,
  ServiceErrorBreakdown,
  TimeSeriesPoint,
} from '@/components/MonitoringCharts';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

type TabType = 'overview' | 'performance' | 'errors' | 'traces' | 'logs' | 'topology' | 'connect';

export default function TraceOpsApp() {
  const router = useRouter();
  const { user: currentUser, token: authToken, isLoading: authLoading, logout } = useAuth();

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [projects, setProjects] = useState<any[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [dashboard, setDashboard] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [timeWindow, setTimeWindow] = useState<string>('1h');
  const [selectedTrace, setSelectedTrace] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [newProjectModal, setNewProjectModal] = useState<boolean>(false);
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [newProjectStack, setNewProjectStack] = useState<string>('Next.js · Node.js · PostgreSQL');
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [livePulse, setLivePulse] = useState<boolean>(false);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [connectionTestResult, setConnectionTestResult] = useState<string | null>(null);

  const [projectCredentials, setProjectCredentials] = useState<{ id: string; name: string; apiKey: string } | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [showRawKey, setShowRawKey] = useState<boolean>(false);

  // Filters
  const [traceSearch, setTraceSearch] = useState<string>('');
  const [traceStatusFilter, setTraceStatusFilter] = useState<'all' | 'error' | 'ok'>('all');
  const [logSearch, setLogSearch] = useState<string>('');
  const [logLevelFilter, setLogLevelFilter] = useState<string>('ALL');

  // Load and apply theme
  useEffect(() => {
    const saved = localStorage.getItem('traceops_theme') as 'dark' | 'light' | null;
    const initial = saved || 'dark';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
    document.documentElement.classList.toggle('light', initial === 'light');
  }, []);

  // Protect route: redirect to login if unauthenticated once auth check finishes
  useEffect(() => {
    if (!authLoading && !currentUser) {
      router.replace('/login');
    }
  }, [authLoading, currentUser, router]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('traceops_theme', next);
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.classList.toggle('light', next === 'light');
  };

  const isDark = theme === 'dark';

  const fetchProjects = useCallback(async () => {
    if (!authToken) return;
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${authToken}`,
      };
      const res = await fetch(`${API_BASE}/api/projects`, { headers });
      if (!res.ok) {
        if (res.status === 401) {
          logout();
        }
        return;
      }
      const data = await res.json();
      setProjects(data);
      if (data.length > 0) {
        const savedId = typeof window !== 'undefined' ? localStorage.getItem('traceops_active_project') : null;
        const matched = savedId && data.find((p: any) => p.id === savedId);
        setActiveProjectId((prev) => {
          if (prev && data.some((p: any) => p.id === prev)) return prev;
          return matched ? matched.id : data[0].id;
        });
      } else {
        setActiveProjectId('');
        setDashboard(null);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
  }, [authToken, logout]);

  const fetchDashboard = useCallback(
    async (projId: string, windowArg = timeWindow, isSilent = false) => {
      if (!projId || !authToken) return;
      try {
        const headers: Record<string, string> = {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Authorization: `Bearer ${authToken}`,
        };
        const res = await fetch(
          `${API_BASE}/api/projects/${projId}/dashboard?window=${windowArg}&_t=${Date.now()}`,
          {
            cache: 'no-store',
            headers,
          },
        );
        if (res.status === 401) {
          logout();
          return;
        }
        if (res.status === 403) {
          setDashboard({ error: 'Access Denied: You do not have permission to view telemetry for this project.' });
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        setDashboard(data);
        if (!isSilent) {
          setSelectedTrace((prev: any) => prev || (data.traces?.length > 0 ? data.traces[0] : null));
        }
      } catch (err) {
        console.error('Failed to fetch dashboard:', err);
      }
    },
    [timeWindow, authToken, logout],
  );

  const fetchProjectCredentials = useCallback(
    async (projId: string) => {
      if (!projId) return;
      try {
        const headers: Record<string, string> = {};
        const token = authToken;
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/api/projects/${projId}/credentials`, { headers });
        if (res.ok) {
          const data = await res.json();
          setProjectCredentials(data);
          setCredentialError(null);
        } else if (res.status === 403) {
          setProjectCredentials(null);
          setCredentialError('Restricted: Ingestion API keys are only visible to the project owner or administrators.');
        } else {
          setProjectCredentials(null);
        }
      } catch (err) {
        console.error('Failed to fetch credentials:', err);
      }
    },
    [authToken],
  );

  const handleLogout = () => {
    setProjectCredentials(null);
    setShowRawKey(false);
    logout();
  };

  useEffect(() => {
    if (activeProjectId && activeTab === 'connect') {
      fetchProjectCredentials(activeProjectId);
    }
  }, [activeProjectId, activeTab, fetchProjectCredentials]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (activeProjectId) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('traceops_active_project', activeProjectId);
      }
      fetchDashboard(activeProjectId, timeWindow);
    }
  }, [activeProjectId, timeWindow, fetchDashboard, authToken]);

  // Real-time WebSocket subscription + 3s Heartbeat
  useEffect(() => {
    if (!activeProjectId) return;
    const token = authToken;

    if (!token) return;

    const socket: Socket = io(API_BASE, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 20,
      auth: { token },
    });
    const joinProjectRoom = () => {
  socket.emit('project:join', {
    projectId: activeProjectId,
  });
};

socket.on('connect', joinProjectRoom);

if (socket.connected) {
  joinProjectRoom();
}

socket.on('project:join:error', (error) => {
  console.error('WebSocket project access denied:', error.message);
});

    const onIncoming = (payload?: any) => {
      setLivePulse(true);
      setTimeout(() => setLivePulse(false), 1200);

      // Instantly update card numbers from socket payload without waiting for HTTP round-trip
      if (payload?.latestSpan || payload?.totalRequests !== undefined) {
        setDashboard((prev: any) => {
          if (!prev) return prev;
          const oldHealth = prev.systemHealth || {};
          return {
            ...prev,
            systemHealth: {
              ...oldHealth,
              totalRequests: payload.totalRequests ?? ((oldHealth.totalRequests || 0) + (payload.count || 1)),
              currentLatencyMs: payload.latestSpan ? payload.latestSpan.durationMs : oldHealth.currentLatencyMs,
              latestEndpoint: payload.latestSpan ? `${payload.latestSpan.serviceName}: ${payload.latestSpan.operationName}` : oldHealth.latestEndpoint,
              latestStatusCode: payload.latestSpan?.statusCode ?? oldHealth.latestStatusCode,
              latestTime: payload.latestSpan ? new Date(payload.latestSpan.startTime).toLocaleTimeString() : oldHealth.latestTime,
            },
          };
        });
      }

      fetchDashboard(activeProjectId, timeWindow, true);
    };

    socket.on(`telemetry:${activeProjectId}`, onIncoming);

    socket.on(`incident:${activeProjectId}`, () => onIncoming());

    const intervalMs = timeWindow === '10s' ? 1000 : 3000;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchDashboard(activeProjectId, timeWindow, true);
      }
    }, intervalMs);

    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, [activeProjectId, timeWindow, fetchDashboard, authToken]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = authToken;
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: newProjectName, framework: newProjectStack }),
      });
      if (!res.ok) return;
      const created = await res.json();
      setProjects((prev) => [...prev, created]);
      setActiveProjectId(created.id);
      setSelectedTrace(null);
      setNewProjectName('');
      setNewProjectModal(false);
      setActiveTab('connect');
      fetchProjectCredentials(created.id);
    } catch (err) {
      console.error('Failed to create project:', err);
    }
  };

  const triggerNormalTelemetry = async () => {
    if (!activeProjectId) return;
    setIsSimulating(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = authToken;
      if (token) headers['Authorization'] = `Bearer ${token}`;
      await fetch(`${API_BASE}/api/projects/${activeProjectId}/simulate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ mode: 'normal' }),
      });
      await fetchDashboard(activeProjectId);
    } catch (err) {
      console.error('Telemetry generation error:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleResolveIncident = async (id: string) => {
    try {
      const headers: Record<string, string> = {};
      const token = authToken;
      if (token) headers['Authorization'] = `Bearer ${token}`;
      await fetch(`${API_BASE}/api/incidents/${id}/resolve`, { method: 'POST', headers });
      fetchDashboard(activeProjectId);
    } catch (err) {
      console.error('Failed to resolve incident:', err);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const currentProject = dashboard?.project;
  const activeApiKey = projectCredentials?.apiKey || currentProject?.apiKey;

  const testIngestionPing = async () => {
    if (!activeApiKey) return;
    setTestingConnection(true);
    setConnectionTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/v1/traces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-traceops-key': activeApiKey,
        },
        body: JSON.stringify({
          serviceName: currentProject?.name || 'test-client',
          operationName: 'GET /health-check',
          durationMs: 45,
          statusCode: 200,
        }),
      });
      if (res.ok) {
        setConnectionTestResult('success');
        fetchDashboard(activeProjectId);
        setTimeout(() => setConnectionTestResult(null), 4000);
      } else {
        setConnectionTestResult(`failed: HTTP ${res.status}`);
      }
    } catch (e: any) {
      setConnectionTestResult(`failed: ${e.message}`);
    } finally {
      setTestingConnection(false);
    }
  };
  const traces = dashboard?.traces || [];
  const serviceMetrics = dashboard?.serviceMetrics || [];
  const rawLogs = dashboard?.recentLogs || [];
  const incidents = dashboard?.incidents || [];
  const openIncidents = incidents.filter((i: any) => i.status === 'OPEN' || i.status === 'REOPENED');
  const systemHealth = dashboard?.systemHealth;
  const timeSeries = dashboard?.timeSeries || [];
  const endpointAnalytics = dashboard?.endpointAnalytics || [];
  const errorDistribution = dashboard?.errorDistribution || [];
  const intelligentInsights = dashboard?.intelligentInsights || [];

  const totalRequests = systemHealth?.totalRequests ?? traces.reduce((acc: number, t: any) => acc + (t.spans?.length || 0), 0);
  const avgLatency = systemHealth?.avgLatencyMs ?? 0;
  const p50 = systemHealth?.p50Ms ?? 0;
  const p90 = systemHealth?.p90Ms ?? 0;
  const p95 = systemHealth?.p95Ms ?? 0;
  const p99 = systemHealth?.p99Ms ?? 0;
  const systemErrorRate = systemHealth?.errorRate ?? 0;
  const errorBudgetRemaining = systemHealth?.errorBudgetRemainingPercent ?? 100;
  const rps = systemHealth?.rps ?? 0;
  const healthyCount = systemHealth?.healthyCount ?? serviceMetrics.filter((s: any) => s.status === 'HEALTHY').length;
  const degradedCount = systemHealth?.degradedCount ?? serviceMetrics.filter((s: any) => s.status === 'DEGRADED').length;
  const criticalCount = systemHealth?.criticalCount ?? serviceMetrics.filter((s: any) => s.status === 'CRITICAL').length;

  // Compute aggregated system metrics fallback
  const { slowOperations } = useMemo(() => {
    const allSpans: any[] = [];
    traces.forEach((t: any) => {
      (t.spans || []).forEach((s: any) => allSpans.push(s));
    });

    const total = allSpans.length;
    const errors = allSpans.filter((s: any) => s.statusCode === 2).length;
    const errorRate = total > 0 ? (errors / total) * 100 : 0;

    const durations = allSpans.map((s: any) => s.durationMs).sort((a, b) => a - b);
    const avg = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    const getP = (pct: number) => {
      if (durations.length === 0) return 0;
      const idx = Math.min(durations.length - 1, Math.floor((pct / 100) * durations.length));
      return Math.round(durations[idx]);
    };

    // Group slowest operations
    const opMap = new Map<string, { serviceName: string; count: number; totalDuration: number; errors: number; maxDuration: number }>();
    allSpans.forEach((s) => {
      const key = `${s.serviceName}::${s.operationName}`;
      if (!opMap.has(key)) {
        opMap.set(key, { serviceName: s.serviceName, count: 0, totalDuration: 0, errors: 0, maxDuration: 0 });
      }
      const entry = opMap.get(key)!;
      entry.count++;
      entry.totalDuration += s.durationMs;
      if (s.statusCode === 2) entry.errors++;
      entry.maxDuration = Math.max(entry.maxDuration, s.durationMs);
    });

    const slowest = Array.from(opMap.entries())
      .map(([key, data]) => {
        const [, opName] = key.split('::');
        return {
          operationName: opName,
          serviceName: data.serviceName,
          count: data.count,
          avgDurationMs: Math.round((data.totalDuration / data.count) * 10) / 10,
          maxDurationMs: Math.round(data.maxDuration),
          errorRate: Math.round((data.errors / data.count) * 100),
        };
      })
      .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
      .slice(0, 8);

    return {
      slowOperations: slowest,
    };
  }, [traces]);

  // Compute Time Series Trend Data for Live Monitoring Charts
  const { throughputPoints, latencyPoints, percentilePoints, errorRatePoints } = useMemo(() => {
    const allSpans: any[] = [];
    traces.forEach((t: any) => {
      (t.spans || []).forEach((s: any) => allSpans.push(s));
    });

    if (allSpans.length === 0) {
      return { throughputPoints: [], latencyPoints: [], percentilePoints: [], errorRatePoints: [] };
    }

    const spanTimes = allSpans.map((s) => new Date(s.startTime).getTime());
    const maxSpanTime = Math.max(...spanTimes);
    const minSpanTime = Math.min(...spanTimes);
    // If telemetry is streaming recently (within last 15 min), anchor right edge to Date.now()
    const isStreamingRecent = Date.now() - maxSpanTime < 15 * 60 * 1000;
    const endTime = isStreamingRecent ? Date.now() : maxSpanTime;
    const totalTimeSpan = Math.max(endTime - minSpanTime, 10 * 60 * 1000); // minimum 10 min window
    const bucketCount = 10;
    const bucketSpanMs = Math.max(30 * 1000, Math.ceil(totalTimeSpan / bucketCount));
    const startTime = endTime - bucketCount * bucketSpanMs;

    const tpPoints: TimeSeriesPoint[] = [];
    const latPoints: TimeSeriesPoint[] = [];
    const pctPoints: TimeSeriesPoint[] = [];
    const errPoints: TimeSeriesPoint[] = [];

    for (let i = 0; i < bucketCount; i++) {
      const bStart = startTime + i * bucketSpanMs;
      const bEnd = bStart + bucketSpanMs;
      const d = new Date(bEnd);
      const label = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

      const bSpans = allSpans.filter((s) => {
        const t = new Date(s.startTime).getTime();
        return t >= bStart && t < bEnd;
      });

      const count = bSpans.length;
      const errors = bSpans.filter((s) => s.statusCode === 2).length;
      const rate = count > 0 ? Math.round((errors / count) * 1000) / 10 : 0;

      const durs = bSpans.map((s) => s.durationMs).sort((a, b) => a - b);
      const avg = durs.length > 0 ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0;
      const p50 = durs.length > 0 ? Math.round(durs[Math.floor(durs.length * 0.5)]) : 0;
      const p95 = durs.length > 0 ? Math.round(durs[Math.min(durs.length - 1, Math.floor(durs.length * 0.95))]) : 0;
      const p99 = durs.length > 0 ? Math.round(durs[Math.min(durs.length - 1, Math.floor(durs.length * 0.99))]) : 0;

      tpPoints.push({ timestamp: bEnd, label, value: count, secondaryValue: errors });
      latPoints.push({ timestamp: bEnd, label, value: avg, secondaryValue: p95 });
      pctPoints.push({ timestamp: bEnd, label, value: p50, secondaryValue: p99 });
      errPoints.push({ timestamp: bEnd, label, value: rate, secondaryValue: 1.0 });
    }

    return {
      throughputPoints: tpPoints,
      latencyPoints: latPoints,
      percentilePoints: pctPoints,
      errorRatePoints: errPoints,
    };
  }, [traces]);

  // Compute Latency Histogram Buckets for Performance Tab
  const latencyBuckets = useMemo(() => {
    const allSpans: any[] = [];
    traces.forEach((t: any) => {
      (t.spans || []).forEach((s: any) => allSpans.push(s));
    });

    const total = Math.max(1, allSpans.length);
    const ranges = [
      { range: '< 50ms', min: 0, max: 50, status: 'fast' as const },
      { range: '50 - 200ms', min: 50, max: 200, status: 'fast' as const },
      { range: '200 - 500ms', min: 200, max: 500, status: 'moderate' as const },
      { range: '500ms - 1s', min: 500, max: 1000, status: 'moderate' as const },
      { range: '1s - 2s', min: 1000, max: 2000, status: 'slow' as const },
      { range: '> 2s', min: 2000, max: Infinity, status: 'slow' as const },
    ];

    return ranges.map((r) => {
      const count = allSpans.filter((s) => s.durationMs >= r.min && s.durationMs < r.max).length;
      return {
        range: r.range,
        count,
        pct: Math.round((count / total) * 100),
        status: r.status,
      };
    });
  }, [traces]);

  // Compute Service Error Breakdown Items for Errors Tab
  const serviceErrorItems = useMemo(() => {
    return serviceMetrics
      .map((svc: any) => {
        const errors = Math.round((svc.totalRequests * (svc.errorRate || 0)) / 100);
        return {
          name: svc.name,
          errors,
          total: svc.totalRequests,
          errorRate: svc.errorRate,
        };
      })
      .filter((s: any) => s.errors > 0 || s.total > 0)
      .sort((a: any, b: any) => b.errors - a.errors);
  }, [serviceMetrics]);

  // Filtered Traces
  const filteredTraces = useMemo(() => {
    return traces.filter((t: any) => {
      const matchesSearch =
        !traceSearch ||
        t.rootOperation.toLowerCase().includes(traceSearch.toLowerCase()) ||
        t.rootService.toLowerCase().includes(traceSearch.toLowerCase()) ||
        t.traceId.toLowerCase().includes(traceSearch.toLowerCase());

      const matchesStatus =
        traceStatusFilter === 'all'
          ? true
          : traceStatusFilter === 'error'
          ? t.hasError
          : !t.hasError;

      return matchesSearch && matchesStatus;
    });
  }, [traces, traceSearch, traceStatusFilter]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return rawLogs.filter((l: any) => {
      const matchesSearch =
        !logSearch ||
        l.body.toLowerCase().includes(logSearch.toLowerCase()) ||
        l.serviceName.toLowerCase().includes(logSearch.toLowerCase()) ||
        (l.traceId && l.traceId.toLowerCase().includes(logSearch.toLowerCase()));

      let matchesLevel = true;
      if (logLevelFilter === 'ALL') {
        matchesLevel = true;
      } else if (logLevelFilter === 'INCIDENTS') {
        matchesLevel = l.body.includes('[INCIDENT]') || l.body.includes('[REGRESSION');
      } else if (logLevelFilter === 'SUGGESTIONS') {
        matchesLevel = l.body.includes('[SUGGESTION') || l.body.includes('[AI HYPOTHESIS') || l.body.includes('[ACTION');
      } else if (logLevelFilter === 'RESOLVED') {
        matchesLevel = l.body.includes('[RESOLVED]');
      } else {
        matchesLevel = (l.severity || '').toUpperCase() === logLevelFilter;
      }

      return matchesSearch && matchesLevel;
    });
  }, [rawLogs, logSearch, logLevelFilter]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 rounded bg-surface border border-border flex items-center justify-center">
          <Activity className="w-5 h-5 text-accent animate-pulse" />
        </div>
        <span className="text-xs text-text-secondary font-mono">Verifying workspace session...</span>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-bg text-text-primary flex flex-col font-sans transition-colors duration-150">
      {/* Top Navbar */}
      <header className="border-b border-border bg-surface px-5 py-2.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 transition-colors duration-150">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-bg border border-border flex items-center justify-center">
              <Activity className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-text-primary">TraceOps</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border text-text-secondary bg-bg">
              v2.4
            </span>
          </div>

          <div className="h-4 w-px bg-border" />

          {/* Project Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary">Project:</span>
            {projects.length > 0 ? (
              <select
                value={activeProjectId}
                onChange={(e) => {
                  setSelectedTrace(null);
                  setActiveProjectId(e.target.value);
                }}
                className="bg-bg border border-border text-xs rounded px-2.5 py-1 text-text-primary focus:outline-none focus:border-accent font-mono"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-text-muted italic px-2 py-1 bg-bg border border-border rounded font-mono">
                No projects
              </span>
            )}
            <button
              onClick={() => setNewProjectModal(true)}
              className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary bg-bg hover:bg-surface-hover px-2 py-1 rounded border border-border transition"
              title="Add New Project"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </div>
        </div>

        {/* Status Indicators & Live Actions */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded border border-border bg-bg font-mono text-[11px]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                livePulse ? 'bg-status-success animate-ping' : 'bg-status-success'
              }`}
            />
            <span className="text-text-secondary">OTLP :4000</span>
          </div>

          <div className="h-4 w-px bg-border" />

          <button
            disabled={isSimulating}
            onClick={triggerNormalTelemetry}
            className="flex items-center gap-1.5 bg-bg hover:bg-surface-hover text-text-primary border border-border px-2.5 py-1 rounded transition disabled:opacity-50 text-xs font-medium"
            title="Send test telemetry payload"
          >
            <Zap className="w-3 h-3 text-accent" /> Send Normal Telemetry
          </button>

          {/* User Auth Session Pill */}
          {currentUser ? (
            <div className="flex items-center gap-1.5 pl-1">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-bg text-xs">
                <User className="w-3.5 h-3.5 text-accent" />
                <span className="font-medium text-text-primary max-w-[120px] truncate" title={currentUser.email}>
                  {currentUser.name || currentUser.email}
                </span>
                <span
                  className={`text-[9px] font-mono px-1 py-0.2 rounded border font-semibold ${
                    currentUser.role === 'ADMIN'
                      ? 'border-purple-500/40 text-purple-400 bg-purple-500/10'
                      : 'border-border text-text-secondary bg-surface'
                  }`}
                >
                  {currentUser.role}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded border border-border bg-bg hover:bg-surface-hover text-text-secondary hover:text-status-error transition"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => router.push('/login')}
              className="flex items-center gap-1.5 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 px-2.5 py-1 rounded transition text-xs font-medium"
            >
              <LogIn className="w-3 h-3" /> Sign In
            </button>
          )}

          <div className="h-4 w-px bg-border" />

          {/* Dark / Light Mode Toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded border border-border bg-bg hover:bg-surface-hover text-text-secondary hover:text-text-primary transition"
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="border-b border-border bg-bg px-5 flex items-center gap-1 text-xs font-medium transition-colors duration-150">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3, count: openIncidents.length },
          { id: 'performance', label: 'Performance', icon: Clock },
          { id: 'errors', label: 'Errors', icon: AlertTriangle, count: traces.filter((t: any) => t.hasError).length },
          { id: 'traces', label: 'Traces', icon: Layers, count: traces.length },
          { id: 'logs', label: 'Logs', icon: FileText, count: rawLogs.length },
          { id: 'topology', label: 'Topology', icon: Network },
          { id: 'connect', label: 'Connect SDK', icon: Code2 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                isActive
                  ? 'border-accent text-text-primary font-semibold'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && tab.count > 0 && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    tab.id === 'overview' && openIncidents.length > 0
                      ? 'bg-status-error/15 text-status-error border border-status-error/30'
                      : 'bg-border text-text-secondary'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Container */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto p-5 space-y-5">
        {projects.length === 0 ? (
          <div className="rounded border border-border bg-surface p-12 text-center max-w-lg mx-auto my-12 space-y-4 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto text-accent">
              <FolderPlus className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-text-primary">No Projects Found</h2>
              <p className="text-xs text-text-secondary leading-relaxed">
                You do not have any projects in your workspace yet. Create your first project to receive an API key and start streaming traces and logs.
              </p>
            </div>
            <div className="pt-2">
              <button
                onClick={() => setNewProjectModal(true)}
                className="inline-flex items-center gap-2 bg-accent hover:bg-accent-muted text-white text-xs font-medium px-4 py-2 rounded transition shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Create Your First Project
              </button>
            </div>
          </div>
        ) : dashboard?.error ? (
          <div className="rounded border border-status-error/30 bg-status-error/10 p-10 text-center space-y-3 my-8">
            <ShieldAlert className="w-12 h-12 text-status-error mx-auto" />
            <h3 className="text-base font-semibold text-text-primary">Project Access Restricted</h3>
            <p className="text-sm text-text-secondary max-w-md mx-auto">
              {dashboard.error}
            </p>
            <p className="text-xs text-text-muted">
              Select an authorized project or sign in with an authorized account.
            </p>
          </div>
        ) : (
          <>
            {/* ===================== TAB 1: OVERVIEW ===================== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Section A: Actionable Service Health Overview */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {/* Metric 1: Total Requests & RPS */}
              <div
                onClick={() => setActiveTab('performance')}
                className={`p-3.5 rounded border transition-all cursor-pointer group ${
                  livePulse
                    ? 'border-accent ring-1 ring-accent/40 bg-accent/5'
                    : 'border-border bg-surface hover:border-accent/50'
                }`}
                title="Click to view endpoint comparison"
              >
                <div className="flex items-center justify-between text-text-secondary text-[11px] uppercase tracking-wider mb-1">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        livePulse ? 'bg-accent animate-ping' : 'bg-status-success'
                      }`}
                    />
                    Throughput
                  </span>
                  <span className="font-mono text-[10px] text-accent group-hover:underline">details →</span>
                </div>
                <div className="text-xl font-mono font-semibold text-text-primary">
                  {totalRequests.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-text-secondary">reqs</span>
                </div>
                <div className="text-[11px] text-text-secondary mt-1 flex items-center gap-1 font-mono">
                  <span>RPS:</span>
                  <span className="text-text-primary font-semibold">
                    {systemHealth?.liveRps ?? rps}
                  </span>
                  <span className="text-status-success ml-1">
                    · {livePulse ? 'pulse' : 'live'}
                  </span>
                </div>
              </div>

              {/* Metric 2: Average, p95, p99 Latency */}
              <div
                onClick={() => setActiveTab('performance')}
                className={`p-3.5 rounded border transition-all cursor-pointer group ${
                  livePulse
                    ? 'border-accent ring-1 ring-accent/40 bg-accent/5'
                    : 'border-border bg-surface hover:border-accent/50'
                }`}
                title="Click to view latency percentiles & slowest operations"
              >
                <div className="flex items-center justify-between text-text-secondary text-[11px] uppercase tracking-wider mb-1">
                  <span>Latency Profile</span>
                  <span className="font-mono text-[10px] text-accent group-hover:underline">details →</span>
                </div>
                <div className="text-xl font-mono font-semibold text-text-primary flex items-baseline">
                  <span>{systemHealth?.currentLatencyMs ?? avgLatency}</span>
                  <span className="text-xs font-normal text-text-secondary ml-1 font-sans">
                    ms ({systemHealth?.currentLatencyMs !== undefined ? 'latest' : 'avg'})
                  </span>
                </div>
                <div className="text-[11px] text-text-secondary mt-1 flex items-center gap-1.5 font-mono truncate">
                  <span>avg: {avgLatency}ms</span>
                  <span>· p95:</span>
                  <span className={p95 > 1000 ? 'text-status-error font-semibold' : 'text-text-primary'}>
                    {p95}ms
                  </span>
                </div>
              </div>

              {/* Metric 3: Error Rate & Error Budget */}
              <div
                onClick={() => setActiveTab('errors')}
                className={`p-3.5 rounded border transition-all cursor-pointer group ${
                  livePulse
                    ? 'border-accent ring-1 ring-accent/40 bg-accent/5'
                    : 'border-border bg-surface hover:border-accent/50'
                }`}
                title="Click to view error distribution"
              >
                <div className="flex items-center justify-between text-text-secondary text-[11px] uppercase tracking-wider mb-1">
                  <span>Error Rate</span>
                  <span className="font-mono text-[10px] text-accent group-hover:underline">details →</span>
                </div>
                <div
                  className={`text-xl font-mono font-semibold flex items-baseline ${
                    (systemHealth?.liveErrorRate ?? systemErrorRate) >= 10
                      ? 'text-status-error'
                      : (systemHealth?.liveErrorRate ?? systemErrorRate) > 0
                      ? 'text-status-warning'
                      : 'text-status-success'
                  }`}
                >
                  <span>{systemHealth?.liveErrorRate ?? systemErrorRate}%</span>
                  <span className="text-xs font-normal text-text-secondary ml-1 font-sans">live</span>
                </div>
                <div className="text-[11px] text-text-secondary mt-1 flex items-center gap-1 font-mono">
                  <span>SLO Budget:</span>
                  <span
                    className={`font-semibold ${
                      errorBudgetRemaining < 50
                        ? 'text-status-error'
                        : errorBudgetRemaining < 90
                        ? 'text-status-warning'
                        : 'text-status-success'
                    }`}
                  >
                    {errorBudgetRemaining}%
                  </span>
                  <span className="text-text-secondary">rem.</span>
                </div>
              </div>

              {/* Metric 4: Healthy, Degraded, Unhealthy Services */}
              <div
                onClick={() => setActiveTab('topology')}
                className={`p-3.5 rounded border transition-all cursor-pointer group ${
                  livePulse
                    ? 'border-accent ring-1 ring-accent/40 bg-accent/5'
                    : 'border-border bg-surface hover:border-accent/50'
                }`}
                title="Click to view dependency topology map"
              >
                <div className="flex items-center justify-between text-text-secondary text-[11px] uppercase tracking-wider mb-1">
                  <span>Service Fleet</span>
                  <span className="font-mono text-[10px] text-accent group-hover:underline">map →</span>
                </div>
                <div className="text-base font-mono font-semibold text-text-primary flex items-center gap-1.5 mt-0.5">
                  <span className="text-status-success">{healthyCount} OK</span>
                  <span>·</span>
                  <span className={degradedCount > 0 ? 'text-status-warning' : 'text-text-secondary'}>
                    {degradedCount} Deg
                  </span>
                  <span>·</span>
                  <span className={criticalCount > 0 ? 'text-status-error font-bold' : 'text-text-secondary'}>
                    {criticalCount} Crit
                  </span>
                </div>
                <div className="text-[11px] text-text-secondary mt-1.5 font-mono truncate">
                  {serviceMetrics.length} services · {systemHealth?.latestEndpoint ? systemHealth.latestEndpoint.slice(0, 18) : 'nominal'}
                </div>
              </div>

              {/* Metric 5: Active Incidents */}
              <div
                onClick={() => {
                  const el = document.getElementById('incident-investigation-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className={`p-3.5 rounded border transition cursor-pointer group ${
                  openIncidents.length > 0
                    ? 'border-status-error/50 bg-status-error/10 hover:border-status-error'
                    : livePulse
                    ? 'border-accent ring-1 ring-accent/40 bg-accent/5'
                    : 'border-border bg-surface hover:border-accent/50'
                }`}
                title="Click to view root cause investigations"
              >
                <div className="flex items-center justify-between text-text-secondary text-[11px] uppercase tracking-wider mb-1">
                  <span>Active Incidents</span>
                  <span className="font-mono text-[10px] text-accent group-hover:underline">triage →</span>
                </div>
                <div className="text-xl font-mono font-semibold flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      openIncidents.length > 0 ? 'bg-status-error animate-ping' : 'bg-status-success'
                    }`}
                  />
                  <span className={openIncidents.length > 0 ? 'text-status-error' : 'text-status-success'}>
                    {openIncidents.length > 0 ? `${openIncidents.length} Issue${openIncidents.length === 1 ? '' : 's'}` : '0 Issues'}
                  </span>
                </div>
                <div className="text-[11px] text-text-secondary mt-1 font-mono truncate">
                  {openIncidents.length > 0 ? 'RCA engine alert' : 'Nominal operations'}
                </div>
              </div>
            </div>

            {/* Section C: Intelligent Telemetry Insights */}
            <IntelligentInsights
              insights={intelligentInsights}
              onInvestigate={(target) => {
                if (target === 'traces') setActiveTab('traces');
                else if (serviceMetrics.some((s: any) => s.name === target)) setActiveTab('topology');
                else setActiveTab('performance');
              }}
            />

            {/* Section B: Recharts Telemetry Visualisation */}
            <RechartsMonitoring
              data={timeSeries}
              isDark={isDark}
              timeWindow={timeWindow}
              onWindowChange={(w) => {
                setTimeWindow(w);
                fetchDashboard(activeProjectId, w);
              }}
              onDrillDown={(metric) => {
                if (metric === 'throughput' || metric === 'latency') setActiveTab('performance');
                else if (metric === 'errors') setActiveTab('errors');
              }}
            />

            {/* Section E: Enhanced Incident Root-Cause Investigation */}
            <div id="incident-investigation-section" className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-status-error" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-primary">
                    Incident Root-Cause Investigation ({openIncidents.length} active)
                  </h3>
                </div>
                <span className="text-[11px] text-text-secondary font-mono">
                  Multi-Hop Dependency Traversal + Groq Interpretation
                </span>
              </div>

              {openIncidents.length === 0 ? (
                <div className="rounded border border-border bg-surface p-6 text-center space-y-2">
                  <div className="inline-flex p-2 rounded-full bg-status-success/15 text-status-success border border-status-success/30">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-semibold text-text-primary">No Active Incidents</h4>
                  <p className="text-xs text-text-secondary max-w-md mx-auto">
                    All monitored services are operating within normal latency and error rate parameters.
                  </p>
                </div>
              ) : (
                openIncidents.map((inc: any) => {
                  const ev = inc.evidencePacket;
                  const traceChain = ev?.traceChain || [];
                  const errLogs = ev?.correlatedErrorLogs || [];

                  return (
                    <div
                      key={inc.id}
                      className="rounded border border-status-error/40 bg-surface p-5 space-y-5 shadow-lg"
                    >
                      {/* Header with title & badges */}
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold ${
                              inc.status === 'REOPENED' || (inc.recurrenceCount && inc.recurrenceCount > 0)
                                ? 'bg-status-error text-white font-bold animate-pulse'
                                : 'bg-status-error/15 text-status-error border border-status-error/30'
                            }`}
                          >
                            {inc.status === 'REOPENED' || (inc.recurrenceCount && inc.recurrenceCount > 0)
                              ? `RECURRED (#${(inc.recurrenceCount || 0) + 1})`
                              : inc.severity}
                          </span>
                          <h3 className="text-sm font-semibold text-text-primary">{inc.title}</h3>
                          <span className="text-xs text-text-secondary">
                            · Detected {new Date(inc.detectedAt).toLocaleTimeString()}
                            {inc.resolvedAt && (
                              <span className="text-status-warning font-mono ml-1">
                                (Prev. Resolved {new Date(inc.resolvedAt).toLocaleTimeString()})
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right text-xs font-mono">
                            <span className="text-text-secondary">Confidence: </span>
                            <span className="text-accent font-semibold">{inc.confidenceScore}%</span>
                          </div>
                          <button
                            onClick={() => handleResolveIncident(inc.id)}
                            className="text-xs bg-status-success/15 hover:bg-status-success/25 text-status-success border border-status-success/30 px-3 py-1 rounded font-medium transition"
                          >
                            Mark Resolved
                          </button>
                        </div>
                      </div>

                      {/* Regression Alert Banner if Error Recurred */}
                      {(inc.regressionWarning || inc.status === 'REOPENED' || (inc.recurrenceCount && inc.recurrenceCount > 0)) && (
                        <div className="rounded border border-status-error/60 bg-status-error/10 p-3.5 space-y-2 border-l-4 border-l-status-error">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-status-error font-bold text-xs uppercase tracking-wider font-mono">
                              <AlertTriangle className="w-4 h-4 text-status-error shrink-0" />
                              <span>⚠️ Regression Alert: Error Not Fixed!</span>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-status-error text-white text-[10px] font-mono font-bold">
                              Recurrence Attempt #{(inc.recurrenceCount || 0) + 1}
                            </span>
                          </div>
                          <p className="text-xs text-text-primary leading-relaxed font-sans">
                            {inc.regressionWarning ||
                              `This incident recurred on service "${inc.rootService}" after being previously marked resolved. The underlying root cause was not permanently resolved.`}
                          </p>
                          {inc.resolvedAt && (
                            <div className="text-[11px] text-text-secondary font-mono pt-1.5 border-t border-status-error/20 flex flex-wrap gap-4">
                              <span>Marked Resolved: {new Date(inc.resolvedAt).toLocaleString()}</span>
                              <span>Recurred: {new Date(inc.detectedAt).toLocaleString()}</span>
                              <span className="text-status-error font-semibold">Status: REOPENED (Awaiting Fix)</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Key Diagnostic Strip: First Abnormal Metric, Suspected Root Cause, Affected Endpoints */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
                        <div className="rounded border border-border bg-bg p-3 space-y-1">
                          <span className="text-[10px] uppercase tracking-wider text-text-secondary font-sans font-semibold flex items-center gap-1">
                            <Clock className="w-3 h-3 text-status-warning" /> First Abnormal Metric
                          </span>
                          <div className="text-sm font-semibold text-status-error">
                            {Math.round(inc.latencyPeakMs)} ms peak latency
                          </div>
                          <div className="text-[11px] text-text-secondary">
                            Error spike reached {inc.errorRatePeak}%
                          </div>
                        </div>

                        <div className="rounded border border-border bg-bg p-3 space-y-1">
                          <span className="text-[10px] uppercase tracking-wider text-text-secondary font-sans font-semibold flex items-center gap-1">
                            <Server className="w-3 h-3 text-accent" /> Suspected Root Cause
                          </span>
                          <div className="text-sm font-semibold text-accent truncate">
                            {inc.rootService}
                          </div>
                          <div className="text-[11px] text-text-secondary truncate">
                            Resource exhaustion / thread queue timeout
                          </div>
                        </div>

                        <div className="rounded border border-border bg-bg p-3 space-y-1">
                          <span className="text-[10px] uppercase tracking-wider text-text-secondary font-sans font-semibold flex items-center gap-1">
                            <Zap className="w-3 h-3 text-accent" /> Affected Endpoints / Services
                          </span>
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {(inc.affectedServices || [inc.rootService]).map((s: string) => (
                              <span
                                key={s}
                                className="px-1.5 py-0.2 rounded text-[10px] bg-surface border border-border text-text-primary"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* AI Hypothesis / Root-Cause Diagnosis */}
                      <div className="rounded border border-border bg-bg p-3.5 space-y-2 text-xs leading-relaxed">
                        <div className="text-[11px] font-semibold uppercase text-accent flex items-center gap-1.5 font-mono">
                          <Cpu className="w-3.5 h-3.5" /> AI Root Cause Diagnosis
                        </div>
                        <p className="text-text-primary leading-relaxed">{inc.aiHypothesis}</p>
                      </div>

                      {/* Incident Timeline & Trace Call Chain */}
                      <div className="rounded border border-border bg-bg p-3.5 space-y-3 text-xs">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary font-mono flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-accent" /> Incident Timeline & Call Chain Propagation
                        </div>

                        <div className="flex flex-wrap items-center gap-2 font-mono text-xs overflow-x-auto py-1">
                          <div className="px-2.5 py-1.5 rounded bg-surface border border-border text-text-secondary">
                            T-0: Ingress Traffic
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                          {traceChain.map((s: any, idx: number) => {
                            const isCulprit = s.serviceName === inc.rootService;
                            return (
                              <React.Fragment key={idx}>
                                <div
                                  className={`px-2.5 py-1.5 rounded border text-xs shrink-0 ${
                                    isCulprit
                                      ? 'bg-status-error/15 border-status-error text-status-error font-semibold'
                                      : 'bg-surface border-border text-text-primary'
                                  }`}
                                >
                                  <div>{s.serviceName}</div>
                                  <div className="text-[10px] text-text-secondary">
                                    {s.operationName} · {Math.round(s.durationMs)}ms
                                  </div>
                                </div>
                                {idx < traceChain.length - 1 && (
                                  <ArrowRight className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>

                      {/* Recommended Remediation & Correlated Logs Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
                        <div className="p-3.5 rounded border border-border bg-bg space-y-2.5">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-1.5 font-mono">
                            <CheckCircle2 className="w-3.5 h-3.5 text-status-success" /> Recommended Remediation Checklist
                          </div>
                          <ol className="list-decimal list-inside space-y-1.5 text-text-primary">
                            {(inc.aiRecommendations || []).map((rec: string, idx: number) => (
                              <li key={idx} className="leading-snug">
                                {rec}
                              </li>
                            ))}
                          </ol>
                        </div>

                        <div className="p-3.5 rounded border border-border bg-bg space-y-2.5">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-1.5 font-mono">
                            <Terminal className="w-3.5 h-3.5 text-status-error" /> Correlated Diagnostic Logs
                          </div>
                          <div className="space-y-1.5 font-mono text-[11px]">
                            {errLogs.length === 0 ? (
                              <div className="text-text-secondary">No direct error log records captured.</div>
                            ) : (
                              errLogs.map((log: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="p-2 rounded bg-surface border border-border text-status-error leading-relaxed"
                                >
                                  <span className="text-text-secondary">[{log.serviceName}]</span> {log.body}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Microservices Health Table */}
            <div className="rounded border border-border bg-surface overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-primary">
                    Microservices Inventory & Health
                  </h3>
                  <p className="text-[11px] text-text-secondary mt-0.5">
                    Discovered services, error rates, and average latencies in active window.
                  </p>
                </div>
                <span className="text-xs font-mono text-text-secondary">
                  {serviceMetrics.length} service{serviceMetrics.length === 1 ? '' : 's'} registered
                </span>
              </div>

              {serviceMetrics.length === 0 ? (
                <div className="p-8 text-center text-xs text-text-secondary">
                  No microservices detected yet. Send normal telemetry or connect an app in the Connect SDK tab.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border bg-bg text-text-secondary text-[11px] uppercase tracking-wider">
                        <th className="py-2.5 px-4 font-medium">Service Name</th>
                        <th className="py-2.5 px-4 font-medium">Runtime / SDK</th>
                        <th className="py-2.5 px-4 font-medium">Status</th>
                        <th className="py-2.5 px-4 font-medium font-mono text-right">Requests</th>
                        <th className="py-2.5 px-4 font-medium font-mono text-right">Avg Latency</th>
                        <th className="py-2.5 px-4 font-medium font-mono text-right">Error Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {serviceMetrics.map((svc: any) => (
                        <tr
                          key={svc.id}
                          onClick={() => {
                            setActiveTab('topology');
                          }}
                          className="hover:bg-surface-hover transition-colors cursor-pointer"
                        >
                          <td className="py-2.5 px-4 font-semibold text-text-primary flex items-center gap-2">
                            <Server className="w-3.5 h-3.5 text-text-secondary" />
                            {svc.name}
                          </td>
                          <td className="py-2.5 px-4 font-mono uppercase text-text-secondary">
                            {svc.language || 'nodejs'}
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                                svc.status === 'CRITICAL'
                                  ? 'bg-status-error/15 text-status-error border border-status-error/30'
                                  : svc.status === 'DEGRADED'
                                  ? 'bg-status-warning/15 text-status-warning border border-status-warning/30'
                                  : 'bg-status-success/15 text-status-success border border-status-success/30'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  svc.status === 'CRITICAL'
                                    ? 'bg-status-error'
                                    : svc.status === 'DEGRADED'
                                    ? 'bg-status-warning'
                                    : 'bg-status-success'
                                }`}
                              />
                              {svc.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono text-right text-text-primary">
                            {svc.totalRequests}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-right">
                            <span
                              className={
                                svc.avgLatencyMs >= 1500
                                  ? 'text-status-error font-semibold'
                                  : svc.avgLatencyMs >= 500
                                  ? 'text-status-warning'
                                  : 'text-text-primary'
                              }
                            >
                              {svc.avgLatencyMs} ms
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono text-right">
                            <span
                              className={
                                svc.errorRate >= 20
                                  ? 'text-status-error font-semibold'
                                  : svc.errorRate > 0
                                  ? 'text-status-warning'
                                  : 'text-status-success'
                              }
                            >
                              {svc.errorRate}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================== TAB 2: PERFORMANCE ===================== */}
        {activeTab === 'performance' && (
          <div className="space-y-6">
            {/* Latency Percentile Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'P50 (Median)', value: p50, desc: '50% of requests complete faster' },
                { label: 'P90 Latency', value: p90, desc: '90th percentile response time' },
                { label: 'P95 Latency', value: p95, desc: 'Critical user experience tier' },
                { label: 'P99 Tail Latency', value: p99, desc: 'Slowest 1% worst-case ceiling' },
              ].map((p, idx) => (
                <div key={idx} className="p-3.5 rounded border border-border bg-surface">
                  <div className="text-[11px] uppercase tracking-wider text-text-secondary mb-1 font-medium">
                    {p.label}
                  </div>
                  <div className="text-xl font-mono font-semibold text-text-primary">
                    {p.value} <span className="text-xs font-normal text-text-secondary">ms</span>
                  </div>
                  <div className="text-[11px] text-text-secondary mt-1">{p.desc}</div>
                </div>
              ))}
            </div>

            {/* Recharts Continuous Latency & Throughput Streams */}
            <RechartsMonitoring
              data={timeSeries}
              isDark={isDark}
              timeWindow={timeWindow}
              onWindowChange={(w) => {
                setTimeWindow(w);
                fetchDashboard(activeProjectId, w);
              }}
            />

            {/* Section B: Endpoint Comparison & Analytics Table */}
            <EndpointAnalytics
              endpoints={endpointAnalytics}
              errors={errorDistribution}
              services={serviceMetrics}
              onSelectEndpoint={(ep) => {
                setTraceSearch(ep);
                setActiveTab('traces');
              }}
              onSelectService={() => {
                setActiveTab('topology');
              }}
            />
          </div>
        )}

        {/* ===================== TAB 3: ERRORS ===================== */}
        {activeTab === 'errors' && (
          <div className="space-y-5">
            {/* Error Metrics Strip */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded border border-border bg-surface">
                <div className="text-[11px] uppercase tracking-wider text-text-secondary mb-1 font-medium">
                  Failed Traces
                </div>
                <div className="text-xl font-mono font-semibold text-status-error">
                  {traces.filter((t: any) => t.hasError).length} / {traces.length}
                </div>
                <div className="text-[11px] text-text-secondary mt-1 font-mono">
                  {systemErrorRate}% overall trace failure rate
                </div>
              </div>

              <div className="p-3.5 rounded border border-border bg-surface">
                <div className="text-[11px] uppercase tracking-wider text-text-secondary mb-1 font-medium">
                  Error Logs Recorded
                </div>
                <div className="text-xl font-mono font-semibold text-text-primary">
                  {rawLogs.filter((l: any) => (l.severity || '').toUpperCase() === 'ERROR').length}
                </div>
                <div className="text-[11px] text-text-secondary mt-1 font-mono">
                  Captured across all microservice boundaries
                </div>
              </div>

              <div className="p-3.5 rounded border border-border bg-surface">
                <div className="text-[11px] uppercase tracking-wider text-text-secondary mb-1 font-medium">
                  Open Anomaly Cases
                </div>
                <div className="text-xl font-mono font-semibold text-status-warning">
                  {openIncidents.length}
                </div>
                <div className="text-[11px] text-text-secondary mt-1 font-mono">
                  AI automated correlation active
                </div>
              </div>
            </div>

            {/* Error Monitoring Graphs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TimeSeriesChart
                title="Failure Rate vs SLO Limit"
                subtitle="Calculated error percentage compared against 1.0% error budget"
                data={errorRatePoints}
                unit="%"
                primaryLabel="Error Rate"
                secondaryLabel="SLO Target (1%)"
                primaryColor="#EF4444"
                secondaryColor="#22C55E"
                isDark={isDark}
                height={170}
              />

              <ServiceErrorBreakdown
                title="Failures by Microservice"
                subtitle="Contribution percentage of each service to total system failures"
                items={serviceErrorItems}
                isDark={isDark}
              />
            </div>

            {/* Error Distribution & Culprit Breakdown */}
            <EndpointAnalytics
              endpoints={endpointAnalytics.filter((e) => e.errors > 0)}
              errors={errorDistribution}
              services={serviceMetrics.filter((s) => s.errorRate > 0)}
              onSelectEndpoint={(ep) => {
                setTraceSearch(ep);
                setActiveTab('traces');
              }}
              onSelectService={() => {
                setActiveTab('topology');
              }}
            />

            {/* Error Traces Table */}
            <div className="rounded border border-border bg-surface overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-primary">
                    Recent Faults & Error Signatures
                  </h3>
                  <p className="text-[11px] text-text-secondary mt-0.5">
                    Traces and logs that threw unhandled exceptions or HTTP 5xx errors.
                  </p>
                </div>
              </div>

              {traces.filter((t: any) => t.hasError).length === 0 ? (
                <div className="p-8 text-center text-xs text-text-secondary flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-status-success" />
                  <span>No error spans detected in current trace buffer.</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border bg-bg text-text-secondary text-[11px] uppercase tracking-wider font-mono">
                        <th className="py-2.5 px-4 font-medium">Timestamp</th>
                        <th className="py-2.5 px-4 font-medium">Root Endpoint</th>
                        <th className="py-2.5 px-4 font-medium">Failing Service</th>
                        <th className="py-2.5 px-4 font-medium text-right">Latency</th>
                        <th className="py-2.5 px-4 font-medium text-right">Trace ID</th>
                        <th className="py-2.5 px-4 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50 font-mono">
                      {traces
                        .filter((t: any) => t.hasError)
                        .map((t: any) => (
                          <tr key={t.traceId} className="hover:bg-surface-hover transition-colors">
                            <td className="py-2.5 px-4 text-text-secondary">
                              {new Date(t.startTime).toLocaleTimeString()}
                            </td>
                            <td className="py-2.5 px-4 text-text-primary font-semibold">{t.rootOperation}</td>
                            <td className="py-2.5 px-4 text-status-error">{t.rootService}</td>
                            <td className="py-2.5 px-4 text-right text-status-error font-semibold">
                              {t.durationMs} ms
                            </td>
                            <td className="py-2.5 px-4 text-right text-text-secondary">
                              {t.traceId.slice(0, 12)}...
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <button
                                onClick={() => {
                                  setSelectedTrace(t);
                                  setActiveTab('traces');
                                }}
                                className="text-[11px] text-accent hover:underline"
                              >
                                View Trace →
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================== TAB 4: TRACES ===================== */}
        {activeTab === 'traces' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Traces List */}
            <div className="lg:col-span-5 rounded border border-border bg-surface flex flex-col h-[640px]">
              <div className="p-3 border-b border-border space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-primary">
                    Trace Waterfall Explorer
                  </h3>
                  <span className="text-[11px] font-mono text-text-secondary">
                    {filteredTraces.length} / {traces.length}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-text-secondary absolute left-2.5 top-2" />
                    <input
                      type="text"
                      placeholder="Search operation, service, ID..."
                      value={traceSearch}
                      onChange={(e) => setTraceSearch(e.target.value)}
                      className="w-full bg-bg border border-border rounded pl-8 pr-2.5 py-1 text-xs text-text-primary focus:outline-none focus:border-accent"
                    />
                  </div>
                  <select
                    value={traceStatusFilter}
                    onChange={(e: any) => setTraceStatusFilter(e.target.value)}
                    className="bg-bg border border-border rounded px-2 py-1 text-xs text-text-secondary focus:outline-none"
                  >
                    <option value="all">All</option>
                    <option value="error">Errors</option>
                    <option value="ok">OK</option>
                  </select>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-border/50">
                {filteredTraces.length === 0 ? (
                  <div className="p-8 text-center text-xs text-text-secondary">
                    No traces match the search filters.
                  </div>
                ) : (
                  filteredTraces.map((t: any) => (
                    <button
                      key={t.traceId}
                      onClick={() => setSelectedTrace(t)}
                      className={`w-full text-left p-3 text-xs transition-colors block ${
                        selectedTrace?.traceId === t.traceId
                          ? 'bg-surface-active border-l-2 border-accent'
                          : 'hover:bg-surface-hover'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-text-primary truncate max-w-[200px]">
                          {t.rootOperation}
                        </span>
                        <span
                          className={`font-mono font-semibold ${
                            t.hasError ? 'text-status-error' : 'text-status-success'
                          }`}
                        >
                          {t.durationMs}ms
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-text-secondary font-mono">
                        <span>{t.rootService}</span>
                        <span>{t.spanCount} spans · {new Date(t.startTime).toLocaleTimeString()}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Right Trace Timeline Inspector */}
            <div className="lg:col-span-7 rounded border border-border bg-surface flex flex-col h-[640px]">
              {selectedTrace ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-border flex items-center justify-between bg-bg">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            selectedTrace.hasError ? 'bg-status-error' : 'bg-status-success'
                          }`}
                        />
                        <h3 className="text-sm font-semibold text-text-primary">
                          {selectedTrace.rootOperation}
                        </h3>
                      </div>
                      <p className="text-[11px] font-mono text-text-secondary mt-0.5">
                        traceId: {selectedTrace.traceId}
                      </p>
                    </div>

                    <div className="text-right font-mono text-xs">
                      <div className="text-text-secondary">Total Execution</div>
                      <div className="text-sm font-semibold text-text-primary">
                        {selectedTrace.durationMs} ms
                      </div>
                    </div>
                  </div>

                  {/* Waterfall Spans Table / Bars */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {(selectedTrace.spans || []).map((sp: any) => {
                      const totalMs = Math.max(1, selectedTrace.durationMs);
                      const widthPct = Math.min(100, Math.max(4, (sp.durationMs / totalMs) * 100));

                      return (
                        <div
                          key={sp.id || sp.spanId}
                          className="p-2.5 rounded border border-border bg-bg space-y-1.5 text-xs font-mono"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 truncate">
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${
                                  sp.statusCode === 2
                                    ? 'bg-status-error/15 text-status-error border border-status-error/30'
                                    : 'bg-surface text-text-secondary border border-border'
                                }`}
                              >
                                {sp.serviceName}
                              </span>
                              <span className="text-text-primary font-semibold truncate">
                                {sp.operationName}
                              </span>
                            </div>
                            <span
                              className={`font-semibold ${
                                sp.statusCode === 2 ? 'text-status-error' : 'text-text-primary'
                              }`}
                            >
                              {Math.round(sp.durationMs * 10) / 10} ms
                            </span>
                          </div>

                          <div className="w-full h-1.5 bg-surface rounded overflow-hidden">
                            <div
                              style={{ width: `${widthPct}%` }}
                              className={`h-full rounded ${
                                sp.statusCode === 2 ? 'bg-status-error' : 'bg-accent'
                              }`}
                            />
                          </div>

                          {sp.attributes && Object.keys(sp.attributes).length > 0 && (
                            <div className="pt-1 text-[10px] text-text-secondary truncate">
                              {JSON.stringify(sp.attributes)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-text-secondary">
                  <Layers className="w-8 h-8 text-border mb-2" />
                  Select a trace from the left panel to inspect span breakdown.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================== TAB 5: LOGS ===================== */}
        {activeTab === 'logs' && (
          <div className="rounded border border-border bg-surface overflow-hidden space-y-0">
            {/* Log Control Header */}
            <div className="p-3 border-b border-border flex flex-wrap items-center justify-between gap-3 bg-bg">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative w-full">
                  <Search className="w-3.5 h-3.5 text-text-secondary absolute left-2.5 top-2" />
                  <input
                    type="text"
                    placeholder="Search logs by message, service, or trace ID..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="w-full bg-surface border border-border rounded pl-8 pr-2.5 py-1 text-xs text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              {/* Log Severity & Category Filters */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                {[
                  { id: 'ALL', label: `All (${rawLogs.length})` },
                  { id: 'ERROR', label: 'Errors' },
                  { id: 'INCIDENTS', label: 'Incidents' },
                  { id: 'SUGGESTIONS', label: 'Suggestions' },
                  { id: 'RESOLVED', label: 'Resolved' },
                  { id: 'WARN', label: 'Warnings' },
                  { id: 'INFO', label: 'Info' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setLogLevelFilter(tab.id)}
                    className={`px-2.5 py-1 rounded border text-[11px] transition-colors font-mono ${
                      logLevelFilter === tab.id
                        ? 'bg-accent/15 text-accent border-accent font-semibold ring-1 ring-accent/30'
                        : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:border-border-strong'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Log Stream Status Bar */}
            <div className="px-4 py-1.5 bg-surface-hover/50 border-b border-border/50 flex items-center justify-between text-[11px] font-mono text-text-secondary">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-status-success animate-ping" />
                <span>Live Event Stream</span>
                <span>·</span>
                <span>Showing {filteredLogs.length} matching entries</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const text = filteredLogs.map((l: any) => `[${new Date(l.timestamp).toISOString()}] [${l.severity}] [${l.serviceName}] ${l.body}`).join('\n');
                    navigator.clipboard.writeText(text);
                  }}
                  className="hover:text-text-primary underline flex items-center gap-1 text-[10px]"
                >
                  <Copy className="w-3 h-3" /> Copy Filtered Logs
                </button>
              </div>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="p-12 text-center text-xs text-text-secondary space-y-2">
                <FileText className="w-6 h-6 mx-auto text-text-secondary/50" />
                <div className="font-semibold text-text-primary">No Log Entries Found</div>
                <p className="max-w-md mx-auto">
                  {logSearch || logLevelFilter !== 'ALL'
                    ? 'No log entries match the current filter criteria. Try resetting filters.'
                    : 'System logs will automatically populate when incoming OTLP logs, span failures, incident detections, or resolution events occur.'}
                </p>
                {(logSearch || logLevelFilter !== 'ALL') && (
                  <button
                    onClick={() => {
                      setLogSearch('');
                      setLogLevelFilter('ALL');
                    }}
                    className="mt-2 px-3 py-1 text-xs rounded bg-surface border border-border hover:bg-surface-hover text-text-primary"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border bg-bg text-text-secondary text-[11px] uppercase tracking-wider">
                      <th className="py-2.5 px-4 font-medium w-28">Timestamp</th>
                      <th className="py-2.5 px-4 font-medium w-24">Level</th>
                      <th className="py-2.5 px-4 font-medium w-36">Service</th>
                      <th className="py-2.5 px-4 font-medium">Message & Event Details</th>
                      <th className="py-2.5 px-4 font-medium text-right w-36">Trace Correlation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {filteredLogs.map((l: any, idx: number) => {
                      const isErr = (l.severity || '').toUpperCase() === 'ERROR';
                      const isWarn = (l.severity || '').toUpperCase() === 'WARN';

                      const renderLogContent = (msg: string) => {
                        if (msg.startsWith('[INCIDENT]')) {
                          return (
                            <div className="flex items-start gap-1.5 flex-wrap">
                              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-status-error/20 text-status-error border border-status-error/30 font-bold uppercase font-mono">
                                INCIDENT
                              </span>
                              <span className="text-status-error font-medium">{msg.replace('[INCIDENT]', '').trim()}</span>
                            </div>
                          );
                        }
                        if (msg.startsWith('[REGRESSION DETECTED]') || msg.startsWith('[REGRESSION RCA]')) {
                          return (
                            <div className="flex items-start gap-1.5 flex-wrap">
                              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-status-warning/20 text-status-warning border border-status-warning/30 font-bold uppercase font-mono animate-pulse">
                                REGRESSION
                              </span>
                              <span className="text-status-warning font-medium">{msg.replace(/\[REGRESSION (DETECTED|RCA)\]/, '').trim()}</span>
                            </div>
                          );
                        }
                        if (msg.startsWith('[RESOLVED]')) {
                          return (
                            <div className="flex items-start gap-1.5 flex-wrap">
                              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-status-success/20 text-status-success border border-status-success/30 font-bold uppercase font-mono">
                                RESOLVED
                              </span>
                              <span className="text-status-success font-medium">{msg.replace('[RESOLVED]', '').trim()}</span>
                            </div>
                          );
                        }
                        if (msg.startsWith('[AI HYPOTHESIS]')) {
                          return (
                            <div className="flex items-start gap-1.5 flex-wrap">
                              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-accent/20 text-accent border border-accent/30 font-bold uppercase font-mono">
                                AI RCA
                              </span>
                              <span className="text-text-primary leading-relaxed">{msg.replace('[AI HYPOTHESIS]', '').trim()}</span>
                            </div>
                          );
                        }
                        const sugMatch = msg.match(/^\[(SUGGESTION|ACTION SUGGESTION)\s*#?\d*\]/);
                        if (sugMatch) {
                          return (
                            <div className="flex items-start gap-1.5 flex-wrap">
                              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-bold uppercase font-mono">
                                {sugMatch[0].replace(/\[|\]/g, '')}
                              </span>
                              <span className="text-text-primary">{msg.replace(sugMatch[0], '').trim()}</span>
                            </div>
                          );
                        }
                        return <span>{msg}</span>;
                      };

                      return (
                        <tr key={idx} className="hover:bg-surface-hover transition-colors group">
                          <td className="py-2.5 px-4 text-text-secondary text-[11px] whitespace-nowrap">
                            {new Date(l.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded font-mono ${
                                isErr
                                  ? 'bg-status-error/15 text-status-error border border-status-error/30'
                                  : isWarn
                                  ? 'bg-status-warning/15 text-status-warning border border-status-warning/30'
                                  : 'bg-border text-text-secondary'
                              }`}
                            >
                              {l.severity || 'INFO'}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-text-primary font-semibold truncate max-w-[150px]">
                            {l.serviceName}
                          </td>
                          <td className="py-2.5 px-4 leading-relaxed font-sans text-xs">
                            {renderLogContent(l.body)}
                          </td>
                          <td className="py-2.5 px-4 text-right text-[11px] text-text-secondary whitespace-nowrap">
                            {l.traceId ? (
                              <button
                                onClick={() => {
                                  const match = traces.find((t: any) => t.traceId === l.traceId);
                                  if (match) setSelectedTrace(match);
                                  setActiveTab('traces');
                                }}
                                className="text-accent hover:underline font-mono"
                                title={`Inspect trace ${l.traceId}`}
                              >
                                {l.traceId.slice(0, 10)}... →
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB 6: TOPOLOGY ===================== */}
        {activeTab === 'topology' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-primary flex items-center gap-1.5">
                  <Network className="w-3.5 h-3.5 text-accent" /> Microservices Call-Graph Topology
                </h3>
                <p className="text-[11px] text-text-secondary mt-0.5">
                  Auto-mapped from OpenTelemetry distributed trace parentSpanId call edges.
                </p>
              </div>
            </div>
            <ServiceMap
              traces={dashboard?.traces || []}
              serviceMetrics={serviceMetrics}
              isDark={isDark}
              onSelectService={(svc) => {
                setTraceSearch(svc);
              }}
            />
          </div>
        )}

        {/* ===================== TAB 7: CONNECT SDK ===================== */}
        {activeTab === 'connect' && (
          currentProject ? (
            <div className="space-y-4">
              {/* API Key Header */}
              <div className="rounded border border-border bg-surface p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">
                      Project Ingestion Credentials: &ldquo;{currentProject.name}&rdquo;
                    </h3>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Send OTLP HTTP spans and logs directly to this TraceOps project instance.
                    </p>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded border border-border text-text-secondary bg-bg">
                    ID: {currentProject.id}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-xs">
                  <div className="bg-bg border border-border rounded px-3 py-1.5 text-status-success flex items-center gap-2">
                    <Key className="w-3.5 h-3.5 text-text-secondary" />
                    <span>
                      {showRawKey && projectCredentials?.apiKey
                        ? projectCredentials.apiKey
                        : currentProject.apiKey}
                    </span>
                  </div>

                  {projectCredentials?.apiKey && (
                    <button
                      onClick={() => setShowRawKey(!showRawKey)}
                      className="flex items-center gap-1 bg-border hover:bg-border-strong text-text-primary px-2.5 py-1.5 rounded transition"
                      title={showRawKey ? 'Hide key' : 'Reveal unmasked key'}
                    >
                      {showRawKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {showRawKey ? 'Hide' : 'Reveal'}
                    </button>
                  )}

                  <button
                    onClick={() => copyText(activeApiKey || currentProject.apiKey)}
                    className="flex items-center gap-1 bg-border hover:bg-border-strong text-text-primary px-3 py-1.5 rounded transition"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedKey ? 'Copied' : 'Copy Key'}
                  </button>

                  <button
                    onClick={testIngestionPing}
                    disabled={testingConnection}
                    className="flex items-center gap-1 bg-bg hover:bg-surface-hover text-text-primary border border-border px-3 py-1.5 rounded transition disabled:opacity-50"
                  >
                    <Zap className="w-3.5 h-3.5 text-accent" />
                    {testingConnection ? 'Pinging...' : 'Send Test Ping'}
                  </button>

                  {credentialError && (
                    <span className="text-[11px] font-sans text-status-warning bg-status-warning/10 border border-status-warning/30 px-2 py-1 rounded">
                      {credentialError}
                    </span>
                  )}

                  {connectionTestResult && (
                    <span
                      className={`px-2 py-1 rounded text-[11px] font-sans ${
                        connectionTestResult === 'success'
                          ? 'bg-status-success/15 text-status-success border border-status-success/30'
                          : 'bg-status-error/15 text-status-error border border-status-error/30'
                      }`}
                    >
                      {connectionTestResult === 'success'
                        ? '✓ Verified! Trace accepted.'
                        : `✗ ${connectionTestResult}`}
                    </span>
                  )}
                </div>
              </div>

              {/* Cloud vs Localhost Notice */}
              <div className="rounded border border-status-warning/40 bg-surface p-3 text-xs space-y-1">
                <div className="flex items-center gap-1.5 text-status-warning font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" /> Connecting a Cloud-Deployed App (Vercel / AWS / Render)?
                </div>
                <p className="text-text-secondary leading-relaxed">
                  Cloud apps cannot reach <code className="text-text-primary">localhost:4000</code>. To route telemetry from your deployed website to your local TraceOps instance, expose it with a public tunnel:
                  <code className="ml-1 text-accent font-mono bg-bg px-1.5 py-0.5 rounded border border-border">
                    npx ngrok http 4000
                  </code>{' '}
                  and set the endpoint to your generated ngrok URL. See the full step-by-step guide in <code className="text-text-primary font-mono">CONNECT_GUIDE.md</code>.
                </p>
              </div>

              {/* Integration Snippets */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Method 1: Drop-In Frontend Snippet */}
                <div className="rounded border border-border bg-surface p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-primary flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-accent" /> 1. Drop-In Frontend Snippet
                    </h4>
                    <span className="text-[10px] font-mono text-text-secondary">React / Next.js / HTML</span>
                  </div>
                  <p className="text-xs text-text-secondary">
                    No packages required. Captures pageviews and unhandled client errors:
                  </p>
                  <pre className="p-3 rounded bg-bg border border-border text-[11px] font-mono text-text-primary overflow-x-auto">
{`const TRACEOPS_URL = 'http://localhost:4000'; // Or your deployed URL

function reportTrace(op, durationMs = 50, isError = false) {
  fetch(\`\${TRACEOPS_URL}/v1/traces\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-traceops-key': '${currentProject.apiKey}',
    },
    body: JSON.stringify({
      serviceName: '${currentProject.name}',
      operationName: op,
      durationMs,
      statusCode: isError ? 2 : 1,
    }),
  }).catch(() => {});
}

// Auto-track on client
if (typeof window !== 'undefined') {
  reportTrace('pageview: ' + window.location.pathname);
  window.addEventListener('error', (e) => reportTrace('error: ' + e.message, 100, true));
}`}
                  </pre>
                </div>

                {/* Method 2: Next.js instrumentation.ts */}
                <div className="rounded border border-border bg-surface p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-primary flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5 text-accent" /> 2. Next.js (`instrumentation.ts`)
                    </h4>
                    <span className="text-[10px] font-mono text-text-secondary">Next.js 13/14/15</span>
                  </div>
                  <p className="text-xs text-text-secondary">
                    Install <code className="text-accent">npm i @vercel/otel</code> and create <code className="text-accent">instrumentation.ts</code>:
                  </p>
                  <pre className="p-3 rounded bg-bg border border-border text-[11px] font-mono text-text-primary overflow-x-auto">
{`// instrumentation.ts
import { registerOTel } from '@vercel/otel';

export function register() {
  registerOTel({ serviceName: '${currentProject.name}' });
}

// Deployment Environment Variables:
OTEL_EXPORTER_OTLP_PROTOCOL="http/json"
OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4000"
OTEL_EXPORTER_OTLP_HEADERS="x-traceops-key=${currentProject.apiKey}"`}
                  </pre>
                </div>

                {/* Method 3: Standard OTEL Backend */}
                <div className="rounded border border-border bg-surface p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-primary flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-accent" /> 3. Backend OpenTelemetry SDK
                    </h4>
                    <span className="text-[10px] font-mono text-text-secondary">Node / Python / Go</span>
                  </div>
                  <p className="text-xs text-text-secondary">
                    Standard OpenTelemetry environment variables:
                  </p>
                  <pre className="p-3 rounded bg-bg border border-border text-[11px] font-mono text-text-primary overflow-x-auto">
{`OTEL_SERVICE_NAME="${currentProject.name}"
OTEL_EXPORTER_OTLP_PROTOCOL="http/json"
OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4000"
OTEL_EXPORTER_OTLP_HEADERS="x-traceops-key=${currentProject.apiKey}"`}
                  </pre>
                </div>

                {/* Method 4: CLI Simulator */}
                <div className="rounded border border-border bg-surface p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-primary flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-accent" /> 4. Terminal Simulator CLI
                    </h4>
                    <span className="text-[10px] font-mono text-text-secondary">Included script</span>
                  </div>
                  <p className="text-xs text-text-secondary">
                    Test external connection from terminal:
                  </p>
                  <pre className="p-3 rounded bg-bg border border-border text-[11px] font-mono text-text-primary overflow-x-auto">
{`# Send normal multi-service traffic:
node simulator/simulate.js ${currentProject.apiKey} normal`}
                  </pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded border border-border bg-surface p-8 text-center text-xs text-text-secondary">
              Select or create an application to view SDK setup instructions.
            </div>
          )
        )}
          </>
        )}
      </main>

      {/* New Project Modal */}
      {newProjectModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreateProject}
            className="bg-surface border border-border rounded p-5 max-w-sm w-full space-y-4 shadow-xl"
          >
            <h3 className="text-sm font-semibold text-text-primary">New Project</h3>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-text-secondary mb-1">
                Application Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. billing-service"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="w-full bg-bg border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-text-secondary mb-1">
                Stack / Runtime
              </label>
              <input
                type="text"
                value={newProjectStack}
                onChange={(e) => setNewProjectStack(e.target.value)}
                className="w-full bg-bg border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewProjectModal(false)}
                className="text-xs px-3 py-1.5 rounded border border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="text-xs px-3 py-1.5 rounded bg-accent hover:bg-accent-muted text-white font-medium"
              >
                Create Project
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
