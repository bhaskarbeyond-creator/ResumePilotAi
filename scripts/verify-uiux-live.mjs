const BASE = 'https://airesume.projectdemo.guru';

async function fetchUrl(path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const res = await fetch(url, { redirect: 'follow', ...options });
  const text = await res.text();
  return { status: res.status, url: res.url, headers: Object.fromEntries(res.headers.entries()), text };
}

async function run() {
  console.log('=== Independent Live Production Smoke Test ===\n');

  // 1. API Platform Version
  const v = await fetchUrl('/api/platform/version');
  console.log(`1. /api/platform/version: [HTTP ${v.status}]`);
  const vData = JSON.parse(v.text);
  console.log(`   commitSha: ${vData.commitSha}`);
  console.log(`   frontendBuildSha: ${vData.frontendBuildSha}`);
  console.log(`   releaseIdentity: aligned=${vData.releaseIdentity?.aligned}, verified=${vData.releaseIdentity?.verified}`);

  // 2. Healthz
  const h = await fetchUrl('/api/healthz');
  console.log(`\n2. /api/healthz: [HTTP ${h.status}]`);
  const hData = JSON.parse(h.text);
  console.log(`   status: ${hData.status}, authDb: ${hData.authoritativeDatabase}, mariadb: ${hData.databases?.mariadb?.status}`);

  // 3. Readyz
  const r = await fetchUrl('/api/readyz');
  console.log(`\n3. /api/readyz: [HTTP ${r.status}]`);
  const rData = JSON.parse(r.text);
  console.log(`   status: ${rData.status}, mysql: ${rData.checks?.mysql?.status}, schema: ${rData.checks?.schema}`);

  // 4. Live Pages
  const pages = [
    '/',
    '/login',
    '/sign-up',
    '/pricing',
    '/billing/plans',
    '/blog',
    '/blog/how-to-beat-ats-2026',
    '/portfolios',
    '/contact',
    '/features',
    '/jobs',
    '/p/privacy-policy',
    '/p/terms-of-service',
    '/p/cookie-policy'
  ];

  console.log('\n4. Live Route Probes (SPA shells & build-sha):');
  for (const page of pages) {
    const p = await fetchUrl(page);
    const hasSha = p.text.includes(vData.commitSha);
    const titleMatch = p.text.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1] : 'No Title';
    console.log(`   ${page.padEnd(30)} -> HTTP ${p.status} | SHA Match: ${hasSha} | Title: "${title}"`);
  }

  // 5. API Data endpoints
  console.log('\n5. Public API Content Endpoints:');
  const blogList = await fetchUrl('/api/public/blog/posts');
  console.log(`   /api/public/blog/posts -> HTTP ${blogList.status}`);
  if (blogList.status === 200) {
    try {
      const bData = JSON.parse(blogList.text);
      console.log(`   Blog posts count: ${bData.posts?.length || bData.data?.length || 'unknown'}`);
    } catch(e) {}
  }

  const publicPlans = await fetchUrl('/api/public/plans');
  console.log(`   /api/public/plans      -> HTTP ${publicPlans.status}`);

  const publicAvailability = await fetchUrl('/api/public/service-availability');
  console.log(`   /api/public/service-availability -> HTTP ${publicAvailability.status}`);

  console.log('\n=== Smoke Test Complete ===');
}

run().catch(err => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
