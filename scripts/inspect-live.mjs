import https from 'node:https';

function fetchUrl(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'airesume.projectdemo.guru',
      port: 443,
      path: path,
      method: options.method || 'GET',
      headers: options.headers || { 'User-Agent': 'ResumePilotVerifier/1.0' }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function inspectProduction() {
  console.log('=== Probing Live Production Server ===');

  // 1. Health endpoint
  const health = await fetchUrl('/api/health');
  console.log('\n[1] /api/health -> Status:', health.status);
  console.log('Body:', health.body);

  // 2. Enterprise status endpoint
  const entStatus = await fetchUrl('/api/enterprise/status');
  console.log('\n[2] /api/enterprise/status -> Status:', entStatus.status);
  console.log('Body:', entStatus.body);

  // 3. Enterprise context provision endpoint (POST /api/enterprise/context)
  const entContext = await fetchUrl('/api/enterprise/context', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  console.log('\n[3] POST /api/enterprise/context -> Status:', entContext.status);
  console.log('Body:', entContext.body);

  // 4. Enterprise UI HTML route (/enterprise)
  const entUi = await fetchUrl('/enterprise');
  console.log('\n[4] GET /enterprise -> Status:', entUi.status);
  console.log('Content-Type:', entUi.headers['content-type']);
  console.log('HTML snippet:', entUi.body.slice(0, 300));

  // 5. Root page scripts
  const root = await fetchUrl('/');
  console.log('\n[5] GET / -> Status:', root.status);
  const scriptMatches = root.body.match(/src="\/assets\/[^"]+"/g);
  console.log('Bundled script assets:', scriptMatches);

  if (scriptMatches && scriptMatches.length > 0) {
    for (const match of scriptMatches) {
      const assetPath = match.replace('src="', '').replace('"', '');
      console.log('\nFetching asset:', assetPath);
      const asset = await fetchUrl(assetPath);
      console.log('Asset size:', asset.body.length, 'bytes');
      console.log('Contains "VITE_ENTERPRISE_TENANCY_ENABLED":', asset.body.includes('VITE_ENTERPRISE_TENANCY_ENABLED'));
      console.log('Contains "Enterprise":', asset.body.includes('Enterprise'));
      console.log('Contains "enterprise-shell":', asset.body.includes('enterprise-shell'));
      console.log('Contains "6376d7a":', asset.body.includes('6376d7a'));
    }
  }
}

inspectProduction().catch(console.error);
