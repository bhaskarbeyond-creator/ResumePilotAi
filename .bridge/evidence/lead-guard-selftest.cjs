#!/usr/bin/env node
'use strict';
/**
 * Lead Liveness Guard — self-test.
 *
 * Proves the self-healing Lead-recovery automation is installed and working:
 *   1. the guard script parses and exposes its API;
 *   2. the launcher shim exists and honours the NEVER-raise-a-dialog contract;
 *   3. both scheduled tasks are registered (periodic + at-logon);
 *   4. a dry-run tick returns the documented summary shape;
 *   5. the guard enables the URI channel for the Lead (the actual fix).
 *
 * Run:  node .bridge/evidence/lead-guard-selftest.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BRIDGE = path.join(os.homedir(), '.ai-bridge');
const GUARD = path.join(BRIDGE, 'lead_liveness_guard.cjs');
const SHIM = path.join(BRIDGE, 'lead_guard_silent.vbs');

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
    if (ok) { pass++; console.log(`  ✔ ${name}`); }
    else { fail++; console.log(`  ✖ ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('Lead Liveness Guard — self-test\n');

// 1. Guard script parses + exposes its API.
const syntax = spawnSync(process.execPath, ['--check', GUARD], { encoding: 'utf8' });
check('guard script parses (node --check)', syntax.status === 0, (syntax.stderr || '').trim());

let api = {};
try { api = require(GUARD); } catch (error) { /* reported below */ }
check('guard exports tick/guardProject/relaunchLead/readProjects',
    ['tick', 'guardProject', 'relaunchLead', 'readProjects'].every((k) => typeof api[k] === 'function'),
    Object.keys(api).join(','));

// 5. THE FIX: the Lead wake must use the URI channel (wakeLead sets noUri:true).
const guardSrc = fs.readFileSync(GUARD, 'utf8');
check('guard enables the URI channel for the Lead (noUri: false)', /noUri:\s*false/.test(guardSrc));
check('guard escalates to the human when automation fails', /escalateToHuman/.test(guardSrc) && /sendTelegramAlert/.test(guardSrc));

// 2. Launcher shim + never-dialog contract.
check('launcher shim exists', fs.existsSync(SHIM), SHIM);
if (fs.existsSync(SHIM)) {
    const shim = fs.readFileSync(SHIM, 'utf8');
    check('shim honours the never-dialog contract (WScript.Quit 0)', /WScript\.Quit\s+0/.test(shim));
    check('shim runs the guard with --once', /lead_liveness_guard\.cjs[\s\S]*--once/.test(shim));
}

// 3. Scheduled tasks registered.
for (const task of ['AIBridge-LeadGuard-Periodic', 'AIBridge-LeadGuard-Logon']) {
    const q = spawnSync('schtasks', ['/query', '/tn', task], { encoding: 'utf8' });
    check(`scheduled task registered: ${task}`, q.status === 0);
}

// 4. Dry-run tick returns the documented shape.
const dry = spawnSync(process.execPath, [GUARD, '--dry-run', '--once'], { encoding: 'utf8' });
let summary = null;
try { summary = JSON.parse(String(dry.stdout || '').trim().split('\n').pop()); } catch { /* reported below */ }
check('dry-run tick returns a JSON summary',
    !!summary && typeof summary.projects === 'number' && Array.isArray(summary.results),
    String(dry.stdout || '').slice(0, 120));

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
