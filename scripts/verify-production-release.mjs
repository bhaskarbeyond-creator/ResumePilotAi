#!/usr/bin/env node
import fs from 'node:fs';

const expectedSha = process.argv[2] || process.env.RELEASE_SHA || '';
const baseUrl = process.argv[3] || process.env.PRODUCTION_URL || '';
const attempts = Number(process.env.VERIFY_ATTEMPTS || 12);
const delayMs = Number(process.env.VERIFY_DELAY_MS || 5000);

if (!/^[0-9a-f]{40}$/.test(expectedSha)) {
  console.error('Expected a full lowercase 40-character release SHA.');
  process.exit(2);
}

let origin;
try {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('not a plain HTTPS origin');
  }
  origin = parsed.origin;
} catch {
  console.error('Production URL must be a plain HTTPS origin, for example https://app.example.com.');
  process.exit(2);
}
if (!Number.isInteger(attempts) || attempts < 1 || attempts > 60 || !Number.isFinite(delayMs) || delayMs < 0 || delayMs > 60_000) {
  console.error('Invalid verification retry settings.');
  process.exit(2);
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function get(pathname, responseType = 'text') {
  const separator = pathname.includes('?') ? '&' : '?';
  const response = await fetch(`${origin}${pathname}${separator}release_probe=${Date.now()}`, {
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
    headers: {
      accept: responseType === 'json' ? 'application/json' : 'text/html,*/*;q=0.8',
      'cache-control': 'no-cache',
      'user-agent': 'ResumePilotReleaseVerifier/1.0',
    },
  });
  const body = await response.text();
  let json = null;
  if (responseType === 'json') {
    try { json = JSON.parse(body); } catch { /* reported by caller */ }
  }
  return { status: response.status, body, json };
}

function localEntryAsset() {
  try {
    const html = fs.readFileSync('dist/index.html', 'utf8');
    const match = html.match(/(?:src|href)=["']\/?(assets\/[^"']+\.(?:js|css))["']/);
    return match?.[1] || '';
  } catch {
    return '';
  }
}

const expectedAsset = localEntryAsset();
let last = {};
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const [health, ready, version, root, enterprise] = await Promise.all([
      get('/api/healthz', 'json'),
      get('/api/readyz', 'json'),
      get('/api/platform/version', 'json'),
      get('/'),
      get('/enterprise'),
    ]);
    const observedHealthSha = String(health.json?.commitSha || '');
    const observedVersionSha = String(version.json?.commitSha || '');
    const assetMatches = !expectedAsset || root.body.includes(expectedAsset);
    const pass = health.status === 200
      && ready.status === 200
      && ready.json?.status === 'ready'
      && version.status === 200
      && root.status === 200
      && enterprise.status === 200
      && observedHealthSha === expectedSha
      && observedVersionSha === expectedSha
      && assetMatches;
    last = {
      health: health.status,
      ready: ready.status,
      version: version.status,
      root: root.status,
      enterprise: enterprise.status,
      observedHealthSha: observedHealthSha || 'none',
      observedVersionSha: observedVersionSha || 'none',
      assetMatches,
    };
    if (pass) {
      console.log(`Production verification passed for ${expectedSha}.`);
      console.log(JSON.stringify(last));
      process.exit(0);
    }
  } catch (error) {
    last = { error: error instanceof Error ? error.message : String(error) };
  }
  if (attempt < attempts) await wait(delayMs);
}

console.error(`Production verification failed for ${expectedSha}.`);
console.error(JSON.stringify(last));
process.exit(1);
