/**
 * DIR-047 — EMPIRICAL PROOF that quoted CSP host-sources are discarded by Chromium.
 *
 * The Lead reported that `const list = values => values.map(value => `'${value}'`)` in
 * scripts/security-headers-policy.mjs wraps host origins in single quotes, and that
 * per W3C CSP L2/L3 this makes them invalid sources which Chrome/Edge discard,
 * collapsing connect-src to 'self' and breaking Firebase identitytoolkit calls.
 *
 * This does not take that on faith. It stands up TWO real local origins:
 *   - origin A serves the document under a candidate connect-src policy
 *   - origin B is the "third-party API" the document tries to reach
 * then launches real Chromium and observes whether the fetch to B is permitted.
 *
 * The same probe runs against three policies:
 *   1. quoted    -> 'http://127.0.0.1:B'      (the shipped, buggy form)
 *   2. unquoted  -> http://127.0.0.1:B       (the spec-correct form)
 *   3. selfOnly  -> (no host source at all) (control: must block)
 *
 * If quoted blocks and unquoted allows, the Lead's diagnosis is empirically confirmed
 * and the fix is justified. A probe that cannot distinguish these would be worthless.
 */
import http from 'node:http';
import { chromium } from 'playwright';

const HOST = '127.0.0.1';

function listen(handler) {
  return new Promise(resolve => {
    const server = http.createServer(handler);
    server.listen(0, HOST, () => resolve({ server, port: server.address().port }));
  });
}

const run = async () => {
  // Origin B: the third-party API the document will try to call.
  const api = await listen((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true }));
  });
  const apiUrl = `http://${HOST}:${api.port}`;

  const docHtml = csp => `<!doctype html><html><head><meta charset="utf-8"></head>
<body><div id="out">pending</div>
<script>
(async () => {
  const out = document.getElementById('out');
  try {
    const r = await fetch('${apiUrl}/probe');
    out.textContent = r.ok ? 'ALLOWED' : 'BLOCKED';
  } catch (e) { out.textContent = 'BLOCKED'; }
  document.title = 'done';
})();
<\/script></body></html>`;

  // Origin A: serves the document under whichever policy is under test.
  let active = '';
  const app = await listen((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': active });
    res.end(docHtml(active));
  });

  const browser = await chromium.launch();
  const results = {};
  try {
    for (const [name, connectSrc] of [
      ['quoted', `'self' '${apiUrl}'`],
      ['unquoted', `'self' ${apiUrl}`],
      ['selfOnly', `'self'`],
    ]) {
      // NOTE: script-src must permit the harness's own inline probe script, otherwise
      // default-src 'self' blocks it and the page never signals completion. That
      // failure is orthogonal to connect-src, which is the variable under test.
      active = `default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src ${connectSrc}`;
      const page = await browser.newPage();
      await page.goto(`http://${HOST}:${app.port}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.title === 'done', null, { timeout: 15000 });
      results[name] = await page.textContent('#out');
      await page.close();
    }
  } finally {
    await browser.close();
    api.server.close();
    app.server.close();
  }

  const line = ['quoted', 'unquoted', 'selfOnly'].map(k => `${k}=${results[k]}`).join('  ');
  console.log(`CSP connect-src probe (real Chromium) -> ${line}`);
  console.log(`RESULT: quoted=${results.quoted} unquoted=${results.unquoted} selfOnly=${results.selfOnly}`);

  if (results.quoted === 'BLOCKED' && results.unquoted === 'ALLOWED' && results.selfOnly === 'BLOCKED') {
    console.log('\nVERDICT: CONFIRMED. Quoted host-sources are discarded by Chromium.');
    console.log('The shipped connect-src is therefore equivalent to the selfOnly control,');
    console.log('which is exactly the Firebase auth/network-request-failed outage.');
    process.exit(0);
  }
  console.error('\nVERDICT: NOT CONFIRMED — quoted/unquoted behave the same; do not apply the fix on this basis.');
  process.exit(1);
};

run().catch(err => { console.error(err); process.exit(1); });