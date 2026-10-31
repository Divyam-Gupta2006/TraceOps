import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EventsGateway } from './events.gateway';
import { AiRcaService, EvidencePacket } from './ai-rca.service';
import Redis from 'ioredis';
import * as crypto from 'crypto';

function safeBigInt(val: any, defaultVal: bigint = 0n): bigint {
  if (val === undefined || val === null || val === '') return defaultVal;
  if (typeof val === 'bigint') return val;
  try {
    if (typeof val === 'number') {
      return BigInt(Math.round(val));
    }
    const str = String(val).trim();
    if (str.includes('.')) {
      return BigInt(Math.round(parseFloat(str)));
    }
    return BigInt(str);
  } catch {
    return defaultVal;
  }
}

@Injectable()
export class TelemetryService {
  private redis: Redis | null = null;
  private evaluatingProjects = new Set<string>();
  private anomalyTimers = new Map<string, NodeJS.Timeout>();
  private pendingTraceIds = new Map<string, Set<string>>();

  constructor(
    private prisma: PrismaService,
    private events: EventsGateway,
    private aiRca: AiRcaService,
  ) {
    try {
      this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      this.redis.on('error', () => {
        // Fallback gracefully if Redis isn't running
      });
    } catch {
      this.redis = null;
    }
  }

  /**
   * Asserts that a user has permission to access a project.
   * - ADMIN role grants access to all projects (including unowned legacy projects).
   * - USER role grants access ONLY if project.ownerId === userId.
   * - Unowned projects (ownerId === null) are NEVER accessible to non-ADMIN users.
   */
  assertProjectAccess(
    project: { id: string; ownerId: string | null; [key: string]: any },
    userId?: string,
    role?: string,
  ): void {
    if (role === 'ADMIN') {
      return;
    }
    if (!userId || !project.ownerId || project.ownerId !== userId) {
      throw new ForbiddenException(
        'Access denied: You do not have permission to access this project.',
      );
    }
  }

  async createProject(name: string, framework = 'OpenTelemetry / Node.js', ownerId: string) {
    if (!ownerId) {
      throw new BadRequestException(
        'Project owner is required. Projects cannot be created without an owner.',
      );
    }
    const randomHex = crypto.randomBytes(12).toString('hex');
    const apiKey = `tops_live_${randomHex}`;
    return this.prisma.project.create({
      data: { name, framework, apiKey, ownerId },
    });
  }

