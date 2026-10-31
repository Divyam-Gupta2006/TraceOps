/**
 * Comprehensive End-to-End Test for TraceOps Platform & Browser SDK
 */

const assert = require('assert');

const BACKEND_URL = 'http://localhost:4000';

async function runE2E() {
  console.log('🚀 Starting TraceOps End-to-End Verification...\n');

  // 1. User Registration
  const testEmail = `developer_${Date.now()}@example.com`;
  const password = 'Password123!';

  console.log(`1. Testing User Registration: ${testEmail}`);
  const regRes = await fetch(`${BACKEND_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test Developer', email: testEmail, password }),
  });
  assert.strictEqual(regRes.status, 201, `Registration should succeed (got ${regRes.status})`);
  const regData = await regRes.json();
  assert.ok(regData.token, 'Registration must return JWT token');
  console.log('   ✓ Registered successfully.\n');

  // 2. User Login
  console.log('2. Testing User Login');
  const loginRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password }),
  });
  assert.ok(loginRes.status === 200 || loginRes.status === 201, `Login should succeed (got ${loginRes.status})`);
  const loginData = await loginRes.json();
  const token = loginData.token;
  assert.ok(token, 'Login must return JWT token');
  console.log('   ✓ Logged in successfully. Received JWT.\n');

  // 3. Create Project
  console.log('3. Testing Project Creation');
  const projRes = await fetch(`${BACKEND_URL}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'E2E Demo Web App',
      framework: 'Next.js · @traceops/browser',
    }),
  });
  assert.strictEqual(projRes.status, 201, `Project creation should succeed (got ${projRes.status})`);
  const project = await projRes.json();
  const projectId = project.id;
  assert.ok(projectId, 'Project must have an id');
  console.log(`   ✓ Project created: "${project.name}" (ID: ${projectId})\n`);

  // 4. Retrieve Credentials (API Key)
  console.log('4. Testing Project Credentials Endpoint');
  const credsRes = await fetch(`${BACKEND_URL}/api/projects/${projectId}/credentials`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(credsRes.status, 200, 'Credentials endpoint must return 200');
  const creds = await credsRes.json();
  const apiKey = creds.apiKey;
  assert.ok(apiKey && apiKey.startsWith('tops_live_'), `Must return unmasked API key (got: ${apiKey})`);
  console.log(`   ✓ Retrieved Project API Key: ${apiKey.slice(0, 14)}••••••••\n`);

  // 5. CORS Verification from External Origin (http://localhost:5050)
  console.log('5. Testing Telemetry Ingestion CORS from External Origin (http://localhost:5050)');
  const corsPreflight = await fetch(`${BACKEND_URL}/v1/traces`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5050',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type, x-traceops-key',
    },
  });
  assert.strictEqual(corsPreflight.status, 204, `OPTIONS preflight should return 204 (got ${corsPreflight.status})`);
  const allowOrigin = corsPreflight.headers.get('access-control-allow-origin');
  assert.ok(allowOrigin === '*' || allowOrigin === 'http://localhost:5050', 'CORS allow origin must be present');
  console.log(`   ✓ CORS Preflight accepted (Access-Control-Allow-Origin: ${allowOrigin})\n`);

  // 6. Test Ingestion via @traceops/browser SDK
  console.log('6. Testing Ingestion via @traceops/browser SDK (dual ESM/CJS runtime)');
  const { TraceOps } = require('./browser-sdk/dist/cjs/index.js');

  const sdk = TraceOps.init({
    apiKey: apiKey,
    endpoint: BACKEND_URL,
    serviceName: 'demo-storefront',
    batchSize: 2,
    flushInterval: 500,
  });

  // Capture spans
  sdk.captureSpan({
    name: 'GET /api/products',
    durationMs: 42,
    statusCode: 1,
    attributes: { 'http.status': 200, environment: 'e2e-test' },
  });

  // Capture Web Vital span
  sdk.captureSpan({
    name: 'web-vital: LCP',
    durationMs: 1420,
    statusCode: 1,
    attributes: {
      'vital.name': 'LCP',
      'vital.value': 1420,
      'vital.rating': 'good',
    },
  });

  // Capture error span and log
  sdk.captureSpan({
    name: 'error: TypeError',
    durationMs: 1,
    statusCode: 2,
    attributes: {
      'error.type': 'TypeError',
      'error.message': 'Cannot read property price of undefined',
    },
  });

  sdk.captureLog({
    message: 'Uncaught TypeError: Cannot read property price of undefined at checkout.js:42:15',
    severity: 'ERROR',
    attributes: { component: 'checkout_form' },
  });

  // Flush to ensure transport sends immediately
  await sdk.flush();
  // Wait a short moment for database persistence and debounce
  await new Promise((r) => setTimeout(r, 1000));
  console.log('   ✓ Telemetry dispatched via @traceops/browser SDK.\n');

  // 7. Verify Ingestion in PostgreSQL Dashboard Endpoint
  console.log('7. Verifying Persisted Telemetry in Project Dashboard');
  const dashRes = await fetch(`${BACKEND_URL}/api/projects/${projectId}/dashboard?window=1h`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(dashRes.status, 200, `Dashboard endpoint should return 200 (got ${dashRes.status})`);
  const dashboard = await dashRes.json();

  assert.ok(dashboard.systemHealth, 'Dashboard must contain systemHealth');
  assert.ok(dashboard.systemHealth.totalRequests >= 3, `Must record at least 3 spans (got ${dashboard.systemHealth.totalRequests})`);
  assert.ok(dashboard.traces.length > 0, 'Dashboard must list recorded traces');
  assert.ok(dashboard.recentLogs.length > 0, 'Dashboard must list recorded logs');

  const recordedSpans = [];
  dashboard.traces.forEach((t) => (t.spans || []).forEach((s) => recordedSpans.push(s)));

  const lcpSpan = recordedSpans.find((s) => s.attributes?.['vital.name'] === 'LCP');
  assert.ok(lcpSpan, 'Must persist Core Web Vital (LCP) span with attributes');
  console.log(`   ✓ Dashboard verified: ${dashboard.systemHealth.totalRequests} spans, ${dashboard.traces.length} traces, ${dashboard.recentLogs.length} logs recorded.`);
  console.log(`   ✓ Core Web Vital (LCP) captured: ${lcpSpan.attributes['vital.value']}ms (${lcpSpan.attributes['vital.rating']})\n`);

  // 8. Test Invalid API Key Rejection
  console.log('8. Testing Invalid API Key Rejection');
  const invalidRes = await fetch(`${BACKEND_URL}/v1/traces`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-traceops-key': 'tops_live_invalid_bad_key',
    },
    body: JSON.stringify({
      resourceSpans: [],
    }),
  });
  assert.strictEqual(invalidRes.status, 401, `Invalid API key should return 401 Unauthorized (got ${invalidRes.status})`);
  console.log('   ✓ Rejected invalid API key with HTTP 401 Unauthorized.\n');

  // 9. Test Multi-Tenant Project Isolation
  console.log('9. Testing Multi-Tenant Project Isolation');
  const otherEmail = `attacker_${Date.now()}@example.com`;
  const otherReg = await fetch(`${BACKEND_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Other User', email: otherEmail, password }),
  });
  const otherToken = (await otherReg.json()).token;

  // Other user attempts to access first user's project credentials
  const unauthorizedCreds = await fetch(`${BACKEND_URL}/api/projects/${projectId}/credentials`, {
    headers: { Authorization: `Bearer ${otherToken}` },
  });
  assert.strictEqual(unauthorizedCreds.status, 403, `Non-owner should receive 403 Forbidden on credentials (got ${unauthorizedCreds.status})`);

  // Other user attempts to access first user's project dashboard
  const unauthorizedDash = await fetch(`${BACKEND_URL}/api/projects/${projectId}/dashboard?window=1h`, {
    headers: { Authorization: `Bearer ${otherToken}` },
  });
  assert.strictEqual(unauthorizedDash.status, 403, `Non-owner should receive 403 Forbidden on dashboard (got ${unauthorizedDash.status})`);
  console.log('   ✓ Project isolation verified: Foreign users strictly blocked with HTTP 403 Forbidden.\n');

  // 10. Test SDK Resilience when Backend is Down
  console.log('10. Testing SDK Resilience against Host Crashes');
  let errorHandled = false;
  const offlineSdk = TraceOps.init({
    apiKey: apiKey,
    endpoint: 'http://localhost:9999', // Non-existent offline port
    maxRetries: 0,
    onError: () => {
      errorHandled = true;
    },
  });

  assert.doesNotThrow(() => {
    offlineSdk.captureSpan({ name: 'offline-test', durationMs: 10 });
    offlineSdk.captureLog({ message: 'offline-log' });
  }, 'SDK must never crash host application even when backend is unreachable');
  await offlineSdk.flush();
  console.log('   ✓ Host application resilience verified (zero unhandled exceptions).\n');

  await sdk.shutdown();
  console.log('🎉 ALL 10 END-TO-END INTEGRATION CHECKS PASSED SUCCESSFULLY!\n');
}

runE2E().catch((err) => {
  console.error('\n❌ End-to-End Test Failed:', err);
  process.exit(1);
});
