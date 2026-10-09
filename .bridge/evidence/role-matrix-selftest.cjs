#!/usr/bin/env node
'use strict';
/**
 * role-matrix-selftest.cjs — proves role separation is ENFORCED, not advisory.
 *
 * Asserts: the capability matrix is complete (every tool assigned, no phantoms),
 * every forbidden pair is REJECTED, every legitimate pair is ALLOWED, the CLI
 * boundary enforces the same matrix, and every denial is audited.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const BRIDGE = 'C:\\Users\\mbhas\\.ai-bridge\\bridge.cjs';
const AW = require('C:\\Users\\mbhas\\.ai-bridge\\autowake.cjs');
const ROOT = path.join(os.tmpdir(), 'roles-e2e-' + Date.now());

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`\x1b[32m✔\x1b[0m ${name}`); }
  else { fail++; console.log(`\x1b[31m✘ ${name}\x1b[0m${detail ? '  — ' + detail : ''}`); }
}
function mcpClient(role) {
  const child = spawn(process.execPath, [BRIDGE, 'mcp'], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, AI_BRIDGE_ROLE: role, BRIDGE_NO_URI: '1' }
  });
  const pending = new Map(); let buf = '', id = 1;
  child.stdout.on('data', d => {
    buf += d.toString(); let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!l.trim()) continue;
      let m; try { m = JSON.parse(l); } catch { continue; }
      if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    }
  });
  const call = (method, params) => new Promise((res, rej) => {
    const i = id++; pending.set(i, res);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n');
    setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error('timeout ' + method)); } }, 25000);
  });
  return { call, close: () => { try { child.kill(); } catch { } } };
}
const call = (c, name, args) => c.call('tools/call', { name, arguments: args });
const asJson = r => { try { return JSON.parse(r.result.content[0].text); } catch { return null; } };
const denied = r => !!(r.result && r.result.isError) && /ROLE_FORBIDDEN|not authorized/.test(JSON.stringify(r.result));
const okCall = r => !!(r.result && r.result.isError === false);
function cli(args, role) {
  // --force isolates ROLE enforcement from the freeze/integrity guard, which is
  // the correct way to test the two independently (role checks ignore --force).
  const r = spawnSync(process.execPath, [BRIDGE, ...args, '--force'], {
    encoding: 'utf8', timeout: 60000, windowsHide: true,
    env: { ...process.env, BRIDGE_NO_URI: '1', ...(role ? { AI_BRIDGE_ROLE: role } : {}) }
  });
  return { out: (r.stdout || '') + (r.stderr || ''), code: r.status };
}

(async () => {
  console.log('\n' + '='.repeat(74));
  console.log('  ROLE MATRIX — separation-of-duties enforcement');
  console.log('='.repeat(74) + '\n');

  const lead = mcpClient('lead'), dev = mcpClient('dev');
  try {
    await lead.call('initialize', {}); await dev.call('initialize', {});
    fs.mkdirSync(ROOT, { recursive: true });
    // certify is git-gated by design (the freeze hash IS a commit hash)
    try {
      spawnSync('git', ['init'], { cwd: ROOT, windowsHide: true, encoding: 'utf8' });
      spawnSync('git', ['config', 'user.email', 'roles@bridge.local'], { cwd: ROOT, windowsHide: true, encoding: 'utf8' });
      spawnSync('git', ['config', 'user.name', 'Bridge Roles'], { cwd: ROOT, windowsHide: true, encoding: 'utf8' });
    } catch { }
    await call(lead, 'bridge_init', { projectDir: ROOT, name: 'ROLES' });
    await call(lead, 'bridge_directive_create', { title: 'role probe', spec: 's', priority: 'P2', projectDir: ROOT });

    /* ── 1. Matrix integrity ─────────────────────────────────────────────── */
    const m = asJson(await call(lead, 'bridge_roles', {}));
    check('1a bridge_roles is callable by LEAD', !!m && m.success === true, JSON.stringify(m && m.success));
    check('1b every tool is assigned to >=1 role', !!m && m.unassigned.length === 0, JSON.stringify(m && m.unassigned));
    check('1c no phantom tools in the matrix', !!m && m.phantom.length === 0, JSON.stringify(m && m.phantom));
    check('1d no role is empty', !!m && m.emptyRoles.length === 0, JSON.stringify(m && m.emptyRoles));
    check('1e all 5 roles present with capabilities', !!m && m.roles.length === 5 && m.roles.every(r => r.tools > 0));
    check('1f handoff contract is published', !!m && Array.isArray(m.handoffs) && m.handoffs.length >= 9, 'handoffs=' + (m && m.handoffs && m.handoffs.length));
    const m2 = asJson(await call(dev, 'bridge_roles', {}));
    check('1g bridge_roles is callable by DEV too', !!m2 && m2.success === true);

    /* ── 2. FORBIDDEN pairs must be REJECTED ─────────────────────────────── */
    check('2a DEV cannot create directives', denied(await call(dev, 'bridge_directive_create', { title: 'x', spec: 'y', projectDir: ROOT })));
    check('2b DEV cannot approve a plan', denied(await call(dev, 'bridge_lead_approve_plan', { directiveId: 'DIR-001', projectDir: ROOT })));
    check('2c DEV cannot certify', denied(await call(dev, 'bridge_gatekeeper_certify', { directiveId: 'DIR-001', projectDir: ROOT })));
    check('2d DEV cannot update directives', denied(await call(dev, 'bridge_directive_update', { directiveId: 'DIR-001', priority: 'P0', projectDir: ROOT })));
    check('2e DEV cannot unlock the freeze', denied(await call(dev, 'bridge_unlock', { reason: 'nope' })));
    check('2f LEAD cannot submit a dev plan', denied(await call(lead, 'bridge_dev_plan', { directiveId: 'DIR-001', summary: 'x', steps: ['a'], projectDir: ROOT })));
    check('2g LEAD cannot submit evidence', denied(await call(lead, 'bridge_dev_submit_evidence', { directiveId: 'DIR-001', summary: 'e', projectDir: ROOT })));
    check('2h LEAD cannot send a dev heartbeat', denied(await call(lead, 'bridge_dev_heartbeat', { status: 'x', projectDir: ROOT })));

    /* ── 3. LEGITIMATE pairs must be ALLOWED ─────────────────────────────── */
    check('3a LEAD can create directives', okCall(await call(lead, 'bridge_directive_create', { title: 'ok', spec: 's', priority: 'P2', projectDir: ROOT })));
    check('3b DEV can submit a plan', okCall(await call(dev, 'bridge_dev_plan', { directiveId: 'DIR-001', summary: 'p', steps: ['a'], projectDir: ROOT })));
    check('3c DEV can heartbeat', okCall(await call(dev, 'bridge_dev_heartbeat', { status: 'working', projectDir: ROOT })));
    check('3d LEAD can approve the plan', okCall(await call(lead, 'bridge_lead_approve_plan', { directiveId: 'DIR-001', projectDir: ROOT })));
    check('3e DEV can submit evidence', okCall(await call(dev, 'bridge_dev_submit_evidence', { directiveId: 'DIR-001', summary: 'e', projectDir: ROOT })));
    check('3f LEAD can review', okCall(await call(lead, 'bridge_lead_review', { directiveId: 'DIR-001', verdict: 'APPROVED', projectDir: ROOT })));
    check('3g BOTH can observe (turn)', okCall(await call(dev, 'bridge_turn', { projectDir: ROOT })) && okCall(await call(lead, 'bridge_turn', { projectDir: ROOT })));
    check('3h BOTH can use the agent transport (await)', okCall(await call(dev, 'bridge_await', { role: 'dev', timeout: 1, projectDir: ROOT })));
    check('3i LEAD can certify after review', okCall(await call(lead, 'bridge_gatekeeper_certify', { directiveId: 'DIR-001', projectDir: ROOT })));

    /* ── 4. CLI boundary enforces the SAME matrix ────────────────────────── */
    const d1 = cli(['directive', 'create', '--title', 'cli', '--spec', 's', '--projectDir', ROOT], 'dev');
    check('4a CLI as DEV cannot create a directive', d1.code !== 0 && /ROLE DENIED/.test(d1.out), d1.out.slice(0, 140));
    const d2 = cli(['dev', 'heartbeat', '--status', 'x', '--projectDir', ROOT], 'dev');
    check('4b CLI as DEV CAN heartbeat', d2.code === 0, d2.out.slice(0, 120));
    const d3 = cli(['dev', 'plan', '--directive', 'DIR-001', '--summary', 's', '--steps', 'a', '--projectDir', ROOT], 'lead');
    check('4c CLI as LEAD cannot submit a dev plan', d3.code !== 0 && /ROLE DENIED/.test(d3.out), d3.out.slice(0, 140));
    const d4 = cli(['turn', '--projectDir', ROOT], 'dev');
    check('4d CLI as DEV CAN read turn', d4.code === 0, d4.out.slice(0, 120));

    /* ── 5. Denials are audited ──────────────────────────────────────────── */
    const logs = AW.readLogs({ level: 'debug', tail: 1e9 }).entries.filter(e => e.component === 'roles');
    check('5a MCP denials logged as ROLE_DENIED', logs.some(e => e.event === 'ROLE_DENIED'), 'count=' + logs.length);
    check('5b CLI denials logged as ROLE_DENIED_CLI', logs.some(e => e.event === 'ROLE_DENIED_CLI'));
    check('5c denials record the actor + tool', logs.some(e => e.detail && e.detail.role && e.detail.tool));

    /* ── 6. LEAD TAKE-OVER POLICY (INV-28) ──────────────────────────────── */
    const t1 = asJson(await call(lead, 'bridge_lead_take_over', { reason: 'because-i-want', projectDir: ROOT }));
    check('6a bogus take-over reason is REJECTED', !t1 || !t1.success, JSON.stringify(t1).slice(0, 120));
    const t2 = asJson(await call(lead, 'bridge_lead_take_over', { reason: 'provider-failure', projectDir: ROOT }));
    check('6b provider-failure WITHOUT ledger evidence is REJECTED', !t2 || !t2.success, JSON.stringify(t2).slice(0, 140));
    const t3 = asJson(await call(lead, 'bridge_lead_take_over', { reason: 'user-requested', projectDir: ROOT }));
    check('6c user-requested WITHOUT a note is REJECTED', !t3 || !t3.success, JSON.stringify(t3).slice(0, 120));
    const t4 = asJson(await call(lead, 'bridge_lead_take_over', { reason: 'user-requested', note: 'selftest: user asked the Lead to code', projectDir: ROOT }));
    check('6d user-requested WITH a note is ALLOWED', !!(t4 && t4.success && t4.active), JSON.stringify(t4).slice(0, 140));
    check('6e take-over is recorded with reason + evidence', !!(t4 && t4.reason === 'user-requested' && t4.evidence));
    const t5 = asJson(await call(lead, 'bridge_lead_takeover_status', { projectDir: ROOT }));
    check('6f status reports the active take-over', !!(t5 && t5.active === true && t5.takeover));
    check('6g DEV cannot declare a take-over (role matrix)', denied(await call(dev, 'bridge_lead_take_over', { reason: 'user-requested', note: 'x', projectDir: ROOT })));
    const t6 = asJson(await call(lead, 'bridge_lead_take_over', { reason: 'user-requested', end: true, projectDir: ROOT }));
    check('6h take-over can be ended', !!(t6 && t6.active === false));
    const led = AW.readLogs({ level: 'debug', tail: 1e9 }).entries;
    check('6i take-over audited in the operational log', led.some(e => e.component === 'roles' && e.event === 'LEAD_TAKEOVER'));
    check('6j take-over recorded in the project ledger', (() => {
      try {
        const L = require('path').join(AW.pPaths(ROOT).ledger);
        return require('fs').readFileSync(L, 'utf8').includes('LEAD_TAKEOVER');
      } catch { return false; }
    })());

    /* ── 7. AUDIT REGRESSIONS (config safety + freeze coverage) ─────────── */
    const cfgPath = path.join(ROOT, '.bridge', 'bridge.json');
    const cfgBackup = fs.readFileSync(cfgPath, 'utf8');
    fs.writeFileSync(cfgPath, '{ corrupt', 'utf8');
    const syncRes = cli(['roles', '--sync', '--projectDir', ROOT], 'lead');
    check('7a a corrupt config is REFUSED, not silently destroyed', /UNPARSEABLE_REFUSED/.test(syncRes.out), syncRes.out.slice(0, 170));
    check('7b the corrupt config file is left byte-for-byte intact', fs.readFileSync(cfgPath, 'utf8') === '{ corrupt');
    fs.writeFileSync(cfgPath, cfgBackup, 'utf8');
    const fz = AW.freezeStatus();
    check('7c freeze manifest covers the whole core set (>=11 files)', fz.fileCount >= 11, 'fileCount=' + fz.fileCount);
    check('7d core daemons are inside the frozen set', AW.FROZEN_FILES.includes('auto_ai_router.cjs') && AW.FROZEN_FILES.includes('local_model_service.cjs') && AW.FROZEN_FILES.includes('tools/ime365_db_mcp.cjs'));
    check('7e frozen set includes both contracts', AW.FROZEN_FILES.includes('BRIDGE-PROTOCOL.md') && AW.FROZEN_FILES.includes('BRIDGE-ROLES.md'));
  } catch (e) {
    check('role-matrix harness', false, e.message);
  } finally {
    lead.close(); dev.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  }

  console.log('\n' + '-'.repeat(74));
  console.log(`  RESULT: ${pass}/${pass + fail} checks passed`);
  console.log('-'.repeat(74) + '\n');
  process.exit(fail ? 1 : 0);
})();

