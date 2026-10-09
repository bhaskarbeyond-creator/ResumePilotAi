#!/usr/bin/env node
'use strict';
/**
 * mcp-conformance.cjs — proves the LEAD-AGENT path works over MCP stdio.
 *
 * The Lead agent drives the bridge by calling MCP tools, not the CLI. This test
 * speaks real JSON-RPC over stdio exactly as an MCP client would, and asserts
 * that a tool-driven directive creation AUTO-WAKES the developer.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const BRIDGE = 'C:\\Users\\mbhas\\.ai-bridge\\bridge.cjs';
const AW = require('C:\\Users\\mbhas\\.ai-bridge\\autowake.cjs');
const ROOT = path.join(os.tmpdir(), 'mcp-e2e-' + Date.now());

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`\x1b[32m✔\x1b[0m ${name}`); }
  else { fail++; console.log(`\x1b[31m✘ ${name}\x1b[0m${detail ? '  — ' + detail : ''}`); }
}

/** Minimal MCP client: newline-delimited JSON-RPC over stdio, id-matched. */
function mcpClient(role) {
  const child = spawn(process.execPath, [BRIDGE, 'mcp'], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, AI_BRIDGE_ROLE: role, BRIDGE_NO_URI: '1' }
  });
  const pending = new Map();
  let buf = '', nextId = 1, stderr = '';
  child.stderr.on('data', d => { stderr += d.toString(); });
  child.stdout.on('data', d => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    }
  });
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('MCP timeout: ' + method)); } }, 20000);
  });
  const notify = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  const close = () => { try { child.kill(); } catch { } };
  return { call, notify, close, stderr: () => stderr };
}

/** MCP tool results are wrapped: result.content[0].text is JSON. */
function toolJson(res) {
  try { return JSON.parse(res.result.content[0].text); } catch { return null; }
}
const devInbox = () => { try { return JSON.parse(fs.readFileSync(AW.pPaths(ROOT).devInbox, 'utf8')); } catch { return null; } };
const leadInbox = () => { try { return JSON.parse(fs.readFileSync(AW.pPaths(ROOT).leadInbox, 'utf8')); } catch { return null; } };

