#!/usr/bin/env node
/**
 * Static RBAC-matrix scanner (Wave 8).
 *
 * Walks backend/index.js and every file under backend/routes/, extracts
 * every (method, path) registration, and classifies each route as:
 *   public            – no auth middleware
 *   requireAuth       – verifyToken / authenticateRequest present
 *   requireAdmin      – requireRole('admin'|'superadmin'|...) / isAdmin check
 *   superAdminOnly    – explicit SUPER_ADMIN gate
 *
 * Emits a Markdown table + summary statistics.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(js|cjs|mjs)$/.test(entry.name)) files.push(p);
  }
}
files.push(path.join(ROOT, 'backend', 'index.js'));
walk(path.join(ROOT, 'backend', 'routes'));

const METHOD_RE = /\.(get|post|put|patch|delete|all)\s*\(\s*(['"`])([^'"`]+)\2/g;
const USE_RE = /\.use\s*\(\s*(?:(['"`])([^'"`]+)\1\s*,\s*)?([^)]+)\)/g;

const ADMIN_HINTS = /\brequire(Admin|SuperAdmin|Role|Permission|Support|Auditor)\b|\bisAdmin\b|\bADMIN\b|\bSUPER_ADMIN\b|\bhasAdminClaim\b|\bverifyAdmin\b|\badminGate\b|\brequireRole\b|\brequirePermission\b/i;
const AUTH_HINTS = /\bverifyToken\b|\bauthenticateRequest\b|\brequireAuth\b|\bauthMiddleware\b|\bwithAuth\b|\bauthenticated\b|\bcheckAuth\b/i;

const routes = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const relativeFile = path.relative(ROOT, file);
  // Extract (method, path, middleware-list) by parsing chunks after each .METHOD(...)
  const METHOD_PAT = /\.(get|post|put|patch|delete|all)\s*\(\s*(['"`])([^'"`]+)\2\s*,([\s\S]*?)\)/g;
  let m;
  while ((m = METHOD_PAT.exec(src))) {
    const method = m[1].toUpperCase();
    const p = m[3];
    const mw = m[4];
    // Heuristic: if middleware before handler mentions auth/admin words
    let classification = 'public';
    if (ADMIN_HINTS.test(mw)) classification = 'admin-gated';
    else if (AUTH_HINTS.test(mw)) classification = 'auth-required';
    routes.push({ method, path: p, classification, file: relativeFile, snippet: mw.slice(0, 120).replace(/\s+/g, ' ').trim() });
  }
}

// Also detect top-level `app.use('/prefix', middleware, router)` style
const routerMounts = [];
const idxSrc = fs.readFileSync(path.join(ROOT, 'backend', 'index.js'), 'utf8');
const MOUNT_RE = /app\.use\s*\(\s*(['"`])([^'"`]+)\1\s*,\s*([^,\)]+),?\s*([^)]*)\)/g;
let mm;
while ((mm = MOUNT_RE.exec(idxSrc))) {
  const prefix = mm[2];
  const middlewares = (mm[3] || '') + ',' + (mm[4] || '');
  if (/\b(router|subapp)\b/.test(middlewares)) {
    let cls = 'public';
    if (ADMIN_HINTS.test(middlewares)) cls = 'admin-gated';
    else if (AUTH_HINTS.test(middlewares)) cls = 'auth-required';
    routerMounts.push({ prefix, cls, middlewares: middlewares.slice(0, 160).replace(/\s+/g, ' ').trim() });
  }
}

// Roll-up statistics
const stats = { public: 0, 'auth-required': 0, 'admin-gated': 0 };
for (const r of routes) stats[r.classification] = (stats[r.classification] || 0) + 1;

// Output markdown
let md = '';
md += '# Backend RBAC Matrix — Wave 8 Forensic Scan\n\n';
md += `Scanned ${files.length} source files. Found **${routes.length} explicit route handlers** plus **${routerMounts.length} mounted router prefixes**.\n\n`;
md += '## Summary\n\n';
md += '| Classification | Count | % |\n';
md += '|---|---:|---:|\n';
for (const k of ['public', 'auth-required', 'admin-gated']) {
  const pct = routes.length ? ((stats[k] / routes.length) * 100).toFixed(1) : '0.0';
  md += `| ${k} | ${stats[k]} | ${pct}% |\n`;
}
md += '\n## Top-level Router Mounts (app.use)\n\n';
md += '| Prefix | Classification | Middleware (abbreviated) |\n|---|---|---|\n';
for (const rm of routerMounts.sort((a, b) => a.prefix.localeCompare(b.prefix))) {
  md += `| \`${rm.prefix}\` | ${rm.cls} | \`${rm.middlewares}\` |\n`;
}

md += '\n## All Route Handlers\n\n';
md += '| Method | Path | Classification | Source | Middleware (abbrev) |\n|---|---|---|---|---|\n';
routes.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
for (const r of routes) {
  md += `| ${r.method} | \`${r.path}\` | ${r.classification} | ${r.file} | \`${r.snippet}\` |\n`;
}

const outPath = path.join(ROOT, 'docs', 'forensic', 'wave8', 'BACKEND_RBAC_MATRIX.md');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md);
console.log(`Wrote ${outPath}: ${routes.length} routes, ${routerMounts.length} mounts`);
console.log('Public:', stats.public, 'Auth:', stats['auth-required'], 'Admin:', stats['admin-gated']);
