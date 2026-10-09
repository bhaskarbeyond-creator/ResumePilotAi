/**
 * DIR-063 — A4 print & overflow probe runner.
 *
 * WHY THIS EXISTS
 * ---------------
 * print-probe.mjs and overflow-probe.mjs each require an EXTERNAL lab server
 * (`LAB_BASE`, default http://127.0.0.1:3000) and a Linux Chromium
 * (`CHROMIUM_PATH`, default `/tmp/chromium-bin`). Neither was ever available here,
 * so the 55-template print/overflow verification the directive asks for had never
 * actually been executed.
 *
 * This runner starts vite IN-PROCESS via `createServer` — the same pattern
 * `visual-regression.mjs` uses — so no detached or background server is ever
 * spawned (XAMPP invariant preserved), auto-detects the local Playwright Chromium,
 * and drives both probes across the requested fixtures.
 *
 * Usage: node template-lab/run-probes.mjs [--fixtures long,extreme] [--probes print,overflow]
 */
import { createServer } from 'vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// MUST be async. execFileSync blocks the parent's event loop, and the vite server
// this runner hosts lives IN that same loop — so a synchronous child spawn makes
// the server unable to answer the child's own requests and every navigation times
// out (the exact `page.goto: Timeout 30000ms exceeded` seen on the first attempt).
const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

/** Locate the Playwright-bundled Chromium without requiring a hardcoded path. */
function findChromium() {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  const roots = [
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright'),
    path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright'),
  ];
  for (const root of roots) {
    if (!root || !fs.existsSync(root)) continue;
    const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) {
      for (const rel of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome']) {
        const exe = path.join(root, d, rel);
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  return null;
}

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const fixtures = argOf('--fixtures', 'long,extreme').split(',').map((s) => s.trim()).filter(Boolean);
const probes = argOf('--probes', 'print,overflow').split(',').map((s) => s.trim()).filter(Boolean);

const chromium = findChromium();
if (!chromium) {
  console.error('[run-probes] No Chromium found. Set CHROMIUM_PATH to a chrome.exe.');
  process.exit(2);
}
console.log(`[run-probes] Chromium: ${chromium}`);

// The probes persist their JSON here; make sure it exists or writeFileSync throws.
fs.mkdirSync(path.join(__dirname, 'evidence', 'senior'), { recursive: true });
const outDir = path.join(__dirname, 'evidence', 'dir063');
fs.mkdirSync(outDir, { recursive: true });

// IN-PROCESS vite. Closed in the finally block so it can never outlive this run.
const vite = await createServer({ root: PROJECT_ROOT, server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'error' });
const server = await vite.listen();
const port = server.config.server.port;
const base = `http://127.0.0.1:${port}`;
console.log(`[run-probes] vite in-process on ${base}`);

// WARM-UP. The FIRST request to a vite dev server triggers dependency
// pre-bundling (esbuild), which for this app can exceed the probe's navigation
// timeout and produced `page.goto: Timeout 30000ms exceeded` on every template.
// Fetch the lab page once here so the probes always hit a warm server.
try {
  const res = await fetch(`${base}/template-lab/index.html`);
  await res.text();
  console.log(`[run-probes] warm-up: HTTP ${res.status}`);
} catch (e) {
  console.warn(`[run-probes] warm-up failed: ${String(e && e.message || e)}`);
}

let failures = 0;
try {
  for (const probe of probes) {
    const script = path.join(__dirname, `${probe}-probe.mjs`);
    for (const fixture of fixtures) {
      console.log(`\n===== ${probe}-probe  fixture=${fixture} =====`);
      let out = '';
      try {
        const res = await execFileAsync(process.execPath, [script, fixture], {
          cwd: PROJECT_ROOT,
          env: { ...process.env, LAB_BASE: base, CHROMIUM_PATH: chromium },
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
        });
        out = res.stdout;
      } catch (e) {
        failures++;
        out = String((e.stdout || '') + (e.stderr || '') + (e.message || ''));
      }
      process.stdout.write(out);
      fs.writeFileSync(path.join(outDir, `${probe}-${fixture}.log`), out, 'utf8');
    }
  }
} finally {
  await server.close().catch(() => {});
}

console.log(`\n[run-probes] done. probe failures: ${failures}`);
process.exit(failures ? 1 : 0);