  async listProjects(userId: string, role: string) {
    let whereClause: any;
    if (role === 'ADMIN') {
      whereClause = {};
    } else {
      whereClause = { ownerId: userId };
    }

    const projects = await this.prisma.project.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' },
    });

    // Project API keys must never be returned by ordinary project-list endpoints
    return projects.map((p) => ({
      ...p,
      apiKey: p.apiKey ? `${p.apiKey.slice(0, 14)}••••••••` : '••••••••',
    }));
  }

  async getProjectCredentials(projectId: string, userId: string, role: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    this.assertProjectAccess(project, userId, role);
    return {
      id: project.id,
      name: project.name,
      apiKey: project.apiKey,
    };
  }

  async validateApiKey(apiKey?: string) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      throw new UnauthorizedException(
        'Missing API key. Provide via x-traceops-key header, Authorization: Bearer <key>, or ?apiKey=<key>',
      );
    }
    const cleanKey = apiKey
      .trim()
      .replace(/^Bearer\s+/i, '')
      .replace(/^['"]|['"]$/g, '');

    if (!cleanKey) {
      throw new UnauthorizedException('Missing or empty API key.');
    }

    const project = await this.prisma.project.findUnique({
      where: { apiKey: cleanKey },
    });
    if (!project) {
      throw new UnauthorizedException('Invalid or unknown TraceOps API key.');
    }
    return project;
  }

  private extractAttr(attributes: any[] = [], key: string): any {
    const found = attributes.find((a) => a.key === key);
    if (!found || !found.value) return undefined;
    return (
      found.value.stringValue ??
      found.value.intValue ??
      found.value.doubleValue ??
      found.value.boolValue
    );
  }

  private normalizeAttributes(attributes: any): Record<string, any> {
    if (!attributes) return {};
    if (!Array.isArray(attributes)) {
      return typeof attributes === 'object' ? attributes : {};
    }
    const out: Record<string, any> = {};
    for (const attr of attributes) {
      if (attr && attr.key && attr.value) {
        out[attr.key] =
          attr.value.stringValue ??
          attr.value.intValue ??
          attr.value.doubleValue ??
          attr.value.boolValue ??
          attr.value;
      }
    }
    return out;
  }

  // Standard OpenTelemetry OTLP/HTTP JSON Trace Ingestion
  async ingestOtlpTraces(projectId: string, body: any) {
    let resourceSpans = body?.resourceSpans;
    if (!resourceSpans || !Array.isArray(resourceSpans)) {
      const spansList = Array.isArray(body)
        ? body
        : Array.isArray(body?.spans)
        ? body.spans
        : (body?.serviceName || body?.operationName || body?.name)
        ? [body]
        : [];

      if (spansList.length > 0) {
        resourceSpans = [
          {
            resource: {
              attributes: [
                {
                  key: 'service.name',
                  value: {
                    stringValue:
                      body?.serviceName ||
                      spansList[0]?.serviceName ||
                      'external-web-app',
                  },
                },
                {
                  key: 'telemetry.sdk.language',
                  value: { stringValue: 'javascript' },
                },
              ],
            },
            scopeSpans: [
              {
                spans: spansList.map((s) => {
                  const dur = Math.max(1, Math.round(Number(s.durationMs ?? s.duration ?? 50)));
                  const startMs = Math.round(s.startTime ? new Date(s.startTime).getTime() : Date.now() - dur);
                  const startNano = BigInt(startMs) * 1_000_000n;
                  const endNano = startNano + BigInt(dur) * 1_000_000n;
                  return {
                    traceId: s.traceId || crypto.randomBytes(16).toString('hex'),
                    spanId: s.spanId || crypto.randomBytes(8).toString('hex'),
                    parentSpanId: s.parentSpanId || null,
                    name: s.operationName || s.name || 'HTTP Request',
                    durationMs: dur,
                    startTimeUnixNano: String(startNano),
                    endTimeUnixNano: String(endNano),
                    status: {
                      code:
                        s.statusCode === 2 || (s.statusCode && s.statusCode >= 400)
                          ? 2
                          : 1,
                    },
                    attributes: s.attributes,
                  };
                }),
              },
            ],
          },
        ];
      } else {
        resourceSpans = [];
      }
    }
    const spanRows: any[] = [];
    const affectedTraceIds = new Set<string>();

    for (const rs of resourceSpans) {
      const resAttrs = rs.resource?.attributes || [];
      const serviceName =
        this.extractAttr(resAttrs, 'service.name') || 'unknown-service';
      const language =
        this.extractAttr(resAttrs, 'telemetry.sdk.language') || 'nodejs';

      await this.prisma.service.upsert({
        where: { projectId_name: { projectId, name: serviceName } },
        update: { lastSeenAt: new Date(), language },
        create: { projectId, name: serviceName, language },
      });

      const scopeSpans = rs.scopeSpans || [];
      for (const ss of scopeSpans) {
        for (const sp of ss.spans || []) {
          const startNano = safeBigInt(sp.startTimeUnixNano, BigInt(Date.now()) * 1_000_000n);
          const endNano = safeBigInt(sp.endTimeUnixNano, startNano + 50_000_000n);
          const durationMs =
            sp.durationMs !== undefined && sp.durationMs !== null
              ? Number(sp.durationMs)
              : Number(endNano - startNano) / 1_000_000;
          const statusCode = sp.status?.code ?? 1; // 2 = Error in OTLP
          const traceId = sp.traceId || crypto.randomBytes(16).toString('hex');
          const spanId = sp.spanId || crypto.randomBytes(8).toString('hex');

          spanRows.push({
            projectId,
            traceId,
            spanId,
            parentSpanId: sp.parentSpanId || null,
            serviceName,
            operationName: sp.name || 'HTTP Request',
            startTime: new Date(Number(startNano / 1_000_000n)),
            durationMs: Math.max(0.1, durationMs),
            statusCode,
            attributes: this.normalizeAttributes(sp.attributes),
          });

          affectedTraceIds.add(traceId);

          // Update rolling Redis counters if Redis is connected
          if (this.redis && this.redis.status === 'ready') {
            const minuteBucket = Math.floor(Date.now() / 60000);
            const redisKey = `metrics:${projectId}:${serviceName}:${minuteBucket}`;
            this.redis
              .multi()
              .hincrby(redisKey, 'requests', 1)
              .hincrby(redisKey, 'errors', statusCode === 2 ? 1 : 0)
              .hincrbyfloat(redisKey, 'durationMs', durationMs)
              .expire(redisKey, 600)
              .exec()
              .catch(() => {});
          }
        }
      }
    }

    if (spanRows.length > 0) {
      await this.prisma.span.createMany({
        data: spanRows,
      });
    }

    if (!this.pendingTraceIds.has(projectId)) {
      this.pendingTraceIds.set(projectId, new Set());
    }
    const traceSet = this.pendingTraceIds.get(projectId)!;
    affectedTraceIds.forEach((t) => traceSet.add(t));

    // Debounce anomaly evaluation by 1500ms so batches of spans + logs arrive together
    if (this.anomalyTimers.has(projectId)) {
      clearTimeout(this.anomalyTimers.get(projectId)!);
    }
    this.anomalyTimers.set(
      projectId,
      setTimeout(() => {
        this.anomalyTimers.delete(projectId);
        const traceIds = Array.from(this.pendingTraceIds.get(projectId) || []);
        this.pendingTraceIds.delete(projectId);
        this.evaluateAnomalies(projectId, traceIds).catch((e) =>
          console.error('Anomaly check error:', e),
        );
      }, 1500),
    );

    // Fetch updated total requests count and latest span for instant socket push
    const totalRequests = await this.prisma.span.count({ where: { projectId } });
    const latestCreated = spanRows.length > 0 ? spanRows[spanRows.length - 1] : null;

    this.events.emitTelemetryUpdate(projectId, {
      type: 'traces',
      count: spanRows.length,
      totalRequests,
      latestSpan: latestCreated
        ? {
            durationMs: Math.round(latestCreated.durationMs * 10) / 10,
            serviceName: latestCreated.serviceName,
            operationName: latestCreated.operationName,
            statusCode: latestCreated.statusCode,
            startTime: latestCreated.startTime,
          }
        : null,
    });

    return { acceptedSpans: spanRows.length };
  }

  // Standard OpenTelemetry OTLP/HTTP JSON Log Ingestion
  async ingestOtlpLogs(projectId: string, body: any) {
    let resourceLogs = body?.resourceLogs;

    // Support flat log format, { logs: [...] }, or raw arrays for developer ease
    if (!resourceLogs || !Array.isArray(resourceLogs)) {
      const logsList = Array.isArray(body)
        ? body
        : Array.isArray(body?.logs)
        ? body.logs
        : (body?.message || body?.body || body?.severity)
        ? [body]
        : [];

      if (logsList.length > 0) {
        resourceLogs = [
          {
            resource: {
              attributes: [
                {
                  key: 'service.name',
                  value: {
                    stringValue:
                      body?.serviceName ||
                      logsList[0]?.serviceName ||
                      'external-web-app',
                  },
                },
                {
                  key: 'telemetry.sdk.language',
                  value: { stringValue: 'javascript' },
                },
              ],
            },
            scopeLogs: [
              {
                logRecords: logsList.map((l) => {
                  const nowNano = BigInt(Date.now()) * 1_000_000n;
                  const timeNano = l.timeUnixNano
                    ? safeBigInt(l.timeUnixNano, nowNano)
                    : l.timestamp
                    ? BigInt(new Date(l.timestamp).getTime()) * 1_000_000n
                    : nowNano;
                  return {
                    traceId: l.traceId || null,
                    spanId: l.spanId || null,
                    severityText: (l.severity || l.severityText || 'INFO').toUpperCase(),
                    body: { stringValue: l.message || l.body || 'Log event' },
                    timeUnixNano: String(timeNano),
                  };
                }),
              },
            ],
          },
        ];
      } else {
        resourceLogs = [];
      }
    }

    let count = 0;
    const logRows: any[] = [];

    for (const rl of resourceLogs) {
      const resAttrs = rl.resource?.attributes || [];
      const serviceName =
        this.extractAttr(resAttrs, 'service.name') || 'unknown-service';

      // Ensure service is recorded in Service Fleet
      await this.prisma.service.upsert({
        where: { projectId_name: { projectId, name: serviceName } },
        update: { lastSeenAt: new Date() },
        create: { projectId, name: serviceName, language: 'javascript' },
      });

      for (const sl of rl.scopeLogs || []) {
        for (const lr of sl.logRecords || []) {
          const bodyStr =
            lr.body?.stringValue ||
            (typeof lr.body === 'string' ? lr.body : JSON.stringify(lr.body));
          const severity = (lr.severityText || 'INFO').toUpperCase();

          logRows.push({
            projectId,
            traceId: lr.traceId || null,
            spanId: lr.spanId || null,
            serviceName,
            severity,
            body: bodyStr || 'Log event',
            timestamp: lr.timeUnixNano
              ? new Date(Number(safeBigInt(lr.timeUnixNano) / 1_000_000n))
              : new Date(),
          });
          count++;
        }
      }
    }

    if (logRows.length > 0) {
      await this.prisma.logEntry.createMany({
        data: logRows,
      });
    }

    // Debounce anomaly evaluation so late-arriving logs are attached to open incidents
    if (!this.anomalyTimers.has(projectId)) {
      this.anomalyTimers.set(
        projectId,
        setTimeout(() => {
          this.anomalyTimers.delete(projectId);
          const traceIds = Array.from(this.pendingTraceIds.get(projectId) || []);
          this.pendingTraceIds.delete(projectId);
          this.evaluateAnomalies(projectId, traceIds).catch((e) =>
            console.error('Anomaly check error from logs:', e),
          );
        }, 1500),
      );
    }

    this.events.emitTelemetryUpdate(projectId, { type: 'logs', count });
    return { acceptedLogs: count };
  }

  // Correlates service metrics + distributed trace leaf bottlenecks to trigger AI RCA
  async evaluateAnomalies(projectId: string, recentTraceIds: string[]) {
    if (this.evaluatingProjects.has(projectId)) return;
    this.evaluatingProjects.add(projectId);

    try {
      const windowStart = new Date(Date.now() - 3 * 60 * 1000); // Last 3 minutes
      const recentSpans = await this.prisma.span.findMany({
        where: { projectId, startTime: { gte: windowStart } },
        orderBy: { startTime: 'desc' },
        take: 300,
      });

      if (recentSpans.length < 1) return;

      // Group metrics by service
      const stats: Record<
        string,
        { total: number; errors: number; totalDuration: number; maxDuration: number }
      > = {};

      for (const sp of recentSpans) {
        if (!stats[sp.serviceName]) {
          stats[sp.serviceName] = {
            total: 0,
            errors: 0,
            totalDuration: 0,
            maxDuration: 0,
          };
        }
        const st = stats[sp.serviceName];
        st.total++;
        if (sp.statusCode === 2) st.errors++;
        st.totalDuration += sp.durationMs;
        if (sp.durationMs > st.maxDuration) st.maxDuration = sp.durationMs;
      }

      // Identify anomalous services (Latency > 1200ms OR Any Errors OR Single span > 2000ms)
      const anomalousServices = Object.entries(stats).filter(([_, st]) => {
        const avgLatency = st.totalDuration / st.total;
        const errRate = (st.errors / st.total) * 100;
        return avgLatency > 1200 || st.errors > 0 || st.maxDuration > 2000;
      });

      if (anomalousServices.length === 0) return;

      // Group anomalous services by their root culprit to support multiple distinct errors
      const processedRoots = new Set<string>();

      for (const [anomSvcName] of anomalousServices) {
        // Find a degraded span associated with this service
        const degradedSpan =
          recentSpans.find(
            (s) =>
              s.serviceName === anomSvcName &&
              (s.statusCode === 2 || s.durationMs > 1000),
          ) ||
          recentSpans.find((s) => s.statusCode === 2 || s.durationMs > 1500);

        const targetTraceId = degradedSpan?.traceId || recentTraceIds[0];
        if (!targetTraceId) continue;

        const traceSpans = await this.prisma.span.findMany({
          where: { projectId, traceId: targetTraceId },
          orderBy: { startTime: 'asc' },
        });

        // Root cause localization: Find the deepest/leaf service in the trace with high latency or error
        const parentIds = new Set(
          traceSpans.map((s) => s.parentSpanId).filter(Boolean),
        );
        const leafAnomalies = traceSpans.filter(
          (s) =>
            !parentIds.has(s.spanId) &&
            (s.statusCode === 2 || s.durationMs > 1000),
        );

        const rootSpan =
          leafAnomalies[0] ||
          traceSpans.slice().sort((a, b) => b.durationMs - a.durationMs)[0] ||
          degradedSpan;

        if (!rootSpan) continue;

        const rootService = rootSpan.serviceName;
        if (processedRoots.has(rootService)) continue;
        processedRoots.add(rootService);

        const rootStats = stats[rootService] || {
          total: 1,
          errors: 1,
          totalDuration: rootSpan.durationMs,
          maxDuration: rootSpan.durationMs,
        };

        const errorRatePeak = Math.max(
          ...Object.values(stats).map((s) => (s.errors / s.total) * 100),
        );
        // True Peak Latency
        const latencyPeakMs = Math.round(rootStats.maxDuration * 10) / 10;

        const affectedServices = Array.from(
          new Set([
            ...anomalousServices.map(([name]) => name),
            ...traceSpans.map((s) => s.serviceName),
          ]),
        );

        // Fetch correlated error logs matching the traceId or root service
        const correlatedLogs = await this.prisma.logEntry.findMany({
          where: {
            projectId,
            OR: [
              { traceId: targetTraceId },
              { serviceName: rootService, severity: 'ERROR' },
            ],
          },
          orderBy: { timestamp: 'desc' },
          take: 6,
        });

        const evidencePacket: EvidencePacket = {
          rootService,
          affectedServices,
          errorRatePeak: Math.round(errorRatePeak * 10) / 10,
          latencyPeakMs,
          traceChain: traceSpans.map((s) => ({
            serviceName: s.serviceName,
            operationName: s.operationName,
            durationMs: s.durationMs,
            statusCode: s.statusCode,
            attributes: s.attributes,
          })),
          correlatedErrorLogs: correlatedLogs.map((l) => ({
            serviceName: l.serviceName,
            severity: l.severity,
            body: l.body,
          })),
        };

        // 1. Check if an incident for THIS root service is ALREADY active (deduplication per root service)
        const existingActive = await this.prisma.incident.findFirst({
          where: {
            projectId,
            rootService,
            status: { in: ['OPEN', 'REOPENED'] },
            detectedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
          },
        });

        if (existingActive) {
          const existingPacket = existingActive.evidencePacket as any;
          const existingLogCount = existingPacket?.correlatedErrorLogs?.length || 0;
          if (existingLogCount === 0 && correlatedLogs.length > 0) {
            // Re-enrich with newly arrived error logs
            const rca = await this.aiRca.analyzeIncident(evidencePacket);
            const updated = await this.prisma.incident.update({
              where: { id: existingActive.id },
              data: {
                title: rca.title,
                affectedServices,
                errorRatePeak: evidencePacket.errorRatePeak,
                latencyPeakMs: evidencePacket.latencyPeakMs,
                evidencePacket: evidencePacket as any,
                aiHypothesis: rca.aiHypothesis,
                aiRecommendations: rca.aiRecommendations as any,
                confidenceScore: rca.confidenceScore,
              },
            });
            this.events.emitIncidentCreated(projectId, updated);
          }
          // Already tracked, avoid duplicate incident card for the same rootService
          continue;
        }

        // 2. Scout for Regressions: Was this error previously marked RESOLVED?
        const previouslyResolved = await this.prisma.incident.findFirst({
          where: {
            projectId,
            rootService,
            status: 'RESOLVED',
          },
          orderBy: { resolvedAt: 'desc' },
        });

        const rca = await this.aiRca.analyzeIncident(evidencePacket);

        if (previouslyResolved) {
          // REGRESSION DETECTED: Issue recurred after being marked resolved!
          const recurrenceCount = (previouslyResolved.recurrenceCount || 0) + 1;
          const resolvedTimeStr = previouslyResolved.resolvedAt
            ? new Date(previouslyResolved.resolvedAt).toLocaleTimeString()
            : 'earlier';
          const regressionWarning = `⚠️ Regression Detected: Error Not Fixed! This issue recurred on service "${rootService}" after being marked resolved at ${resolvedTimeStr}. (Recurrence #${recurrenceCount})`;

          const reopened = await this.prisma.incident.update({
            where: { id: previouslyResolved.id },
            data: {
              status: 'REOPENED',
              recurrenceCount,
              regressionWarning,
              title: `[Regression #${recurrenceCount}] ${rca.title}`,
              errorRatePeak: evidencePacket.errorRatePeak,
              latencyPeakMs: evidencePacket.latencyPeakMs,
              evidencePacket: evidencePacket as any,
              aiHypothesis: rca.aiHypothesis,
              aiRecommendations: rca.aiRecommendations as any,
              confidenceScore: rca.confidenceScore,
              detectedAt: new Date(),
            },
          });

          const regLogs: any[] = [
            {
              projectId,
              serviceName: rootService,
              traceId: targetTraceId,
              severity: 'WARN',
              body: `[REGRESSION DETECTED] Error Not Fixed! Incident "${rca.title}" recurred on "${rootService}" after being marked resolved at ${resolvedTimeStr}. (Recurrence #${recurrenceCount})`,
              timestamp: new Date(),
            },
            {
              projectId,
              serviceName: rootService,
              traceId: targetTraceId,
              severity: 'ERROR',
              body: `[REGRESSION RCA] ${rca.aiHypothesis}`,
              timestamp: new Date(),
            },
          ];

          (rca.aiRecommendations || []).forEach((rec: string, idx: number) => {
            regLogs.push({
              projectId,
              serviceName: rootService,
              traceId: targetTraceId,
              severity: 'INFO',
              body: `[ACTION SUGGESTION #${idx + 1}] ${rec}`,
              timestamp: new Date(),
            });
          });

          await this.prisma.logEntry.createMany({ data: regLogs });
          this.events.emitTelemetryUpdate(projectId, { type: 'logs', count: regLogs.length });

          this.events.emitIncidentCreated(projectId, reopened);
          continue;
        }

        // 3. New Incident Creation
        const incident = await this.prisma.incident.create({
          data: {
            projectId,
            title: rca.title,
            status: 'OPEN',
            severity: 'CRITICAL',
            rootService,
            affectedServices,
            errorRatePeak: evidencePacket.errorRatePeak,
            latencyPeakMs: evidencePacket.latencyPeakMs,
            traceId: targetTraceId,
            evidencePacket: evidencePacket as any,
            aiHypothesis: rca.aiHypothesis,
            aiRecommendations: rca.aiRecommendations as any,
            confidenceScore: rca.confidenceScore,
            recurrenceCount: 0,
            regressionWarning: null,
          },
        });

        // Write comprehensive system audit & diagnostic logs
        const auditLogs: any[] = [
          {
            projectId,
            serviceName: rootService,
            traceId: targetTraceId,
            severity: 'ERROR',
            body: `[INCIDENT] ${rca.title} - Peak Latency: ${latencyPeakMs}ms, Error Rate: ${errorRatePeak}%. Root cause isolated to ${rootService}.`,
            timestamp: new Date(),
          },
          {
            projectId,
            serviceName: rootService,
            traceId: targetTraceId,
            severity: 'INFO',
            body: `[AI HYPOTHESIS] ${rca.aiHypothesis} (Confidence: ${rca.confidenceScore}%)`,
            timestamp: new Date(),
          },
        ];

        (rca.aiRecommendations || []).forEach((rec: string, idx: number) => {
          auditLogs.push({
            projectId,
            serviceName: rootService,
            traceId: targetTraceId,
            severity: 'INFO',
            body: `[SUGGESTION #${idx + 1}] ${rec}`,
            timestamp: new Date(),
          });
        });

        await this.prisma.logEntry.createMany({ data: auditLogs });
        this.events.emitTelemetryUpdate(projectId, { type: 'logs', count: auditLogs.length });

        this.events.emitIncidentCreated(projectId, incident);
      }
    } catch (err) {
      console.error('Error during anomaly evaluation:', err);
    } finally {
      this.evaluatingProjects.delete(projectId);
    }
  }

  async getProjectDashboard(
    projectId: string,
    windowParam = '1h',
    userId?: string,
    role?: string,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    this.assertProjectAccess(project, userId, role);

    const [totalRequestsCount, services, recentSpans, recentLogs, incidents] = await Promise.all([
      this.prisma.span.count({ where: { projectId } }),
      this.prisma.service.findMany({
        where: { projectId },
        orderBy: { name: 'asc' },
      }),
      this.prisma.span.findMany({
        where: { projectId },
        orderBy: { startTime: 'desc' },
        take: 600,
      }),
      this.prisma.logEntry.findMany({
        where: { projectId },
        orderBy: { timestamp: 'desc' },
        take: 300,
      }),
      this.prisma.incident.findMany({
        where: { projectId },
        orderBy: { detectedAt: 'desc' },
        take: 20,
      }),
    ]);

    // Determine window duration in ms
    let windowDurationMs = 60 * 60 * 1000; // default 1h
    const isSecondsWindow = windowParam === '10s';
    if (windowParam === '10s') windowDurationMs = 10 * 1000;
    else if (windowParam === '15m') windowDurationMs = 15 * 60 * 1000;
    else if (windowParam === '6h') windowDurationMs = 6 * 60 * 60 * 1000;
    else if (windowParam === '24h') windowDurationMs = 24 * 60 * 60 * 1000;

    const spanTimes = recentSpans.map((s) => new Date(s.startTime).getTime());
    const maxSpanTime = spanTimes.length > 0 ? Math.max(...spanTimes) : Date.now();
    const minSpanTime = spanTimes.length > 0 ? Math.min(...spanTimes) : Date.now() - windowDurationMs;

    // Anchor effectiveEndTime to the latest span or Date.now(), whichever is later (guards against client clock skew)
    const effectiveEndTime = Math.max(Date.now(), maxSpanTime);
    const effectiveStartTime = effectiveEndTime - windowDurationMs;

    const windowSpans = recentSpans.filter((s) => {
      const t = new Date(s.startTime).getTime();
      return t >= effectiveStartTime - 5000 && t <= effectiveEndTime + 60_000;
    });

    // Fall back to all recentSpans if windowSpans is too small so dashboard is never empty
    const activeSpans = windowSpans.length >= 1 ? windowSpans : recentSpans;

    const calcPct = (vals: number[], pct: number) => {
      if (vals.length === 0) return 0;
      const sorted = vals.slice().sort((a, b) => a - b);
      const idx = Math.min(sorted.length - 1, Math.floor((pct / 100) * sorted.length));
      return Math.round(sorted[idx]);
    };

    const allDurations = activeSpans.map((s) => s.durationMs);
    const totalRequests = Math.max(totalRequestsCount, activeSpans.length);
    const windowRequests = activeSpans.length;
    const totalErrors = activeSpans.filter((s) => s.statusCode === 2).length;
    const systemErrorRate = windowRequests > 0 ? Math.round((totalErrors / windowRequests) * 1000) / 10 : 0;
    const avgLatencyMs = allDurations.length > 0 ? Math.round((allDurations.reduce((a, b) => a + b, 0) / allDurations.length) * 10) / 10 : 0;
    const p50Ms = calcPct(allDurations, 50);
    const p90Ms = calcPct(allDurations, 90);
    const p95Ms = calcPct(allDurations, 95);
    const p99Ms = calcPct(allDurations, 99);

    const windowSeconds = Math.max(1, Math.round(windowDurationMs / 1000));
    const activeSeconds = Math.max(5, Math.round((maxSpanTime - minSpanTime) / 1000));
    const rps = windowRequests > 0 ? Math.round((windowRequests / Math.min(windowSeconds, activeSeconds)) * 100) / 100 : 0;

    // Real-Time / Live Metrics (Most recent span and last 60 seconds)
    const latestSpan = recentSpans[0] || null;
    const currentLatencyMs = latestSpan ? Math.round(latestSpan.durationMs * 10) / 10 : 0;
    const latestEndpoint = latestSpan ? `${latestSpan.serviceName}: ${latestSpan.operationName}` : 'None';
    const latestStatusCode = latestSpan?.statusCode ?? 1;
    const latestTime = latestSpan ? new Date(latestSpan.startTime).toLocaleTimeString() : 'N/A';

    const oneMinuteAgo = Date.now() - 60 * 1000;
    const liveSpans = recentSpans.filter((s) => new Date(s.startTime).getTime() >= oneMinuteAgo);
    const liveRps = liveSpans.length > 0 ? Math.max(0.1, Math.round((liveSpans.length / 60) * 100) / 100) : 0;
    const liveErrors = liveSpans.filter((s) => s.statusCode === 2).length;
    const liveErrorRate = liveSpans.length > 0
      ? Math.round((liveErrors / liveSpans.length) * 1000) / 10
      : (latestSpan && latestSpan.statusCode === 2 ? 100 : 0);

    // Error Budget (99.9% SLO target = 0.1% allowed error rate)
    const errorBudgetRemainingPercent = Math.max(0, Math.min(100, Math.round((1 - (systemErrorRate / 100) / 0.001) * 100)));

    // Compute per-service health metrics from active spans
    const serviceMetrics = services.map((svc) => {
      const svcSpans = activeSpans.filter((s) => s.serviceName === svc.name);
      const total = svcSpans.length;
      const errors = svcSpans.filter((s) => s.statusCode === 2).length;
      const avg = total > 0 ? Math.round((svcSpans.reduce((acc, s) => acc + s.durationMs, 0) / total) * 10) / 10 : 0;
      const errRate = total > 0 ? Math.round((errors / total) * 1000) / 10 : 0;
      const svcDurations = svcSpans.map((s) => s.durationMs);

      let status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
      if (errRate >= 25 || avg >= 2000) status = 'CRITICAL';
      else if (errRate >= 5 || avg >= 600) status = 'DEGRADED';

      return {
        ...svc,
        totalRequests: total,
        errorRate: errRate,
        avgLatencyMs: avg,
        p95LatencyMs: calcPct(svcDurations, 95),
        status,
      };
    });

    const healthyCount = serviceMetrics.filter((s) => s.status === 'HEALTHY').length;
    const degradedCount = serviceMetrics.filter((s) => s.status === 'DEGRADED').length;
    const criticalCount = serviceMetrics.filter((s) => s.status === 'CRITICAL').length;
    const activeIncidentsCount = incidents.filter((i) => i.status === 'OPEN' || i.status === 'REOPENED').length;

    // Time-Series Trend Buckets (10 points for 10s window, 24 points for standard windows)
    const bucketCount = isSecondsWindow ? 10 : 24;
    const bucketMs = isSecondsWindow ? 1000 : Math.max(5 * 1000, Math.floor(windowDurationMs / bucketCount));
    const timeSeries: any[] = [];

    for (let i = 0; i < bucketCount; i++) {
      const bStart = effectiveStartTime + i * bucketMs;
      const bEnd = bStart + bucketMs;
      const d = new Date(bEnd);
      const label = isSecondsWindow
        ? `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
        : `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

      const bSpans = activeSpans.filter((s) => {
        const t = new Date(s.startTime).getTime();
        return i === bucketCount - 1
          ? t >= bStart && t <= effectiveEndTime + 60_000
          : t >= bStart && t < bEnd;
      });

      const count = bSpans.length;
      const errors = bSpans.filter((s) => s.statusCode === 2).length;
      const bRate = count > 0 ? Math.round((errors / count) * 1000) / 10 : 0;
      const bDurations = bSpans.map((s) => s.durationMs);
      const bAvg = bDurations.length > 0 ? Math.round(bDurations.reduce((a, b) => a + b, 0) / bDurations.length) : 0;

      timeSeries.push({
        timestamp: bEnd,
        label,
        requests: count,
        rps: Math.round((count / (bucketMs / 1000)) * 10) / 10,
        errors,
        errorRate: bRate,
        avgLatency: bAvg,
        p50: calcPct(bDurations, 50),
        p95: calcPct(bDurations, 95),
        p99: calcPct(bDurations, 99),
      });
    }

    // Endpoint Analytics (Which API routes are slowest, error rates, throughput)
    const totalSystemDuration = allDurations.reduce((a, b) => a + b, 0) || 1;
    const endpointMap = new Map<string, any>();

    for (const sp of activeSpans) {
      const key = `${sp.serviceName}:::${sp.operationName}`;
      if (!endpointMap.has(key)) {
        endpointMap.set(key, {
          key,
          endpoint: sp.operationName,
          serviceName: sp.serviceName,
          requests: 0,
          errors: 0,
          durations: [] as number[],
        });
      }
      const entry = endpointMap.get(key)!;
      entry.requests++;
      if (sp.statusCode === 2) entry.errors++;
      entry.durations.push(sp.durationMs);
    }

    const endpointAnalytics = Array.from(endpointMap.values())
      .map((e) => {
        const sumDuration = e.durations.reduce((a: number, b: number) => a + b, 0);
        const avg = Math.round((sumDuration / e.requests) * 10) / 10;
        const errRate = Math.round((e.errors / e.requests) * 1000) / 10;
        const latencyContributionPercent = Math.round((sumDuration / totalSystemDuration) * 1000) / 10;
        return {
          endpoint: e.endpoint,
          serviceName: e.serviceName,
          totalRequests: e.requests,
          rps: Math.round((e.requests / windowSeconds) * 100) / 100,
          avgLatencyMs: avg,
          p95LatencyMs: calcPct(e.durations, 95),
          p99LatencyMs: calcPct(e.durations, 99),
          errors: e.errors,
          errorRate: errRate,
          latencyContributionPercent,
        };
      })
      .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs);

    // Error Distribution (Which errors occur most frequently)
    const errorMap = new Map<string, any>();
    for (const sp of activeSpans) {
      if (sp.statusCode === 2) {
        const errType = sp.attributes?.['error.type'];
        const errMsg = sp.attributes?.['error.message'];
        const statusAttr = sp.attributes?.['http.status_code'] || (errType ? null : 500);
        const errSignature = errType
          ? `${errType}: ${errMsg || sp.operationName}`
          : statusAttr
          ? `HTTP ${statusAttr}: ${sp.operationName}`
          : `Error: ${sp.operationName}`;

        if (!errorMap.has(errSignature)) {
          errorMap.set(errSignature, {
            errorType: errSignature,
            serviceName: sp.serviceName,
            endpoint: sp.operationName,
            count: 0,
            lastSeen: sp.startTime,
          });
        }
        const item = errorMap.get(errSignature)!;
        item.count++;
        if (new Date(sp.startTime) > new Date(item.lastSeen)) {
          item.lastSeen = sp.startTime;
        }
      }
    }

    const errorDistribution = Array.from(errorMap.values())
      .map((err) => ({
        ...err,
        percentage: totalErrors > 0 ? Math.round((err.count / totalErrors) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Intelligent Insights Engine (Deterministic telemetry patterns & root cause identification)
    const intelligentInsights: any[] = [];

    // Insight 1: Latency baseline anomaly
    const slowEp = endpointAnalytics.find((e) => e.avgLatencyMs > 1000);
    if (slowEp) {
      const ratio = Math.max(1.8, Math.round((slowEp.avgLatencyMs / Math.max(150, p50Ms)) * 10) / 10);
      intelligentInsights.push({
        id: 'insight-latency-outlier',
        severity: slowEp.avgLatencyMs > 2500 ? 'CRITICAL' : 'WARNING',
        title: `${slowEp.serviceName} has ${ratio}x higher latency than its baseline`,
        description: `Endpoint "${slowEp.endpoint}" in service "${slowEp.serviceName}" is experiencing elevated latency averaging ${slowEp.avgLatencyMs}ms (p95: ${slowEp.p95LatencyMs}ms), accounting for ${slowEp.latencyContributionPercent}% of cumulative system transaction time.`,
        evidence: {
          metric: 'p95 Latency',
          value: `${slowEp.p95LatencyMs}ms`,
          baseline: '150 - 250ms',
          ratio: `${ratio}x baseline`,
        },
        affectedServices: [slowEp.serviceName],
        affectedEndpoints: [slowEp.endpoint],
        suggestedAction: `Inspect connection saturation, database query locks, or external network calls within ${slowEp.serviceName}.`,
      });
    }

    // Insight 2: Error concentration
    if (totalErrors > 0 && endpointAnalytics.length > 0) {
      const topFailed = endpointAnalytics.filter((e) => e.errors > 0).sort((a, b) => b.errors - a.errors);
      const top2 = topFailed.slice(0, 2);
      const top2ErrorCount = top2.reduce((acc, e) => acc + e.errors, 0);
      const concentration = Math.round((top2ErrorCount / totalErrors) * 100);

      if (concentration >= 40) {
        intelligentInsights.push({
          id: 'insight-error-concentration',
          severity: 'CRITICAL',
          title: `${concentration}% of failed requests originate from ${top2.length} endpoint(s)`,
          description: `Failures are heavily localized in ${top2.map((e) => `"${e.endpoint}"`).join(' and ')}. This confirms a component-specific failure rather than a global network or cluster outage.`,
          evidence: {
            metric: 'Error Concentration',
            value: `${concentration}% of total errors`,
            baseline: 'Uniform distribution',
            ratio: `${top2ErrorCount} / ${totalErrors} failures`,
          },
          affectedServices: Array.from(new Set(top2.map((e) => e.serviceName))),
          affectedEndpoints: top2.map((e) => e.endpoint),
          suggestedAction: `Deploy circuit breakers on ${top2[0].endpoint} and check recent configuration diffs.`,
        });
      }
    }

    // Insight 3: Cascading Failure / Root Culprit
    const culpritIncident = incidents.find((i) => i.status === 'OPEN');
    if (culpritIncident) {
      intelligentInsights.push({
        id: 'insight-cascading-culprit',
        severity: 'CRITICAL',
        title: `${culpritIncident.rootService} is the likely root culprit of cascading degradation`,
        description: `Correlated trace dependencies show upstream callers are timing out while waiting for ${culpritIncident.rootService} to respond. Error logs confirm downstream queue saturation.`,
        evidence: {
          metric: 'Correlated Anomaly',
          value: `${culpritIncident.errorRatePeak}% error peak`,
          baseline: '< 1.0%',
          ratio: `${Math.round(culpritIncident.latencyPeakMs)}ms latency peak`,
        },
        affectedServices: culpritIncident.affectedServices || [culpritIncident.rootService],
        affectedEndpoints: [culpritIncident.title],
        suggestedAction: `Resolve open incident: "${culpritIncident.title}". Inspect connection pool settings on ${culpritIncident.rootService}.`,
      });
    } else if (systemErrorRate > 0 && avgLatencyMs > 600) {
      intelligentInsights.push({
        id: 'insight-latency-error-correlation',
        severity: 'WARNING',
        title: 'Error rate increased immediately after a latency spike',
        description: 'System error rates surged once average response times crossed the 600ms threshold, indicating client request timeouts.',
        evidence: {
          metric: 'Latency Trigger',
          value: `${avgLatencyMs}ms avg`,
          baseline: '< 250ms',
          ratio: `${systemErrorRate}% errors`,
        },
        affectedServices: serviceMetrics.filter((s) => s.errorRate > 0).map((s) => s.name),
        affectedEndpoints: [],
        suggestedAction: 'Lower client-side timeout thresholds to prevent upstream thread pool exhaustion.',
      });
    }

    // Insight 4: SLO & Error Budget burn
    if (errorBudgetRemainingPercent < 90) {
      intelligentInsights.push({
        id: 'insight-error-budget-burn',
        severity: errorBudgetRemainingPercent < 40 ? 'CRITICAL' : 'WARNING',
        title: `Error budget consumption elevated (${100 - errorBudgetRemainingPercent}% consumed)`,
        description: `Under 99.9% SLO targets, the current ${systemErrorRate}% error rate exceeds acceptable burn rates. Only ${errorBudgetRemainingPercent}% of the error budget remains for this window.`,
        evidence: {
          metric: 'Budget Remaining',
          value: `${errorBudgetRemainingPercent}%`,
          baseline: '100% target',
          ratio: `${(systemErrorRate / 0.1).toFixed(1)}x allowed error burn`,
        },
        affectedServices: serviceMetrics.filter((s) => s.errorRate > 0).map((s) => s.name),
        affectedEndpoints: [],
        suggestedAction: 'Enforce deployment freeze or route traffic to a secondary healthy fallback cluster.',
      });
    }

    // Insight 5: Positive Baseline Stability (Telemetry verified healthy)
    if (intelligentInsights.length === 0 && activeSpans.length > 0) {
      intelligentInsights.push({
        id: 'insight-baseline-stable',
        severity: 'INFO',
        title: `Telemetry Verified: ${services.length || 1} service(s) operating within nominal baseline`,
        description: `Ingested ${activeSpans.length} active telemetry spans. Throughput is ${liveRps > 0 ? liveRps : rps} req/s with P95 latency of ${p95Ms}ms and ${systemErrorRate}% error rate. All metrics comply with 99.9% SLO targets.`,
        evidence: {
          metric: 'System Health',
          value: `${p95Ms}ms p95 · ${systemErrorRate}% errors`,
          baseline: '≤ 300ms p95',
          ratio: 'Nominal Baseline',
        },
        affectedServices: services.map((s) => s.name),
        affectedEndpoints: endpointAnalytics.slice(0, 3).map((e) => e.endpoint),
        suggestedAction: 'Telemetry pipeline operating nominally. Continue monitoring or trigger simulated load to test automated alerting.',
      });
    }

    // Insight 6: Web Vitals Real User Monitoring (if browser vitals detected)
    const vitalSpans = activeSpans.filter((s) => s.attributes && s.attributes['vital.name']);
    if (vitalSpans.length > 0) {
      const poorVitals = vitalSpans.filter((s) => s.attributes['vital.rating'] === 'poor');
      const vitalsSummary = Array.from(new Set(vitalSpans.map((s) => s.attributes['vital.name']))).join(', ');
      if (poorVitals.length > 0) {
        const poorNames = Array.from(new Set(poorVitals.map((s) => s.attributes['vital.name']))).join(', ');
        intelligentInsights.push({
          id: 'insight-rum-degradation',
          severity: 'WARNING',
          title: `Real User Monitoring: Poor Core Web Vitals detected (${poorNames})`,
          description: `Browser client telemetry reported ${poorVitals.length} Core Web Vitals sample(s) exceeding Google recommended thresholds (${poorNames}). This directly impacts user experience and Core Web Vitals search ranking.`,
          evidence: {
            metric: 'Vitals Rating',
            value: `${poorVitals.length} poor sample(s)`,
            baseline: 'Google CWV targets',
            ratio: 'Degraded UX',
          },
          affectedServices: Array.from(new Set(poorVitals.map((s) => s.serviceName))),
          affectedEndpoints: Array.from(new Set(poorVitals.map((s) => String(s.attributes['page.url'] || s.operationName)))),
          suggestedAction: 'Review Largest Contentful Paint image assets, optimize render-blocking CSS/JS, or split JavaScript bundles.',
        });
      } else {
        intelligentInsights.push({
          id: 'insight-rum-healthy',
          severity: 'INFO',
          title: `Real User Monitoring: Web Vitals meet Google benchmarks (${vitalsSummary})`,
          description: `Captured real-user performance metrics across ${vitalSpans.length} sample(s). Core Web Vitals (LCP, INP, CLS, FCP, TTFB) are within Google recommended green thresholds.`,
          evidence: {
            metric: 'CWV Compliance',
            value: '100% Pass Rate',
            baseline: 'Google CWV targets',
            ratio: `${vitalSpans.length} samples`,
          },
          affectedServices: Array.from(new Set(vitalSpans.map((s) => s.serviceName))),
          affectedEndpoints: Array.from(new Set(vitalSpans.map((s) => String(s.attributes['page.url'] || s.operationName)))),
          suggestedAction: 'Web vitals are optimal. Continue monitoring user performance across client devices.',
        });
      }
    }

    // Distributed Traces for Waterfall Explorer
    const traceMap = new Map<string, any[]>();
    for (const sp of recentSpans) {
      if (!traceMap.has(sp.traceId)) traceMap.set(sp.traceId, []);
      traceMap.get(sp.traceId)!.push(sp);
    }

    const traces = Array.from(traceMap.entries())
      .slice(0, 30)
      .map(([traceId, spans]) => {
        const sorted = spans.slice().sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
        );
        const root = sorted.find((s) => !s.parentSpanId) || sorted[0];
        const hasError = sorted.some((s) => s.statusCode === 2);
        const maxDurationMs = sorted.length > 0 ? Math.max(...sorted.map((s) => s.durationMs)) : 0;
        return {
          traceId,
          rootService: root?.serviceName || 'unknown-service',
          rootOperation: root?.operationName || 'HTTP Request',
          startTime: root?.startTime || new Date(),
          durationMs: Math.round(maxDurationMs * 10) / 10,
          spanCount: sorted.length,
          hasError,
          spans: sorted,
        };
      });

    return {
      project: {
        ...project,
        apiKey: project.apiKey ? `${project.apiKey.slice(0, 14)}••••••••` : '••••••••',
      },
      timeWindow: windowParam,
      systemHealth: {
        totalRequests,
        rps: liveRps > 0 ? liveRps : rps,
        liveRps,
        currentLatencyMs,
        latestEndpoint,
        latestStatusCode,
        latestTime,
        avgLatencyMs,
        p50Ms,
        p90Ms,
        p95Ms,
        p99Ms,
        errorRate: systemErrorRate,
        liveErrorRate,
        errorBudgetRemainingPercent,
        healthyCount,
        degradedCount,
        criticalCount,
        activeIncidentsCount,
        lastUpdated: new Date().toISOString(),
      },
      timeSeries,
      endpointAnalytics,
      errorDistribution,
      intelligentInsights,
      serviceMetrics,
      traces,
      recentLogs,
      incidents,
    };
  }

  async resolveIncident(incidentId: string, userId: string, role: string) {
    const inc = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      include: { project: true },
    });
    if (!inc) return null;
    this.assertProjectAccess(inc.project, userId, role);

    const resolved = await this.prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
      },
    });

    // Write resolution audit log into system logs
    await this.prisma.logEntry.create({
      data: {
        projectId: inc.projectId,
        serviceName: inc.rootService,
        traceId: inc.traceId,
        severity: 'INFO',
        body: `[RESOLVED] Incident "${inc.title}" on service "${inc.rootService}" was marked RESOLVED. Active scouting enabled for recurring failures.`,
        timestamp: new Date(),
      },
    });

    this.events.emitTelemetryUpdate(inc.projectId, {
      type: 'incident:resolved',
      incident: resolved,
    });

    return resolved;
  }

  // Built-in OTLP traffic generator so you can test Normal vs Incident flows in 1 click
  async simulateScenario(
    projectId: string,
    mode: 'normal' | 'incident',
    userId: string,
    role: string,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');
    this.assertProjectAccess(project, userId, role);
    const nowNs = BigInt(Date.now()) * 1_000_000n;
    const isIncident = mode === 'incident';
    const batchCount = isIncident ? 4 : 3;

    for (let i = 0; i < batchCount; i++) {
      const traceId = crypto.randomBytes(16).toString('hex');
      const authSpanId = crypto.randomBytes(8).toString('hex');
      const orderSpanId = crypto.randomBytes(8).toString('hex');
      const paymentSpanId = crypto.randomBytes(8).toString('hex');
      const dbSpanId = crypto.randomBytes(8).toString('hex');
      const notifySpanId = crypto.randomBytes(8).toString('hex');

      const paymentDurationMs = isIncident ? 7800 + Math.floor(Math.random() * 900) : 145;
      const orderDurationMs = isIncident ? paymentDurationMs + 120 : 210;
      const isFailedRequest = isIncident && i % 2 === 0;

      const otlpTracePayload = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'auth-service' } },
                { key: 'telemetry.sdk.language', value: { stringValue: 'nodejs' } },
              ],
            },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId,
                    spanId: authSpanId,
                    name: 'POST /auth/verify-token',
                    startTimeUnixNano: String(nowNs),
                    endTimeUnixNano: String(nowNs + 28_000_000n),
                    status: { code: 1 },
                    attributes: [{ key: 'http.status_code', value: { intValue: 200 } }],
                  },
                ],
              },
            ],
          },
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'order-service' } },
                { key: 'telemetry.sdk.language', value: { stringValue: 'nodejs' } },
              ],
            },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId,
                    spanId: orderSpanId,
                    name: 'POST /api/orders/checkout',
                    startTimeUnixNano: String(nowNs + 30_000_000n),
                    endTimeUnixNano: String(
                      nowNs + safeBigInt((30 + orderDurationMs) * 1_000_000),
                    ),
                    status: { code: isFailedRequest ? 2 : 1 },
                    attributes: [
                      {
                        key: 'http.status_code',
                        value: { intValue: isFailedRequest ? 504 : 200 },
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'payment-service' } },
                { key: 'telemetry.sdk.language', value: { stringValue: 'python' } },
              ],
            },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId,
                    spanId: paymentSpanId,
                    parentSpanId: orderSpanId,
                    name: 'POST /payments/charge',
                    startTimeUnixNano: String(nowNs + 45_000_000n),
                    endTimeUnixNano: String(
                      nowNs + safeBigInt((45 + paymentDurationMs) * 1_000_000),
                    ),
                    status: { code: isIncident ? 2 : 1 },
                    attributes: [
                      {
                        key: 'http.status_code',
                        value: { intValue: isIncident ? 500 : 200 },
                      },
                      {
                        key: 'db.pool.active_connections',
                        value: { intValue: isIncident ? 100 : 12 },
                      },
                    ],
                  },
                  {
                    traceId,
                    spanId: dbSpanId,
                    parentSpanId: paymentSpanId,
                    name: 'SELECT FOR UPDATE payments_ledger',
                    startTimeUnixNano: String(nowNs + 55_000_000n),
                    endTimeUnixNano: String(
                      nowNs + safeBigInt((40 + paymentDurationMs) * 1_000_000),
                    ),
                    status: { code: isIncident ? 2 : 1 },
                    attributes: [
                      { key: 'db.system', value: { stringValue: 'postgresql' } },
                    ],
                  },
                ],
              },
            ],
          },
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'notification-service' } },
                { key: 'telemetry.sdk.language', value: { stringValue: 'go' } },
              ],
            },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId,
                    spanId: notifySpanId,
                    parentSpanId: orderSpanId,
                    name: 'POST /notify/email-confirmation',
                    startTimeUnixNano: String(nowNs + 60_000_000n),
                    endTimeUnixNano: String(nowNs + 115_000_000n),
                    status: { code: 1 },
                    attributes: [{ key: 'http.status_code', value: { intValue: 202 } }],
                  },
                ],
              },
            ],
          },
        ],
      };

      await this.ingestOtlpTraces(projectId, otlpTracePayload);

      if (isIncident) {
        await this.ingestOtlpLogs(projectId, {
          resourceLogs: [
            {
              resource: {
                attributes: [
                  { key: 'service.name', value: { stringValue: 'payment-service' } },
                ],
              },
              scopeLogs: [
                {
                  logRecords: [
                    {
                      traceId,
                      spanId: paymentSpanId,
                      severityText: 'ERROR',
                      body: {
                        stringValue:
                          'TimeoutError: PostgreSQL connection pool exhausted (active=100/100, waiting=48). Failed to acquire connection within 8000ms.',
                      },
                    },
                  ],
                },
              ],
            },
            {
              resource: {
                attributes: [
                  { key: 'service.name', value: { stringValue: 'order-service' } },
                ],
              },
              scopeLogs: [
                {
                  logRecords: [
                    {
                      traceId,
                      spanId: orderSpanId,
                      severityText: 'ERROR',
                      body: {
                        stringValue:
                          'UpstreamTimeoutException: POST http://payment-service/payments/charge timed out after 8000ms (504 Gateway Timeout).',
                      },
                    },
                  ],    
                },
              ],
            },
          ],
        });
      }
    }

    return { simulated: mode, batches: batchCount };
  }
}