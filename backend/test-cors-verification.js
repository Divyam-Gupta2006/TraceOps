const assert = require('assert');

async function runVerification() {
  const base = 'http://localhost:4000';
  const prodOrigin = 'https://trace-ops-three.vercel.app';
  const evilOrigin = 'https://unauthorized-evil-site.com';

  console.log('--- STARTING CORS VERIFICATION SUITE ---\n');

  // Step 1: Pre-requisite - Register and get JWT
  const regEmail = `cors_verify_${Date.now()}@example.com`;
  const regRes = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': prodOrigin },
    body: JSON.stringify({ email: regEmail, password: 'Password123!', name: 'CORS Tester' })
  });
  const regData = await regRes.json();
  const token = regData.token;
  assert.ok(token, 'Must receive token from registration');

  // Create a project
  const projRes = await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Origin': prodOrigin
    },
    body: JSON.stringify({ name: 'CORS Test Project' })
  });
  const proj = await projRes.json();
  const projectId = proj.id;
  assert.ok(projectId, 'Must receive project ID');
  console.log(`[Setup] Created test user and project ${projectId}\n`);

  // Test 1: OPTIONS preflight from production frontend origin
  console.log('Test 1: OPTIONS Preflight from production origin (https://trace-ops-three.vercel.app)');
  const optRes = await fetch(`${base}/api/projects/${projectId}/dashboard?window=1h`, {
    method: 'OPTIONS',
    headers: {
      'Origin': prodOrigin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization,content-type,cache-control,pragma'
    }
  });
  console.log('  Status:', optRes.status);
  assert.strictEqual(optRes.status, 204, 'Preflight must return 204 No Content');
  const optOrigin = optRes.headers.get('access-control-allow-origin');
  const optMethods = optRes.headers.get('access-control-allow-methods');
  const optHeaders = optRes.headers.get('access-control-allow-headers');

  console.log('  Access-Control-Allow-Origin:', optOrigin);
  console.log('  Access-Control-Allow-Methods:', optMethods);
  console.log('  Access-Control-Allow-Headers:', optHeaders);

  assert.strictEqual(optOrigin, prodOrigin, 'Allow-Origin must match exact production origin');
  assert.ok(optMethods && optMethods.includes('GET') && optMethods.includes('OPTIONS'), 'Allow-Methods must contain GET and OPTIONS');
  assert.ok(optHeaders && optHeaders.toLowerCase().includes('authorization') && optHeaders.toLowerCase().includes('content-type'), 'Allow-Headers must contain Authorization and Content-Type');
  assert.ok(optHeaders.toLowerCase().includes('cache-control') && optHeaders.toLowerCase().includes('pragma'), 'Allow-Headers must contain Cache-Control and Pragma');
  console.log('  ✓ Test 1 Passed\n');

  // Test 2: Actual GET request with valid JWT from production frontend origin
  console.log('Test 2: Actual GET request with valid JWT from production origin');
  const getRes = await fetch(`${base}/api/projects/${projectId}/dashboard?window=1h`, {
    method: 'GET',
    headers: {
      'Origin': prodOrigin,
      'Authorization': `Bearer ${token}`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    }
  });
  console.log('  Status:', getRes.status);
  assert.strictEqual(getRes.status, 200, 'GET must succeed with 200 OK');
  const getOrigin = getRes.headers.get('access-control-allow-origin');
  const getMethods = getRes.headers.get('access-control-allow-methods');
  const getHeaders = getRes.headers.get('access-control-allow-headers');

  console.log('  Access-Control-Allow-Origin:', getOrigin);
  console.log('  Access-Control-Allow-Methods:', getMethods);
  console.log('  Access-Control-Allow-Headers:', getHeaders);

  assert.strictEqual(getOrigin, prodOrigin, 'Actual GET response must include exact production Allow-Origin');
  assert.ok(getMethods && getMethods.includes('GET') && getMethods.includes('OPTIONS'), 'Actual GET response must include Allow-Methods with GET and OPTIONS');
  assert.ok(getHeaders && getHeaders.toLowerCase().includes('authorization') && getHeaders.toLowerCase().includes('content-type'), 'Actual GET response must include Allow-Headers with Authorization and Content-Type');
  console.log('  ✓ Test 2 Passed\n');

  // Test 3: Unauthenticated GET request from production frontend origin (401)
  console.log('Test 3: Unauthenticated GET request from production origin (verifying 401 has CORS headers)');
  const unauthRes = await fetch(`${base}/api/projects/${projectId}/dashboard?window=1h`, {
    method: 'GET',
    headers: {
      'Origin': prodOrigin
    }
  });
  console.log('  Status:', unauthRes.status);
  assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must return 401 Unauthorized');
  const unauthOrigin = unauthRes.headers.get('access-control-allow-origin');
  const unauthMethods = unauthRes.headers.get('access-control-allow-methods');
  const unauthHeaders = unauthRes.headers.get('access-control-allow-headers');

  console.log('  Access-Control-Allow-Origin:', unauthOrigin);
  console.log('  Access-Control-Allow-Methods:', unauthMethods);
  console.log('  Access-Control-Allow-Headers:', unauthHeaders);

  assert.strictEqual(unauthOrigin, prodOrigin, '401 response must still have Allow-Origin for production origin');
  assert.ok(unauthMethods && unauthMethods.includes('GET'), '401 response must include Allow-Methods');
  assert.ok(unauthHeaders && unauthHeaders.toLowerCase().includes('authorization'), '401 response must include Allow-Headers');
  console.log('  ✓ Test 3 Passed\n');

  // Test 4: Disallowed Origin rejection
  console.log('Test 4: Disallowed Origin (https://unauthorized-evil-site.com)');
  const evilOpt = await fetch(`${base}/api/projects/${projectId}/dashboard?window=1h`, {
    method: 'OPTIONS',
    headers: {
      'Origin': evilOrigin,
      'Access-Control-Request-Method': 'GET'
    }
  });
  console.log('  OPTIONS Status for evil origin:', evilOpt.status);
  assert.strictEqual(evilOpt.status, 403, 'Preflight from disallowed origin must be rejected with 403');
  assert.strictEqual(evilOpt.headers.get('access-control-allow-origin'), null, 'Must NOT set Allow-Origin for evil origin');

  const evilGet = await fetch(`${base}/api/projects/${projectId}/dashboard?window=1h`, {
    method: 'GET',
    headers: {
      'Origin': evilOrigin,
      'Authorization': `Bearer ${token}`
    }
  });
  console.log('  GET Allow-Origin for evil origin:', evilGet.headers.get('access-control-allow-origin'));
  assert.strictEqual(evilGet.headers.get('access-control-allow-origin'), null, 'GET must NOT set Allow-Origin for evil origin');
  console.log('  ✓ Test 4 Passed\n');

  // Test 5: Telemetry Ingestion CORS (/v1/traces, /v1/logs)
  console.log('Test 5: Telemetry Ingestion endpoint CORS');
  const teleOpt = await fetch(`${base}/v1/traces`, {
    method: 'OPTIONS',
    headers: {
      'Origin': 'https://some-random-client-site.org',
      'Access-Control-Request-Method': 'POST'
    }
  });
  console.log('  Status:', teleOpt.status);
  assert.strictEqual(teleOpt.status, 204, 'Telemetry preflight must return 204');
  assert.strictEqual(teleOpt.headers.get('access-control-allow-origin'), '*', 'Telemetry must allow all origins with *');
  assert.ok(teleOpt.headers.get('access-control-allow-methods').includes('POST'), 'Telemetry must allow POST');
  console.log('  ✓ Test 5 Passed\n');

  console.log('🎉 ALL 5 VERIFICATION TESTS PASSED SUCCESSFULLY!');
}

runVerification().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
