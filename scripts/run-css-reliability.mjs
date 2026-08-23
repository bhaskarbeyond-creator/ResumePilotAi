#!/usr/bin/env node
/**
 * Turnkey runner for the browser-level CSS/asset reliability suite.
 *
 * The codebase audit could not execute this suite: the audit sandbox had no
 * Chromium binary and no access to the Playwright browser CDN. Everything the
 * suite needs is prepared here so the Local Developer runs ONE command.
 *
 *   node scripts/run-css-reliability.mjs
 *
 * It will:
 *   1. build the app if dist/ is missing or stale,
 *   2. serve dist/ with SPA fallback on an ephemeral port,
 *   3. point the Playwright suite at that server,
 *   4. shut the server down and exit with the suite's status.
 *
 * Flags:
 *   --skip-build     reuse the existing dist/
 *   --port <n>       fixed port instead of an ephemeral one
 *   --base <url>     test an already-running deployment instead of dist/
 */

import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(REPO_ROOT, 'dist');

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const value = name => {
  const index = args.indexOf(name);
  return index > -1 ? args[index + 1] : null;
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webp': 'image/webp',
};

/**
 * Mirrors the intended production cache policy so the suite exercises the real
 * thing: content-hashed assets are immutable, the document is never cached.
 * A cached index.html is the only way release-A HTML can request release-B
 * assets, which is the release-skew failure the suite checks for.
 */
function cacheHeadersFor(pathname) {
  if (/\/assets\/.+-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(pathname)) {
    return { 'Cache-Control': 'public, max-age=31536000, immutable' };
  }
  if (pathname === '/' || pathname.endsWith('.html')) {
    return { 'Cache-Control': 'no-store, must-revalidate' };
  }
  return { 'Cache-Control': 'public, max-age=3600' };
}

function serve(root) {
  return http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    let filePath = path.join(root, decodeURIComponent(url.pathname));
    if (!filePath.startsWith(root)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      const indexCandidate = path.join(filePath, 'index.html');
      // SPA fallback: unknown paths must serve index.html so deep links work.
      filePath = fs.existsSync(indexCandidate) ? indexCandidate : path.join(root, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
      response.writeHead(404).end('Not found');
      return;
    }
    const headers = {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      ...cacheHeadersFor(url.pathname),
    };
    response.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(response);
  });
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', cwd: REPO_ROOT, ...options });
  return result.status ?? 1;
}

async function main() {
  const externalBase = value('--base');
  let server = null;
  let baseUrl = externalBase;

  if (!externalBase) {
    if (!flag('--skip-build') || !fs.existsSync(path.join(DIST, 'index.html'))) {
      console.log('› Building the application…');
      const status = run('npx', ['vite', 'build']);
      if (status !== 0) {
        console.error('Build failed; aborting.');
        process.exit(status);
      }
    }
    if (!fs.existsSync(path.join(DIST, 'index.html'))) {
      console.error('dist/index.html is missing. Run `npm run build` first.');
      process.exit(1);
    }
    server = serve(DIST);
    const port = Number(value('--port') || 0);
    await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    console.log(`› Serving dist/ at ${baseUrl}`);
  } else {
    console.log(`› Testing existing deployment at ${baseUrl}`);
  }

  console.log('› Running the CSS/asset reliability suite…');
  const status = run('npx', ['playwright', 'test', 'tests/css-reliability.spec.cjs', '--config=playwright.config.js'], {
    env: { ...process.env, CSS_AUDIT_BASE_URL: baseUrl },
  });

  if (server) await new Promise(resolve => server.close(resolve));

  if (status === 0) {
    console.log('\n✓ Browser-level CSS/asset reliability suite PASSED.');
  } else {
    console.error('\n✗ Suite FAILED. The rendered result still depends on how a route was reached,');
    console.error('  or an asset/cache invariant was violated. Do not certify until this passes.');
  }
  process.exit(status);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
