import https from 'node:https';

const BASE_URL = 'https://airesume.projectdemo.guru';

function fetchJson(path) {
  return new Promise((resolve) => {
    https.get(`${BASE_URL}${path}`, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed, ok: res.statusCode >= 200 && res.statusCode < 300 });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data.slice(0, 100), ok: false });
        }
      });
    }).on('error', (err) => {
      resolve({ status: 0, error: err.message, ok: false });
    });
  });
}

async function verifyAll() {
  console.log('====================================================');
  console.log(`VERIFYING PRODUCTION DEPLOYMENT AT ${BASE_URL}`);
  console.log('====================================================\n');

  const endpoints = ['/api/healthz', '/api/readyz', '/api/livez', '/api/status', '/api/version'];
  const results = [];

  for (const ep of endpoints) {
    const res = await fetchJson(ep);
    console.log(`[PROD PROBE] ${ep} -> Status ${res.status} | OK? ${res.ok}`);
    if (res.data) {
      console.log(`  Response: ${JSON.stringify(res.data)}`);
    }
    results.push({ endpoint: ep, ...res });
  }

  console.log('\n====================================================');
  return results;
}

verifyAll();
