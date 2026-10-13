/**
 * DIR-109 — Bridge extension-tooling integration:
 * Better Todo Tree + Semgrep VS Code extensions.
 *
 * The bridge now drives the two installed IDE extensions directly:
 *   - `bridge todos`  scans the workspace with the INSTALLED Better Todo Tree
 *     extension's own tags + regex (read live from its package.json), so the
 *     bridge result matches the IDE tree exactly.
 *   - `bridge semgrep` drives the INSTALLED Semgrep VS Code extension's bundled
 *     osemgrep-pro.exe engine through its native LSP protocol
 *     (initialize -> didChangeConfiguration -> semgrep/scanWorkspace ->
 *     publishDiagnostics), exactly how the extension itself scans.
 *
 * These tests pin real tool usage: extension discovery, live-default parsing,
 * tag/line/exclusion accuracy, and a genuine security finding (eval) produced
 * by the embedded 1074-rule Code ruleset. No mocks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
// HERMETIC: never touch global bridge state (registry, evidence, wake prompts).
process.env.AI_BRIDGE_HERMETIC = '1';
const BRIDGE_CLI = path.join(os.homedir(), '.ai-bridge', 'bridge.cjs');
const bridge = require(BRIDGE_CLI);

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dir109-tooling-'));
const makeTree = (files) => {
  const root = fs.mkdtempSync(path.join(tmpRoot, 'root-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
  }
  return root;
};

test.after(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { } });

// ── 1. BETTER TODO TREE ───────────────────────────────────────────────────────
test('better-todo-tree: extension discovered with live defaults', () => {
  const ext = bridge.resolveTodoTreeExtension();
  assert.ok(ext.installed, 'fanaticpythoner.better-todo-tree must be installed');
  assert.ok(String(ext.dir).includes('fanaticpythoner.better-todo-tree'), `unexpected dir: ${ext.dir}`);
  assert.ok(ext.tags.includes('TODO') && ext.tags.includes('FIXME') && ext.tags.includes('HACK'),
    'default tags must be read from the installed extension package.json');
  assert.ok(String(ext.regex).includes('$TAGS'), 'regex template must be read from the installed extension');
  assert.equal(ext.source, 'installed-extension', 'defaults must come from the installed extension, not fallbacks');
});

test('bridge todos: tags, lines, and exclusions match the IDE tree', () => {
  const root = makeTree({
    'src/a.js': '// TODO: fix this thing\nconst x = 1; // HACK fast path\n',
    'src/b.py': '# FIXME broken\n',
    'notes.md': '- [x] done\n- [ ] pending\nTODO plain line\n',
    'node_modules/pkg/index.js': '// TODO: must be ignored\n'
  });
  const res = bridge.todoScan({ root, json: true, maxFiles: 2000 });
  assert.ok(res.totalMatches > 0, 'scan must find markers');
  const byTag = {};
  for (const m of res.matches) byTag[m.tag] = (byTag[m.tag] || 0) + 1;
  assert.equal(byTag.TODO, 2, `TODO count: ${JSON.stringify(byTag)}`);
  assert.equal(byTag.HACK, 1, `HACK count: ${JSON.stringify(byTag)}`);
  assert.equal(byTag.FIXME, 1, `FIXME count: ${JSON.stringify(byTag)}`);
  assert.equal(byTag['[x]'], 1, `[x] count: ${JSON.stringify(byTag)}`);
  assert.equal(byTag['[ ]'], 1, `[ ] count: ${JSON.stringify(byTag)}`);
  assert.equal(res.matches.filter(m => m.file.includes('node_modules')).length, 0,
    'node_modules must be excluded like the IDE tree');
  const hack = res.matches.find(m => m.tag === 'HACK');
  assert.equal(hack.line, 2, 'HACK must be reported on line 2');
  const fixme = res.matches.find(m => m.tag === 'FIXME');
  assert.equal(fixme.file, 'src/b.py');
});

test('bridge todos --configure-ide: merges bridge tags without clobbering', () => {
  const root = makeTree({});
  fs.mkdirSync(path.join(root, '.vscode'), { recursive: true });
  fs.writeFileSync(path.join(root, '.vscode', 'settings.json'), JSON.stringify({ existing: true }, null, 2));
  const res = bridge.mergeTodoTreeIdeSettings({ root });
  const tags = res.changes['better-todo-tree.general.tags'];
  assert.ok(Array.isArray(tags) && tags.includes('BLOCKER') && tags.includes('TODO') && tags.includes('FIXME'),
    `bridge + extension default tags merged: ${JSON.stringify(tags)}`);
  const saved = JSON.parse(fs.readFileSync(res.settingsPath, 'utf8'));
  assert.equal(saved.existing, true, 'existing settings must be preserved');
});

// ── 2. SEMGREP ────────────────────────────────────────────────────────────────
test('semgrep: engine resolved from the installed Semgrep VS Code extension', () => {
  const sg = bridge.resolveSemgrepEngine({});
  assert.ok(sg.engine, `engine must be resolvable: ${JSON.stringify(sg)}`);
  assert.equal(sg.mode, 'lsp', 'bundled extension engine runs in LSP mode');
  assert.ok(String(sg.engine).endsWith('osemgrep-pro.exe'), `unexpected engine: ${sg.engine}`);
  assert.equal(sg.source, 'semgrep-vscode-extension');
});

test('bridge semgrep (LSP): real scan detects eval() via the embedded ruleset', { timeout: 180000 }, async () => {
  const root = makeTree({ 'app.js': 'function run(u) { eval(u); }\n' });
  const engine = bridge.resolveSemgrepEngine({}).engine;
  const res = await bridge.semgrepLspRun({ root, engine, configEntries: [], timeoutSec: 240 });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.ok(res.rulesCount > 0, `embedded ruleset must be reported (rulesCount=${res.rulesCount})`);
  assert.ok(res.findings.length >= 1, 'eval() must be flagged by the embedded Code ruleset');
  const f = res.findings.find(x => /eval/.test(x.message));
  assert.ok(f, `finding must mention eval: ${JSON.stringify(res.findings)}`);
  assert.equal(f.severity, 2, 'warning severity');
  assert.equal(f.line, 1, 'finding on line 1');
  assert.ok(f.file.endsWith('app.js'), `finding path: ${f.file}`);
});

test('bridge semgrep CLI: dispatch round-trip + evidence JSON', { timeout: 360000 }, () => {
  const root = makeTree({ 'app.js': 'function run(u) { eval(u); }\n' });
  const out = path.join(root, 'semgrep-evidence.json');
  const r = spawnSync(process.execPath, [BRIDGE_CLI, 'semgrep', '--root', root, '--out', out],
    { encoding: 'utf8', timeout: 300000, windowsHide: true });
  assert.equal(r.status, 0, `CLI exit 0; stderr tail: ${String(r.stderr || '').slice(-300)}`);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.ok(parsed.engine, 'engine path must be reported');
  assert.ok(parsed.rulesCount > 0, `rulesCount=${parsed.rulesCount}`);
  assert.ok(parsed.findings.some(f => /eval/.test(f.message)), 'eval() must be flagged end-to-end');
  assert.ok(fs.existsSync(out), 'evidence JSON must be written to --out');
  const ev = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(ev.evidenceFile, out, 'evidence manifest must reference its own path');
});

test('semgrep: --semgrep-path override pointing at a missing binary fails honestly', () => {
  const sg = bridge.resolveSemgrepEngine({ semgrepPath: 'C:\\definitely\\missing\\semgrep.exe' });
  assert.ok(!sg.engine, 'must not silently fall back to the bundled engine');
  assert.match(String(sg.error), /does not exist/);
});

test('semgrep: --semgrep-path override with an existing binary selects CLI mode', () => {
  const bundled = bridge.resolveSemgrepEngine({}).engine;
  const sg = bridge.resolveSemgrepEngine({ semgrepPath: bundled });
  assert.equal(sg.mode, 'cli');
  assert.equal(sg.engine, bundled);
  assert.equal(sg.source, 'override');
});

// ── 3. TOOLING STATUS ─────────────────────────────────────────────────────────
test('bridge tooling: both installed extensions reported', () => {
  const st = bridge.toolingStatus(tmpRoot);
  assert.equal(st.betterTodoTree.installed, true);
  assert.ok(st.betterTodoTree.version, 'todo tree version reported');
  assert.ok(st.semgrep.engine, 'semgrep engine reported');
  assert.ok(st.semgrep.version, 'semgrep engine version reported');
});

