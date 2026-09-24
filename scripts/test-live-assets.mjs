async function verifyAssets() {
  const base = 'https://ime365.com';
  console.log('Fetching:', base);
  const htmlRes = await fetch(base + '/');
  const html = await htmlRes.text();
  
  const regex = /(?:src|href)="([^"]+)"/g;
  let match;
  const urls = [];
  while ((match = regex.exec(html)) !== null) {
    urls.push(match[1]);
  }

  console.log(`Found ${urls.length} linked assets in HTML`);

  for (const asset of urls) {
    if (asset.startsWith('data:') || asset.startsWith('#')) continue;
    const url = asset.startsWith('http') ? asset : (asset.startsWith('/') ? base + asset : `${base}/${asset}`);
    try {
      const res = await fetch(url);
      console.log(`  [${res.status}] ${url}`);
      if (res.status >= 400) {
        throw new Error(`Asset returned status ${res.status}: ${url}`);
      }
    } catch (err) {
      console.error(`  [FAILED] ${url}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  console.log('\nAll checked assets responded successfully!');
}

verifyAssets().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
