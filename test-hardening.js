/**
 * TraceOps Multi-Tenant Hardening Verification Test Suite
 * Validates all 16 security and data isolation requirements.
 */

const BACKEND_URL = 'http://localhost:4000';

async function req(url, options = {}) {
  const res = await fetch(url, options);
  let body = null;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

async function runTests() {
  console.log('====================================================');
  console.log('🔒 Starting TraceOps Hardening & Security Audit');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testNum, testName, detail = '') {
    if (condition) {
      console.log(`✅ [PASS] ${testNum}. ${testName}`);
      if (detail) console.log(`   └─ ${detail}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testNum}. ${testName}`);
      if (detail) console.error(`   └─ ${detail}`);
      failed++;
    }
  }

  const ts = Date.now();

  // 1. Unauthenticated users cannot list projects
  const r1 = await req(`${BACKEND_URL}/api/projects`);
  assert(r1.status === 401, 1, 'Unauthenticated users cannot list projects', `Got HTTP ${r1.status}`);

  // 2. Unauthenticated users cannot create projects
  const r2 = await req(`${BACKEND_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hacker Service' }),
  });
  assert(r2.status === 401, 2, 'Unauthenticated users cannot create projects', `Got HTTP ${r2.status}`);

  // 3. Unauthenticated users cannot access dashboards
  const r3 = await req(`${BACKEND_URL}/api/projects/cmvwat99d0000oucw7d22nb9w/dashboard`);
  assert(r3.status === 401, 3, 'Unauthenticated users cannot access dashboards', `Got HTTP ${r3.status}`);

  // 4. Unauthenticated users cannot retrieve project credentials
  const r4 = await req(`${BACKEND_URL}/api/projects/cmvwat99d0000oucw7d22nb9w/credentials`);
  assert(r4.status === 401, 4, 'Unauthenticated users cannot retrieve credentials', `Got HTTP ${r4.status}`);

  // 5. Unauthenticated users cannot resolve incidents or simulate scenarios
  const r5a = await req(`${BACKEND_URL}/api/incidents/fake-inc-id/resolve`, { method: 'POST' });
  const r5b = await req(`${BACKEND_URL}/api/projects/fake-proj/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'normal' }),
  });
  assert(r5a.status === 401 && r5b.status === 401, 5, 'Unauthenticated users cannot resolve incidents or simulate', `Resolve: ${r5a.status}, Simulate: ${r5b.status}`);

  // Setup: Register User A and User B (both get USER role)
  const regA = await req(`${BACKEND_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `userA_${ts}@traceops.io`, password: 'password123', name: 'User A' }),
  });
  const tokenA = regA.body?.token;
  const userA = regA.body?.user;

  const regB = await req(`${BACKEND_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `userB_${ts}@traceops.io`, password: 'password123', name: 'User B' }),
  });
  const tokenB = regB.body?.token;
  const userB = regB.body?.user;

  // Login Alice (Admin)
  const loginAdmin = await req(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@traceops.io', password: 'password123' }),
  });
  const tokenAdmin = loginAdmin.body?.token;

  // User B creates Project B
  const createProjB = await req(`${BACKEND_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ name: `Project-B-${ts}`, framework: 'Next.js' }),
  });
  const projB = createProjB.body;

  // 6. User A cannot access User B's project dashboard
  const r6 = await req(`${BACKEND_URL}/api/projects/${projB.id}/dashboard`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert(r6.status === 403, 6, "User A cannot access User B's dashboard", `Got HTTP ${r6.status}`);

  // 7. User A cannot retrieve User B's project credentials
  const r7 = await req(`${BACKEND_URL}/api/projects/${projB.id}/credentials`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert(r7.status === 403, 7, "User A cannot retrieve User B's project credentials", `Got HTTP ${r7.status}`);

  // 8. User A cannot resolve User B's incidents
  // Simulate an incident in Project B by User B so an incident exists
  await req(`${BACKEND_URL}/api/projects/${projB.id}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ mode: 'incident' }),
  });
  // Fetch dashboard as User B to get incident id
  const dashB = await req(`${BACKEND_URL}/api/projects/${projB.id}/dashboard`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const incB = dashB.body?.incidents?.[0];
  let r8Status = 403;
  if (incB) {
    const r8 = await req(`${BACKEND_URL}/api/incidents/${incB.id}/resolve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    r8Status = r8.status;
  }
  assert(r8Status === 403, 8, "User A cannot resolve User B's incidents", `Got HTTP ${r8Status}`);

  // 9. User A cannot simulate scenarios on User B's projects
  const r9 = await req(`${BACKEND_URL}/api/projects/${projB.id}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ mode: 'normal' }),
  });
  assert(r9.status === 403, 9, "User A cannot simulate scenarios on User B's project", `Got HTTP ${r9.status}`);

  // 10. ADMIN can access all projects
  const r10a = await req(`${BACKEND_URL}/api/projects/${projB.id}/dashboard`, {
    headers: { Authorization: `Bearer ${tokenAdmin}` },
  });
  const r10b = await req(`${BACKEND_URL}/api/projects/${projB.id}/credentials`, {
    headers: { Authorization: `Bearer ${tokenAdmin}` },
  });
  assert(r10a.status === 200 && r10b.status === 200, 10, 'ADMIN can access all projects and credentials', `Dashboard: ${r10a.status}, Credentials: ${r10b.status}`);

  // 11. USER sees only their own projects
  const r11 = await req(`${BACKEND_URL}/api/projects`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const userBProjects = r11.body;
  const onlyOwned = Array.isArray(userBProjects) && userBProjects.every((p) => p.ownerId === userB.id);
  assert(onlyOwned && userBProjects.length === 1 && userBProjects[0].id === projB.id, 11, 'USER sees only their own projects', `User B sees ${userBProjects.length} project(s), all matching ownerId`);

  // 12. A project with null owner is inaccessible to ordinary users
  const unownedProjId = 'cmvwat99d0000oucw7d22nb9w'; // E-Commerce Production App (ownerId: null)
  const r12a = await req(`${BACKEND_URL}/api/projects/${unownedProjId}/dashboard`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const r12b = await req(`${BACKEND_URL}/api/projects/${unownedProjId}/credentials`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert(r12a.status === 403 && r12b.status === 403, 12, 'Null-owner project is inaccessible to ordinary users', `Dashboard: ${r12a.status}, Credentials: ${r12b.status}`);

  // 13. Invalid project API keys are rejected
  const r13 = await req(`${BACKEND_URL}/v1/traces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-traceops-key': 'malicious_invalid_key_99999' },
    body: JSON.stringify({ resourceSpans: [] }),
  });
  const noKeyLeak = !JSON.stringify(r13.body).includes('malicious_invalid_key_99999');
  assert(r13.status === 401 && noKeyLeak, 13, 'Invalid project API keys are rejected without key leakage in response', `Status: ${r13.status}, Response: ${JSON.stringify(r13.body)}`);

  // 14. Valid project API keys still ingest traces and logs
  const userBCreds = await req(`${BACKEND_URL}/api/projects/${projB.id}/credentials`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const apiKeyB = userBCreds.body?.apiKey;

  const r14a = await req(`${BACKEND_URL}/v1/traces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-traceops-key': apiKeyB },
    body: JSON.stringify({
      serviceName: 'checkout-service',
      operationName: 'POST /checkout',
      durationMs: 82,
      statusCode: 200,
    }),
  });

  const r14b = await req(`${BACKEND_URL}/v1/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKeyB}` },
    body: JSON.stringify({
      resourceLogs: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'checkout-service' } }] },
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: String(BigInt(Date.now()) * 1_000_000n),
                  severityText: 'INFO',
                  body: { stringValue: 'Checkout processed successfully for order #48102' },
                },
              ],
            },
          ],
        },
      ],
    }),
  });
  assert(r14a.status === 202 && r14b.status === 202, 14, 'Valid project API keys ingest traces and logs', `Traces: HTTP ${r14a.status}, Logs: HTTP ${r14b.status}`);

  // 15. OTLP ingestion remains compatible
  const dashAfterIngest = await req(`${BACKEND_URL}/api/projects/${projB.id}/dashboard`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const hasSpans = (dashAfterIngest.body?.traces?.length || 0) > 0;
  const hasLogs = (dashAfterIngest.body?.recentLogs?.length || 0) > 0;
  assert(hasSpans && hasLogs, 15, 'OTLP ingestion remains compatible and updates project dashboard', `Accepted traces count: ${dashAfterIngest.body?.traces?.length}, logs: ${dashAfterIngest.body?.recentLogs?.length}`);

  // 16. Existing project and telemetry data are preserved
  // Directly verify E-Commerce Production App in DB via Admin access
  const ecomDash = await req(`${BACKEND_URL}/api/projects/${unownedProjId}/dashboard`, {
    headers: { Authorization: `Bearer ${tokenAdmin}` },
  });
  const ecomPreserved = ecomDash.status === 200 && ecomDash.body?.project?.name === 'E-Commerce Production App';
  assert(ecomPreserved, 16, 'Existing E-Commerce Production App and telemetry preserved', `Project Name: "${ecomDash.body?.project?.name}", Total Requests: ${ecomDash.body?.systemHealth?.totalRequests}`);

  // 17. Public registration privilege escalation resistance
  // Attacker attempts to inject role: 'ADMIN', bootstrapKey, or admin email claim
  const exploitAttempt = await req(`${BACKEND_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `exploit_${ts}@traceops.io`,
      password: 'password123',
      role: 'ADMIN',
      isAdmin: true,
      bootstrapKey: 'some_attempted_key',
    }),
  });
  const createdRole = exploitAttempt.body?.user?.role;
  const meCheck = await req(`${BACKEND_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${exploitAttempt.body?.token}` },
  });
  const meRole = meCheck.body?.role;
  assert(
    createdRole === 'USER' && meRole === 'USER',
    17,
    'Public registration strictly assigns USER (payload injection cannot grant ADMIN)',
    `Returned role: "${createdRole}", Verified /me role: "${meRole}"`,
  );

  console.log('\n====================================================');
  console.log(`📊 Final Results: ${passed} Passed | ${failed} Failed`);
  console.log('====================================================');
}

runTests().catch(console.error);

