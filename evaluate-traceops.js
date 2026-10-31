/**
 * TraceOps Automated Architecture & Reliability Evaluator
 * Run: node evaluate-traceops.js
 */

const fs = require('fs');
const crypto = require('crypto');
const { performance } = require('perf_hooks');

const BACKEND_URL = process.env.TRACEOPS_URL || 'http://localhost:4000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const PLAYGROUND_URL = process.env.PLAYGROUND_URL || 'http://localhost:3001';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, options = {}) {
  const start = performance.now();
  try {
    const res = await fetch(url, options);
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    let body = null;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { ok: res.ok, status: res.status, durationMs, body, error: null };
  } catch (err) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    return { ok: false, status: 0, durationMs, body: null, error: err.message };
  }
}

function buildOtlpTracePayload({ traceId, rootSpanId, childSpanId, dbSpanId, isAnomaly }) {
  const nowNs = BigInt(Date.now()) * 1_000_000n;
  const dbLatencyMs = isAnomaly ? 6400 : 45;
  const paymentLatencyMs = isAnomaly ? 6550 : 110;
  const gatewayLatencyMs = isAnomaly ? 6700 : 180;

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'api-gateway' } },
            { key: 'telemetry.sdk.language', value: { stringValue: 'nodejs' } },
          ],
        },
        scopeSpans: [
          {
            spans: [
              {
                traceId,
                spanId: rootSpanId,
                name: 'POST /api/v1/checkout',
                startTimeUnixNano: String(nowNs),
                endTimeUnixNano: String(nowNs + BigInt(gatewayLatencyMs * 1_000_000)),
                status: { code: isAnomaly ? 2 : 1 },
                attributes: [{ key: 'http.status_code', value: { intValue: isAnomaly ? 504 : 200 } }],
              },
            ],
          },
        ],
      },
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'billing-service' } },
            { key: 'telemetry.sdk.language', value: { stringValue: 'python' } },
          ],
        },
        scopeSpans: [
          {
            spans: [
              {
                traceId,
                spanId: childSpanId,
                parentSpanId: rootSpanId,
                name: 'POST /billing/charge-card',
                startTimeUnixNano: String(nowNs + 15_000_000n),
                endTimeUnixNano: String(nowNs + BigInt((15 + paymentLatencyMs) * 1_000_000)),
                status: { code: isAnomaly ? 2 : 1 },
                attributes: [{ key: 'http.status_code', value: { intValue: isAnomaly ? 500 : 200 } }],
              },
            ],
          },
        ],
      },
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'ledger-postgres-db' } },
            { key: 'telemetry.sdk.language', value: { stringValue: 'postgresql' } },
          ],
        },
        scopeSpans: [
          {
            spans: [
              {
                traceId,
                spanId: dbSpanId,
                parentSpanId: childSpanId,
                name: 'SELECT FOR UPDATE ledger_accounts',
                startTimeUnixNano: String(nowNs + 30_000_000n),
                endTimeUnixNano: String(nowNs + BigInt((30 + dbLatencyMs) * 1_000_000)),
                status: { code: isAnomaly ? 2 : 1 },
                attributes: [
                  { key: 'db.system', value: { stringValue: 'postgresql' } },
                  { key: 'db.lock_wait_ms', value: { intValue: dbLatencyMs } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

async function runEvaluation() {
  console.log('====================================================');
  console.log('🔍 Starting TraceOps Automated Architecture Benchmark');
  console.log('====================================================\n');

  const report = {
    timestamp: new Date().toISOString(),
    endpoints: { BACKEND_URL, FRONTEND_URL, PLAYGROUND_URL },
    summary: { passed: 0, failed: 0, warnings: 0 },
    metrics: {},
    tests: [],
  };

  const recordTest = (name, status, details, metrics = {}) => {
    if (status === 'PASS') report.summary.passed++;
    else if (status === 'FAIL') report.summary.failed++;
    else report.summary.warnings++;

    report.tests.push({ name, status, details, metrics });
    const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
    console.log(`${icon} [${status}] ${name}`);
    if (details) console.log(`   └─ ${details}`);
  };

  // 1. Check Service Availability (Backend, Frontend, Playground)
  const backendCheck = await request(`${BACKEND_URL}/api/projects`);
  const frontendCheck = await request(FRONTEND_URL);
  const playgroundCheck = await request(PLAYGROUND_URL);

  if (!backendCheck.ok) {
    recordTest(
      '1. Core Infrastructure Reachability',
      'FAIL',
      `Backend unreachable at ${BACKEND_URL} (${backendCheck.error || backendCheck.status})`,
    );
    fs.writeFileSync('traceops-eval-report.json', JSON.stringify(report, null, 2));
    console.log('\n❌ Aborting early: Backend is not running. Start backend first.');
    return;
  }

  recordTest(
    '1. Core Infrastructure Reachability',
    'PASS',
    `Backend OK (${backendCheck.durationMs}ms) | Frontend: ${frontendCheck.ok ? 'UP' : 'DOWN'} | Playground (${PLAYGROUND_URL}): ${playgroundCheck.ok ? 'UP' : 'NOT DETECTED on :3001'}`,
    {
      backendLatencyMs: backendCheck.durationMs,
      frontendUp: frontendCheck.ok,
      playgroundUp: playgroundCheck.ok,
    },
  );

  // 2. Multi-Tenancy Project Creation & Isolation Setup
  const projARes = await request(`${BACKEND_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Eval-Tenant-A-${Date.now()}`, framework: 'Node.js · OTel' }),
  });
  const projBRes = await request(`${BACKEND_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Eval-Tenant-B-${Date.now()}`, framework: 'Python · FastAPI' }),
  });

  const tenantA = projARes.body;
  const tenantB = projBRes.body;

  if (tenantA?.apiKey && tenantB?.apiKey && tenantA.apiKey !== tenantB.apiKey) {
    recordTest(
      '2. Multi-Tenant Project & Credential Provisioning',
      'PASS',
      `Created isolated tenants with unique keys (${tenantA.apiKey.slice(0, 14)}...)`,
    );
  } else {
    recordTest('2. Multi-Tenant Project & Credential Provisioning', 'FAIL', 'Failed to generate unique API keys');
  }

  // 3. Authentication Guard Verification
  const unauthRes = await request(`${BACKEND_URL}/v1/traces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-traceops-key': 'invalid_fake_key_123' },
    body: JSON.stringify({ resourceSpans: [] }),
  });

  if (unauthRes.status === 401 || unauthRes.status === 403) {
    recordTest(
      '3. Ingestion Security & API Key Guard',
      'PASS',
      `Rejected invalid API key with HTTP ${unauthRes.status} in ${unauthRes.durationMs}ms`,
    );
  } else {
    recordTest(
      '3. Ingestion Security & API Key Guard',
      'FAIL',
      `Expected HTTP 401/403 for bad key, got HTTP ${unauthRes.status}`,
    );
  }

  // 4. Normal Baseline Telemetry & Throughput Burst Benchmark
  const burstLatencies = [];
  for (let i = 0; i < 10; i++) {
    const payload = buildOtlpTracePayload({
      traceId: crypto.randomBytes(16).toString('hex'),
      rootSpanId: crypto.randomBytes(8).toString('hex'),
      childSpanId: crypto.randomBytes(8).toString('hex'),
      dbSpanId: crypto.randomBytes(8).toString('hex'),
      isAnomaly: false,
    });
    const res = await request(`${BACKEND_URL}/v1/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-traceops-key': tenantA.apiKey },
      body: JSON.stringify(payload),
    });
    burstLatencies.push(res.durationMs);
  }

  const avgIngestMs =
    Math.round((burstLatencies.reduce((a, b) => a + b, 0) / burstLatencies.length) * 100) / 100;
  const maxIngestMs = Math.max(...burstLatencies);
  report.metrics.avgIngestionLatencyMs = avgIngestMs;
  report.metrics.maxIngestionLatencyMs = maxIngestMs;

  recordTest(
    '4. OTLP Trace Ingestion Throughput (10x 3-Service Traces = 30 Spans)',
    avgIngestMs < 150 ? 'PASS' : 'WARN',
    `Avg ingestion latency: ${avgIngestMs}ms (Max: ${maxIngestMs}ms)`,
    { avgIngestMs, maxIngestMs },
  );

  // 5. Inject Cascading Failure & Correlated Error Logs
  let anomalyTraceId = '';
  for (let i = 0; i < 4; i++) {
    anomalyTraceId = crypto.randomBytes(16).toString('hex');
    const rootSpanId = crypto.randomBytes(8).toString('hex');
    const childSpanId = crypto.randomBytes(8).toString('hex');
    const dbSpanId = crypto.randomBytes(8).toString('hex');

    const anomalyPayload = buildOtlpTracePayload({
      traceId: anomalyTraceId,
      rootSpanId,
      childSpanId,
      dbSpanId,
      isAnomaly: true,
    });

    await request(`${BACKEND_URL}/v1/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-traceops-key': tenantA.apiKey },
      body: JSON.stringify(anomalyPayload),
    });

    await request(`${BACKEND_URL}/v1/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-traceops-key': tenantA.apiKey },
      body: JSON.stringify({
        resourceLogs: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'ledger-postgres-db' } }],
            },
            scopeLogs: [
              {
                logRecords: [
                  {
                    traceId: anomalyTraceId,
                    spanId: dbSpanId,
                    severityText: 'ERROR',
                    body: {
                      stringValue:
                        'DeadlockDetectedException: Exclusive row lock wait exceeded 6400ms on table ledger_accounts.',
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    });
  }

  // Wait briefly for async anomaly evaluation + AI RCA generation
  await sleep(4500);

  // 6. Verify Dashboard Aggregation, Root-Cause Accuracy & Tenant Isolation
  const dashARes = await request(`${BACKEND_URL}/api/projects/${tenantA.id}/dashboard`);
  const dashBRes = await request(`${BACKEND_URL}/api/projects/${tenantB.id}/dashboard`);

  const dashA = dashARes.body;
  const dashB = dashBRes.body;

  // Check Tenant B is completely empty (Strict Multi-tenancy check)
  const tenantBIsolated =
    (dashB?.serviceMetrics?.length || 0) === 0 && (dashB?.incidents?.length || 0) === 0;

  recordTest(
    '5. Multi-Tenant Data Isolation Check',
    tenantBIsolated ? 'PASS' : 'FAIL',
    tenantBIsolated
      ? 'Tenant B had 0 leaked spans, services, or incidents from Tenant A'
      : 'Data leak detected between tenants!',
  );

  // Check Service Discovery & Topology Parent-Child Preservation
  const discoveredServices = (dashA?.serviceMetrics || []).map((s) => s.name);
  const sampleTrace = (dashA?.traces || [])[0];
  const hasParentLinks = sampleTrace?.spans?.some((s) => Boolean(s.parentSpanId));

  if (discoveredServices.length === 3 && hasParentLinks) {
    recordTest(
      '6. Auto-Discovery & Distributed Trace Hierarchy',
      'PASS',
      `Discovered [${discoveredServices.join(', ')}] with intact parentSpanId links`,
      { discoveredServices },
    );
  } else {
    recordTest(
      '6. Auto-Discovery & Distributed Trace Hierarchy',
      'FAIL',
      `Expected 3 services + parentSpanId links, got: [${discoveredServices.join(', ')}]`,
    );
  }

  // 7. Evaluate Incident Correlation & AI RCA Quality
  const incident = (dashA?.incidents || [])[0];
  if (!incident) {
    recordTest(
      '7. Anomaly Detection & AI RCA Generation',
      'FAIL',
      'No incident was triggered after injecting 6.4s latency & error spike',
    );
  } else {
    const pinnedDeepestLeaf = incident.rootService === 'ledger-postgres-db';
    const hasRecommendations =
      Array.isArray(incident.aiRecommendations) && incident.aiRecommendations.length >= 2;
    const mentionsEvidence =
      incident.aiHypothesis?.toLowerCase().includes('ledger') ||
      incident.aiHypothesis?.toLowerCase().includes('lock') ||
      incident.aiHypothesis?.toLowerCase().includes('6400');

    report.metrics.incidentSample = {
      title: incident.title,
      rootService: incident.rootService,
      affectedServices: incident.affectedServices,
      errorRatePeak: incident.errorRatePeak,
      latencyPeakMs: incident.latencyPeakMs,
      confidenceScore: incident.confidenceScore,
      aiHypothesis: incident.aiHypothesis,
      aiRecommendations: incident.aiRecommendations,
    };

    recordTest(
      '7. Root-Cause Localization & AI Incident Synthesis',
      pinnedDeepestLeaf && hasRecommendations ? 'PASS' : 'WARN',
      `Root Service Identified: "${incident.rootService}" (Expected: "ledger-postgres-db") | Grounded in logs: ${mentionsEvidence}`,
      report.metrics.incidentSample,
    );
  }

  fs.writeFileSync('traceops-eval-report.json', JSON.stringify(report, null, 2));

  console.log('\n====================================================');
  console.log(
    `📊 Summary: ${report.summary.passed} Passed | ${report.summary.warnings} Warnings | ${report.summary.failed} Failed`,
  );
  console.log('📁 Saved detailed diagnostic output to: traceops-eval-report.json');
  console.log('====================================================');
  console.log('\n👉 Copy and paste the contents of "traceops-eval-report.json" into the chat so I can analyze it!');
}

runEvaluation();