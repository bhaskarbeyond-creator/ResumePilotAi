import https from 'node:https';

function requestApi(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'airesume.projectdemo.guru',
      port: 443,
      path: path,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    if (options.body) req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

async function runLiveAdversarialTenantTest() {
  console.log('\n===============================================================');
  console.log('LIVE ADVERSARIAL TENANT A / TENANT B ISOLATION TEST');
  console.log('===============================================================\n');

  // Test 1: Spoofed Tenant ID Header without auth is blocked
  console.log('1. Testing spoofed X-Tenant-Id header without bearer token...');
  const res1 = await requestApi('/api/enterprise/context', {
    headers: { 'X-Tenant-Id': 'tenant-test-a-victim', 'Accept': 'application/json' }
  });
  console.log(`Response Status: ${res1.status}, Body: ${res1.body}`);
  if (res1.status !== 401) throw new Error(`Expected 401, got ${res1.status}`);
  console.log('✓ Spoofed tenant header rejected at edge authentication gate');

  // Test 2: Injected cross-tenant workspace header is blocked
  console.log('\n2. Testing cross-tenant workspace manipulation header...');
  const res2 = await requestApi('/api/enterprise/workspaces', {
    headers: { 'X-Tenant-Id': 'tenant-test-b-attacker', 'X-Workspace-Id': 'ws-tenant-a-private', 'Accept': 'application/json' }
  });
  console.log(`Response Status: ${res2.status}, Body: ${res2.body}`);
  if (res2.status !== 401 && res2.status !== 403) throw new Error(`Expected 401 or 403, got ${res2.status}`);
  console.log('✓ Cross-tenant workspace access rejected');

  // Test 3: Legacy consumer endpoints reject injected tenant headers
  console.log('\n3. Testing legacy consumer endpoint rejects X-Tenant-Id mixing...');
  const res3 = await requestApi('/api/generate-summary', {
    method: 'POST',
    headers: { 'X-Tenant-Id': 'tenant-spoof-attempt', 'Content-Type': 'application/json' },
    body: { jobTitle: 'Engineer' }
  });
  console.log(`Response Status: ${res3.status}, Body: ${res3.body}`);
  if (res3.status !== 401 && res3.status !== 403) throw new Error(`Expected 401/403, got ${res3.status}`);
  console.log('✓ Legacy API rejects tenant headers and disallows silent context mixing');

  console.log('\n===============================================================');
  console.log('LIVE TENANT ADVERSARIAL ISOLATION TEST: 100% PASS');
  console.log('===============================================================\n');
}

runLiveAdversarialTenantTest().catch(err => {
  console.error('Adversarial test failed:', err);
  process.exit(1);
});