(async () => {
  console.log('\n' + '='.repeat(74));
  console.log('  MCP CONFORMANCE — the LEAD-AGENT path (JSON-RPC over stdio)');
  console.log('='.repeat(74) + '\n');

  const lead = mcpClient('lead');   // the Lead agent's server (role=lead)
  const dev = mcpClient('dev');     // the Developer agent's server (role=dev)
  try {
    // ── 1. Handshake ────────────────────────────────────────────────────────
    await dev.call('initialize', {});
    const init = await lead.call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'conformance', version: '1' } });
    check('1a initialize returns serverInfo', init.result && init.result.serverInfo && init.result.serverInfo.name === 'ai-bridge', JSON.stringify(init.result && init.result.serverInfo));
    check('1b server advertises tools capability', !!(init.result && init.result.capabilities && init.result.capabilities.tools));
    check('1c protocolVersion negotiated', init.result && !!init.result.protocolVersion, init.result && init.result.protocolVersion);
    lead.notify('notifications/initialized', {});

    // ── 2. Tool discovery ───────────────────────────────────────────────────
    const list = await lead.call('tools/list', {});
    const tools = (list.result && list.result.tools) || [];
    const names = tools.map(t => t.name);
    check('2a tools/list returns the tool catalogue', tools.length >= 40, 'count=' + tools.length);
    check('2b every tool has a JSON schema', tools.every(t => t.name && t.inputSchema && t.inputSchema.type === 'object'));
    check('2c LEAD tools are exposed', ['bridge_directive_create', 'bridge_lead_approve_plan', 'bridge_gatekeeper_certify', 'bridge_lead_review'].every(n => names.includes(n)), names.filter(n => n.startsWith('bridge_lead')).join(','));
    check('2d DEV tools are exposed too', ['bridge_dev_plan', 'bridge_dev_submit_evidence', 'bridge_dev_ask'].every(n => names.includes(n)));
    check('2e autonomy tools are exposed', ['bridge_turn', 'bridge_await', 'bridge_heal', 'bridge_verify', 'bridge_logs'].every(n => names.includes(n)), names.filter(n => /turn|await|heal|verify|logs/.test(n)).join(','));
  } catch (e) {
    check('MCP handshake', false, e.message);
  }

  // ── 3. Tool calls: the LEAD assigns a directive → DEV must be woken ───────
  try {
    fs.mkdirSync(ROOT, { recursive: true });
    const st0 = toolJson(await lead.call('tools/call', { name: 'bridge_status', arguments: { projectDir: ROOT } }));
    check('3a tools/call bridge_status returns live data', !!st0 && typeof st0 === 'object', JSON.stringify(st0).slice(0, 120));

    const turn0 = toolJson(await lead.call('tools/call', { name: 'bridge_turn', arguments: { projectDir: ROOT } }));
    check('3b tools/call bridge_turn works', !!turn0 && turn0.success === true, JSON.stringify(turn0).slice(0, 120));

    const initRes = toolJson(await lead.call('tools/call', { name: 'bridge_init', arguments: { projectDir: ROOT, name: 'MCP' } }));
    check('3b2 bridge_init works over MCP', !!initRes, JSON.stringify(initRes).slice(0, 140));

    const created = toolJson(await lead.call('tools/call', { name: 'bridge_directive_create', arguments: { title: 'MCP probe', spec: 'Prove the agent path', priority: 'P1', projectDir: ROOT } }));
    check('3c LEAD created a directive via MCP', !!created && created.id === 'DIR-001', JSON.stringify(created).slice(0, 140));
    const di = devInbox();
    check('3d directive creation AUTO-WOKE the developer (dev inbox written)', !!di && di.directiveId === 'DIR-001', JSON.stringify(di && di.id));

    const plan = toolJson(await dev.call('tools/call', { name: 'bridge_dev_plan', arguments: { directiveId: 'DIR-001', summary: 'p', steps: ['a', 'b'], projectDir: ROOT } }));
    check('3e dev submitted a plan via MCP', !!plan && plan.status === 'PLAN_SUBMITTED', JSON.stringify(plan && plan.status));
    const li = leadInbox();
    check('3f DEV→LEAD notification landed durably (lead inbox)', !!li, JSON.stringify(li && li.id));

    const appr = toolJson(await lead.call('tools/call', { name: 'bridge_lead_approve_plan', arguments: { directiveId: 'DIR-001', feedback: 'ok', projectDir: ROOT } }));
    check('3g LEAD approved the plan via MCP', !!appr && appr.status === 'IN_PROGRESS', JSON.stringify(appr && appr.status));
    check('3h ACT wake dispatched to the developer', (devInbox() || {}).mode === 'act');

    const proto = toolJson(await lead.call('tools/call', { name: 'bridge_protocol', arguments: {} }));
    check('3i bridge_protocol exposed over MCP', !!proto && proto.version === 'v1' && proto.invariantCount >= 25, 'invariants=' + (proto && proto.invariantCount));

    const ls = toolJson(await lead.call('tools/call', { name: 'bridge_lock_status', arguments: {} }));
    check('3j bridge_lock_status exposed over MCP', !!ls && typeof ls.locked === 'boolean');

    const lg = toolJson(await lead.call('tools/call', { name: 'bridge_logs', arguments: { summary: true } }));
    check('3k bridge_logs exposed over MCP', !!lg && typeof lg.total === 'number');

    const awaitRes = toolJson(await lead.call('tools/call', { name: 'bridge_await', arguments: { role: 'lead', timeout: 1, projectDir: ROOT } }));
    check('3l bridge_await works over MCP (timeout honoured)', !!awaitRes && typeof awaitRes.timedOut === 'boolean', JSON.stringify(awaitRes).slice(0, 120));

    // ── 4. Error semantics ─────────────────────────────────────────────────
    const unknown = await lead.call('tools/call', { name: 'bridge_nope', arguments: {} });
    check('4a unknown tool → isError', !!(unknown.result && unknown.result.isError === true), JSON.stringify(unknown.result).slice(0, 100));
    const badMethod = await lead.call('no/such/method', {});
    check('4b unknown method → JSON-RPC -32601', !!(badMethod.error && badMethod.error.code === -32601), JSON.stringify(badMethod.error));
    const badJson = await lead.call('tools/call', { name: 'bridge_unlock', arguments: {} });
    check('4c tool error surfaces as isError (unlock without reason)', !!(badJson.result && badJson.result.isError === true), JSON.stringify(badJson.result).slice(0, 120));
  } catch (e) {
    check('MCP tool calls', false, e.message);
  } finally {
    lead.close(); dev.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  }

  console.log('\n' + '-'.repeat(74));
  console.log(`  RESULT: ${pass}/${pass + fail} checks passed`);
  console.log('-'.repeat(74) + '\n');
  process.exit(fail ? 1 : 0);
})();

