import https from 'node:https';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'airesume.projectdemo.guru',
      port: 443,
      path,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (options.body) req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

async function verifyLiveSuite() {
  console.log('=== Running Live Production Smoke & Regression Tests ===\n');

  // Test 1: Health
  const health = await request('/api/health');
  console.log('1. Health check:', health.status === 200 ? 'PASS' : 'FAIL', `(${health.status})`);
  console.log('   Body:', health.body);

  // Test 2: Unauthenticated Enterprise Status
  const entStatus = await request('/api/enterprise/status');
  console.log('\n2. Unauthenticated Enterprise Status:', entStatus.status === 401 ? 'PASS (Auth enforced)' : 'FAIL', `(${entStatus.status})`);
  console.log('   Body:', entStatus.body);

  // Test 3: Invalid Bearer Token on Enterprise Status
  const invalidToken = await request('/api/enterprise/status', { headers: { 'Authorization': 'Bearer invalid-token' } });
  console.log('\n3. Invalid Token Enterprise Status:', invalidToken.status === 401 ? 'PASS (Invalid token rejected)' : 'FAIL', `(${invalidToken.status})`);
  console.log('   Body:', invalidToken.body);

  // Test 4: M2M Provision with Missing Key
  const m2m = await request('/api/enterprise/m2m/context', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: {} });
  console.log('\n4. M2M Context missing key:', m2m.status === 401 ? 'PASS (M2M key required)' : 'FAIL', `(${m2m.status})`);
  console.log('   Body:', m2m.body);

  // Test 5: Legacy API Header Guard
  const legacyWithTenantHeader = await request('/api/generate-summary', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    },
    body: { occupation: 'Software Engineer' }
  });
  console.log('\n5. Legacy Route Tenant Header Isolation:', legacyWithTenantHeader.status === 401 || legacyWithTenantHeader.status === 400 ? 'PASS' : 'FAIL', `(${legacyWithTenantHeader.status})`);
  console.log('   Body:', legacyWithTenantHeader.body);

  // Test 6: Frontend Route /enterprise
  const entUi = await request('/enterprise');
  console.log('\n6. Frontend /enterprise route:', entUi.status === 200 ? 'PASS (SPA served)' : 'FAIL', `(${entUi.status})`);

  // Test 7: Frontend Route /build-resume
  const resumeUi = await request('/build-resume');
  console.log('\n7. Frontend /build-resume route:', resumeUi.status === 200 ? 'PASS (Consumer builder served)' : 'FAIL', `(${resumeUi.status})`);

  // Test 8: Frontend Route /interview-coach
  const coachUi = await request('/dashboard/interviews');
  console.log('\n8. Frontend /dashboard/interviews route:', coachUi.status === 200 ? 'PASS (Interview coach served)' : 'FAIL', `(${coachUi.status})`);

  console.log('\n=== All Live Production Verification Probes Completed ===');
}

verifyLiveSuite().catch(console.error);
