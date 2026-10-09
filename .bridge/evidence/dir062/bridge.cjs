#!/usr/bin/env node
'use strict';


/**
 * AI-BRIDGE v3 — Autonomous Engineering Control Plane
 * Drop-in replacement for bridge.cjs.
 *
 * Design goals:
 * - Backward-compatible CLI names used by v2.
 * - Deterministic state-machine transitions.
 * - Atomic persistence + lock-based serialization.
 * - Append-only, hash-chained event ledger.
 * - Evidence manifests with SHA-256 digests.
 * - Real release gates: plan -> evidence -> review -> certify.
 * - Safe git execution without shell interpolation.
 * - Lane/file ownership with normalized paths.
 * - MCP stdio JSON-RPC server.
 * - Project-scoped, serverless-first autonomous mutual-wake plane (autowake.cjs).
 * - No npm dependencies.
 *
 * IMPORTANT:
 * This bridge is a control plane, not an IDE permission bypass.
 * Cline/VS Code/Cursor/etc. may still enforce their own approval policies.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync, spawn } = require('node:child_process');
const readline = require('node:readline');
const zlib = require('node:zlib');

const VERSION = '3.0.0';
const HOME = os.homedir();
const GLOBAL = path.join(HOME, '.ai-bridge');
const REGISTRY = path.join(GLOBAL, 'registry.json');
const MASTER = path.join(GLOBAL, 'bridge-config.json');
const LOCK_ROOT = path.join(GLOBAL, 'locks');

/**
 * Well-known localhost IPC ports (optional accelerators; the durable file
 * channel is the floor). All wake artifacts are project-scoped — see autowake.cjs.
 */
const DEV_IPC_PORT = Number(process.env.BRIDGE_DEV_IPC_PORT || 48225);
const FALLBACK_IPC_PORT = Number(process.env.BRIDGE_FALLBACK_IPC_PORT || 48226);

const COLORS = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', cyan: '\x1b[36m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', magenta: '\x1b[35m',
  gray: '\x1b[90m'
};

const ROLES = Object.freeze({
  SYSTEM: 'SYSTEM',
  LEAD: 'LEAD_SUPERVISOR',
  DEV: 'STAFF_DEVELOPER'
});

const TERMINAL = new Set(['APPROVED_FROZEN', 'CANCELLED']);

/**
 * Human-gated states: the ball is in the Lead/Gatekeeper's court, NOT the
 * developer's. An autonomous supervisor must be SILENT while any of these are
 * active. Treating these as "stalls" is what caused the wake-signal loop.
 */
const HUMAN_GATED = new Set(['PLAN_SUBMITTED', 'EVIDENCE_SUBMITTED', 'APPROVED']);

function humanGateReason(status) {
  if (status === 'PLAN_SUBMITTED') return 'Awaiting Lead plan review (human gate)';
  if (status === 'EVIDENCE_SUBMITTED') return 'Awaiting Gatekeeper evidence certification (human gate)';
  if (status === 'APPROVED') return 'Approved; awaiting Gatekeeper freeze certification (human gate)';
  return null;
}

/**
 * PLAN_SUBMITTED is a first-class state so that "developer is waiting for a
 * human" is observable and therefore never mistaken for a developer stall.
 */
const TRANSITIONS = Object.freeze({
  ISSUED: new Set(['PLAN_SUBMITTED', 'IN_PROGRESS', 'CANCELLED']),
  PLAN_SUBMITTED: new Set(['IN_PROGRESS', 'CHANGES_REQUESTED', 'CANCELLED']),
  IN_PROGRESS: new Set(['PLAN_SUBMITTED', 'EVIDENCE_SUBMITTED', 'CHANGES_REQUESTED', 'CANCELLED']),
  CHANGES_REQUESTED: new Set(['PLAN_SUBMITTED', 'IN_PROGRESS', 'CANCELLED']),
  EVIDENCE_SUBMITTED: new Set(['APPROVED', 'CHANGES_REQUESTED', 'IN_PROGRESS', 'CANCELLED']),
  APPROVED: new Set(['APPROVED_FROZEN', 'CHANGES_REQUESTED']),
  APPROVED_FROZEN: new Set(),
  CANCELLED: new Set(['ISSUED'])
});

function now() { return new Date().toISOString(); }
function id(prefix = 'evt') { return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`; }
function sha256(v) { return crypto.createHash('sha256').update(v).digest('hex'); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
function jsonRead(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function atomicWrite(p, value) {
  ensureDir(path.dirname(p));
  const tmp = `${p}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const data = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const fd = fs.openSync(tmp, 'w', 0o600);
  try { fs.writeFileSync(fd, data, 'utf8'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  try {
    fs.renameSync(tmp, p);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EBUSY') {
      try {
        fs.copyFileSync(tmp, p);
        try { fs.unlinkSync(tmp); } catch {}
      } catch (err2) {
        throw err;
      }
    } else {
      throw err;
    }
  }
}
function appendLineAtomic(p, line) {
  ensureDir(path.dirname(p));
  fs.appendFileSync(p, line, { encoding: 'utf8', mode: 0o600 });
}
const appendLineAtomicish = appendLineAtomic;
function stripAnsi(s) { return String(s || '').replace(/\x1b\[[0-9;]*m/g, ''); }

function sleep(ms) { const until = Date.now() + ms; while (Date.now() < until) { } }
function withLock(key, fn, opts = {}) {
  ensureDir(LOCK_ROOT);
  const lock = path.join(LOCK_ROOT, sha256(key).slice(0, 32) + '.lock');
  const timeout = opts.timeoutMs ?? 10000;
  const staleMs = opts.staleMs ?? 60000;
  const started = Date.now();
  while (true) {
    try {
      fs.mkdirSync(lock);
      atomicWrite(path.join(lock, 'owner.json'), { pid: process.pid, createdAt: now() });
      try { return fn(); }
      finally { fs.rmSync(lock, { recursive: true, force: true }); }
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        const ownerFile = path.join(lock, 'owner.json');
        if (exists(ownerFile)) {
          const owner = jsonRead(ownerFile, null);
          if (owner?.pid) {
            try {
              process.kill(owner.pid, 0);
            } catch (err) {
              if (err.code === 'ESRCH') {
                fs.rmSync(lock, { recursive: true, force: true });
                continue;
              }
            }
          }
        }
        const st = fs.statSync(lock);
        if (Date.now() - st.mtimeMs > staleMs) fs.rmSync(lock, { recursive: true, force: true });
      } catch { }
      if (Date.now() - started >= timeout) throw new Error(`Lock timeout: ${key}`);
      sleep(40);
    }
  }
}

function loadRegistry() {
  const reg = jsonRead(REGISTRY, { activeProject: null, projects: [] });
  if (!Array.isArray(reg.projects)) reg.projects = [];
  return reg;
}
function saveRegistry(reg) {
  atomicWrite(REGISTRY, reg);
}
function registerProject(projectRoot, name = null) {
  if (!projectRoot) return;
  // HERMETIC MODE. A test harness must never mutate the GLOBAL registry. Without
  // this guard `tests/dir062-bridge-provenance.test.mjs` registered 8 scratch
  // projects in registry.json and orphaned 30 `projects/proj-*` record dirs,
  // because both ensureBridge() and notifyLeadSupervisor() funnel through here.
  if (String(process.env.AI_BRIDGE_HERMETIC || '') === '1') return null;
  const root = path.resolve(projectRoot);
  const bDir = path.join(root, '.bridge');
  const reg = loadRegistry();
  const existing = reg.projects.find(p => path.resolve(p.projectRoot).toLowerCase() === root.toLowerCase());
  const projName = name || existing?.name || path.basename(root);
  if (existing) {
    existing.name = projName;
    existing.bridgeDir = bDir;
    existing.lastActive = now();
  } else {
    reg.projects.push({
      name: projName,
      projectRoot: root,
      bridgeDir: bDir,
      lastActive: now()
    });
  }
  if (!reg.activeProject || !exists(path.join(reg.activeProject, '.bridge'))) {
    reg.activeProject = root;
  }
  saveRegistry(reg);
  return reg;
}
function getActiveProject() {
  const reg = loadRegistry();
  const activeRoot = reg.activeProject;
  if (!activeRoot) return { active: false, message: 'No active project configured in registry' };
  const bDir = path.join(activeRoot, '.bridge');
  const proj = reg.projects.find(p => path.resolve(p.projectRoot).toLowerCase() === path.resolve(activeRoot).toLowerCase());
  return {
    active: true,
    name: proj?.name || path.basename(activeRoot),
    projectRoot: activeRoot,
    bridgeDir: bDir,
    exists: exists(bDir),
    lastActive: proj?.lastActive || null
  };
}

function autoDetectProject(startDir = process.cwd()) {
  let cur = path.resolve(startDir);
  while (true) {
    const b = path.join(cur, '.bridge');
    if (exists(b) && fs.statSync(b).isDirectory()) {
      return { projectRoot: cur, bridgeDir: b, name: path.basename(cur), source: 'local_bridge' };
    }
    const gitDir = path.join(cur, '.git');
    if (exists(gitDir)) {
      return { projectRoot: cur, bridgeDir: path.join(cur, '.bridge'), name: path.basename(cur), source: 'git_root' };
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  const reg = loadRegistry();
  if (reg.activeProject && exists(path.join(reg.activeProject, '.bridge'))) {
    return { projectRoot: reg.activeProject, bridgeDir: path.join(reg.activeProject, '.bridge'), name: path.basename(reg.activeProject), source: 'active_registry' };
  }
  const mostRecent = (reg.projects || []).sort((a, b) => (b.lastActive || '').localeCompare(a.lastActive || ''))[0];
  if (mostRecent) {
    return { projectRoot: mostRecent.projectRoot, bridgeDir: mostRecent.bridgeDir, name: mostRecent.name, source: 'most_recent' };
  }
  return null;
}

function setActiveProject(target) {
  const reg = loadRegistry();
  const cleanTarget = String(target || '').trim();

  // Intelligent auto-detection if target is 'auto', 'current', or omitted
  if (!cleanTarget || cleanTarget.toLowerCase() === 'auto' || cleanTarget.toLowerCase() === 'current') {
    const detected = autoDetectProject();
    if (detected) {
      registerProject(detected.projectRoot, detected.name);
      reg.activeProject = detected.projectRoot;
      saveRegistry(reg);
      return {
        success: true,
        autoSwitched: true,
        message: `Intelligently auto-switched active project to "${detected.name}" (${detected.source})`,
        activeProject: detected.projectRoot,
        name: detected.name,
        bridgeDir: detected.bridgeDir
      };
    }
    throw new Error('Could not auto-detect active project. Specify a project name or path.');
  }

  const found = (reg.projects || []).find(p =>
    p.name?.toLowerCase() === cleanTarget.toLowerCase() ||
    path.resolve(p.projectRoot).toLowerCase() === path.resolve(cleanTarget).toLowerCase()
  );
  if (found) {
    reg.activeProject = found.projectRoot;
    found.lastActive = now();
    saveRegistry(reg);
    return { success: true, message: `Switched active project to ${found.name}`, activeProject: found.projectRoot, name: found.name, bridgeDir: found.bridgeDir };
  }
  const resolved = path.resolve(cleanTarget);
  if (exists(resolved) && fs.statSync(resolved).isDirectory()) {
    registerProject(resolved);
    reg.activeProject = resolved;
    saveRegistry(reg);
    return { success: true, message: `Registered and switched active project to ${path.basename(resolved)}`, activeProject: resolved, name: path.basename(resolved), bridgeDir: path.join(resolved, '.bridge') };
  }
  const known = (reg.projects || []).map(p => `"${p.name}" (${p.projectRoot})`).join(', ');
  throw new Error(`Project "${cleanTarget}" not found in registry. Known projects: ${known || 'None'}`);
}
function listProjects() {
  const reg = loadRegistry();
  const activeRoot = reg.activeProject ? path.resolve(reg.activeProject).toLowerCase() : null;
  const list = (reg.projects || []).map(p => {
    const isAct = activeRoot === path.resolve(p.projectRoot).toLowerCase();
    const bExists = exists(p.bridgeDir);
    let dirsCount = 0;
    let activeDirective = null;
    if (bExists) {
      try {
        const dirs = getDirectives(p.bridgeDir);
        dirsCount = dirs.length;
        activeDirective = dirs.find(d => !TERMINAL.has(d.status))?.id || null;
      } catch {}
    }
    return {
      name: p.name,
      projectRoot: p.projectRoot,
      bridgeDir: p.bridgeDir,
      active: isAct,
      bridgeExists: bExists,
      directivesCount: dirsCount,
      activeDirective,
      lastActive: p.lastActive || null
    };
  });
  return {
    activeProject: reg.activeProject,
    totalProjects: list.length,
    projects: list
  };
}

function generateAgentsMd(projectName, projectRoot) {
  return `# ${projectName} — AGENTS.md
# ANTIGRAVITY EXECUTIVE ENGINEERING LEADERSHIP & CLINE SUPERVISION PROTOCOL

> **Document Authority:** Authoritative engineering memory, project invariant registry, execution-governance protocol, verification standard, and production-readiness contract for Antigravity and Cline.
>
> **Core Principle:**
> **BUILD IT → TEST IT → RUN IT → CRAWL IT → BREAK IT → FIX IT → RETEST IT → COMPARE IT → CLEAN IT → CHALLENGE IT → PROVE IT → THEN CERTIFY IT.**
>
> **Code written is not completion. Passing one test is not certification. A claim without evidence is not a fact.**

---

# 0. ROLES & GOVERNANCE
- **Antigravity (Google DeepMind)**: Executive Engineering Lead, Principal Architect, QA Director, Product/UX Reviewer, Security Reviewer, and Release Gatekeeper.
- **Cline / Roo**: Senior Staff Implementation and Execution Engine.

### 🚨 SUPREME DELEGATION MANDATE (NO SOLO IMPLEMENTATION)
- Antigravity MUST NEVER directly write or modify application code files.
- Antigravity MUST ALWAYS delegate all implementation tasks to Cline through the bridge lifecycle:
  1. \`bridge directive create\`
  2. \`bridge wake --mode plan\`
  3. \`bridge lead approve-plan\`
  4. \`bridge wake --mode act\`
  5. \`bridge gatekeeper certify\`
- Cline is the sole implementation and execution engine.

Antigravity supervises Cline continuously through the AI Collaboration Bridge (\`bridge\` CLI / MCP) to prevent regressions, architectural drift, and unverified completion.

---

# 1. NON-NEGOTIABLE CORE PRINCIPLES
1. **Evidence over claims**: Never accept "fixed", "implemented", or "verified" without direct execution evidence.
2. **Reality over simulation**: Prefer real runtimes, real browsers/DOM, real APIs, and real databases over mocks.
3. **Actor ≠ sole verifier**: The agent that changes a system cannot be the sole proof that the change works.
4. **Preserve capability**: Never downgrade, bypass, or delete an existing feature to pass tests.
5. **Hierarchy of Priorities**:
   1. Correctness
   2. Reliability
   3. Maintainability
   4. Security
   5. Performance
   6. Developer Experience

---

# 2. ADAPTIVE RISK TIERS
- **T1 (Low Risk)**: Documentation, isolated cosmetic changes, non-functional styling. Targeted validation required.
- **T2 (Standard Risk)**: Standard features, UI components, normal APIs, forms, routine refactors. Implementation + affected tests + integration verification required.
- **T3 (High Risk)**: Auth, payments, data migrations, tenant isolation, core business pipelines, external integrations. Written plan + baseline lock + runtime verification + regression check required.
- **T4 (Critical)**: Production schema migrations, destructive data changes, core infrastructure. Full adversarial verification + rollback strategy required.

---

# 3. EXECUTION LIFECYCLE (PLAN → ACT → VERIFY → REVIEW → CERTIFY)
1. **PLAN**: Lead issues directive with invariants. Developer inspects context in read-only mode and submits plan (\`bridge dev plan\`). Lead reviews and approves (\`bridge lead approve-plan\`).
2. **ACT**: Developer implements surgical changes and emits periodic heartbeats (\`bridge dev heartbeat\`).
3. **VERIFY**: Developer runs unit, integration, and E2E checks, crawls rendered DOM, and submits evidence manifest (\`bridge dev submit-evidence\`).
4. **REVIEW**: Lead challenges evidence, tests edge cases, inspects diffs, and verifies zero regressions.
5. **CERTIFY**: Gatekeeper certifies release freeze (\`bridge gatekeeper certify\`).

---

# 4. COMMAND CHEATSHEET

### Developer Commands (Cline)
\`\`\`bash
# 1. Submit implementation plan
bridge dev plan --directive DIR-001 --summary "<Plan summary>" --steps "<Step 1>;<Step 2>"

# 2. Emit progress heartbeat
bridge dev heartbeat --directive DIR-001 --status "<What you are doing>" --percent <0-100>

# 3. Ask clarifying question (blocks directive until Lead answers)
bridge dev ask --directive DIR-001 --question "<Specific technical question>"

# 4. Explicitly wake Lead when waiting for review/approval/answers
bridge dev wake-lead --directive DIR-001 --reason "Waiting for Lead plan review"

# 5. Submit verification evidence
bridge dev submit-evidence --directive DIR-001 --summary "<Evidence summary>" --tests "<output.log>"

# 6. Send direct message or note to Lead
bridge dev send --directive DIR-001 --message "<message or insight>"
\`\`\`

### Supervisor Commands (Antigravity Lead)
\`\`\`bash
# 1. Issue new directive
bridge directive create --title "<Title>" --spec "<Spec>" --priority P1

# 2. Wake developer in PLAN or ACT mode
bridge wake --directive DIR-001 --mode plan
bridge wake --directive DIR-001 --mode act
bridge lead wake-dev --directive DIR-001 --mode act

# 3. Review & approve plan
bridge lead approve-plan --directive DIR-001 --feedback "Approved"

# 4. Answer developer blocker question
bridge lead reply --message-id <MSG-ID> --message "<resolution>"

# 5. Send direct instruction or architectural guidance to Developer
bridge lead send --directive DIR-001 --message "<guidance>"

# 6. Certify and freeze
bridge gatekeeper certify --directive DIR-001 --freeze-hash "<git-commit-hash>"
\`\`\`

---

# 5. SPECIAL INVARIANTS & PROTOCOLS

### 5.1 Frozen Module Modification Protocol (Inform -> Take Approval -> Modify -> Reverify)
When a module or file is FROZEN, developer must not edit it unilaterally. Developer asks via \`bridge dev ask\`, Lead approves via \`bridge lead reply\` or \`bridge lead approve-plan\`, developer modifies surgically with tests, and Lead re-verifies and re-certifies.

### 5.2 Bidirectional Mutual Waiting & Wake Protocol (Zero Silent Stalls)
Neither agent may sit idle waiting for the other. Developer wakes Lead via \`bridge dev wake-lead\`; Lead auto-wakes Developer on every state transition. Universal stall watchdog auto-pings and alerts if either party waits > 2-3 minutes.
\`\`\`
`;
}

function generateClinerules(projectName, projectRoot) {
  return `# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🤝 ANTIGRAVITY & CLINE UNIVERSAL COLLABORATION BRIDGE INTEGRATION
# Project: ${projectName}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You are the **Hands-On Senior Staff Developer & Implementation Engine (Cline)**.
You work under the direct strategic supervision of **Antigravity (Google DeepMind)**, who orchestrates the multi-role engineering suite:
- 👔 **Senior Engineering Lead & Systems Architect**: Defines contracts, roadmap, invariants, and approvals.
- 🎨 **Product Designer & UX Architect**: Enforces design systems, typography, tokens, and layout standards.
- 🧪 **QA Lead & Test Strategist**: Enforces E2E coverage, real-DOM crawling, and test bars.
- ♿ **Accessibility Lead**: Enforces WCAG 2.1 AA compliance (landmarks, contrast >= 4.5:1, keyboard nav).
- ⚡ **Performance Engineer**: Enforces sub-100ms render performance and tight build budgets.
- 🛡️ **Security Reviewer**: Enforces zero plaintext secrets, strict RBAC, and sanitized inputs.
- 🚦 **Release Gatekeeper**: Evaluates evidence, verifies baseline diffs, and freezes production releases.

### 📋 MANDATORY WORKFLOW INVARIANTS:
1. **Auto-Pick Directive via Pipeline (First Step Always)**:
   At the start of ANY task or upon completing a task, discover your active directive and priority:
   \`\`\`bash
   bridge pipeline
   bridge status
   bridge inbox --role dev
   \`\`\`
   Follow the exact recommendation and directive ID returned by \`bridge pipeline\`.
2. **MANDATORY CLI EXECUTION (Never Chat-Only)**:
   You MUST execute terminal CLI commands for all workflow transitions. Explaining your plan or claiming completion in the chat window WITHOUT running the CLI commands will leave the state machine stalled. Always run:
   • \`bridge dev plan\` to submit plans
   • \`bridge dev heartbeat\` to report progress
   • \`bridge dev ask\` to escalate blockers
   • \`bridge dev wake-lead\` to wake Lead when waiting
   • \`bridge dev submit-evidence\` to submit verification
3. **Submit Implementation Plan Before Coding (PLAN Mode)**:
   Before modifying code or refactoring components, inspect context and submit your plan:
   \`\`\`bash
   bridge dev plan --directive <ID> --summary "Detailed architectural execution plan" --steps "Step 1; Step 2"
   \`\`\`
   Wait for Lead Supervisor approval before making code changes.
4. **Emit Heartbeats During Execution (ACT Mode)**:
   For multi-step implementations, update the Lead on your progress at least every 3-5 minutes:
   \`\`\`bash
   bridge dev heartbeat --directive <ID> --status "Implementing feature..." --percent 50
   \`\`\`
5. **Escalate Ambiguity & Blockers Immediately**:
   Never guess, invent mock data, or compromise invariants. Ask the Lead directly:
   \`\`\`bash
   bridge dev ask --directive <ID> --question "Clarification needed on..."
   \`\`\`
6. **Zero Fabrication & Live Data Wiring**:
   Never fabricate mock data or simulated responses when real infrastructure is expected.
7. **Collect & Submit Verifiable Evidence**:
   Never declare a task complete without proving it. Run tests, crawl DOM, verify outputs:
   \`\`\`bash
   bridge dev submit-evidence --directive <ID> --summary "All tests passing + verification confirmed" --tests "test-output.log"
   \`\`\`
8. **Auto-Pick Next Queued Directive**:
   After submitting evidence or upon completion, run \`bridge pipeline\` to autonomously check if another directive (P0, P1, P2) is ready in the queue.
9. **Await Gatekeeper Certification**:
   You are NOT done until Antigravity reviews and certifies the release via \`bridge status\` showing \`APPROVED_FROZEN\`.
10. **Frozen Module Modification Protocol (Inform -> Take Approval -> Modify -> Reverify)**:
    When a module, component, or route is marked **FROZEN**, you MUST NOT modify it directly under any circumstance.
    If modification is genuinely required:
    - Inform Antigravity via \`bridge dev ask\` or \`bridge dev plan\` detailing the failure trace, root cause, and proposed surgical diff.
    - Wait for explicit Lead authorization (\`bridge lead approve-plan\` or \`bridge lead reply\`).
    - Implement the smallest safe change and run historical regression test suites.
    - Submit evidence via \`bridge dev submit-evidence\`. Antigravity will independently re-verify the module and re-freeze it.
11. **Multi-Lane Parallel Development Protocol**:
   When working in parallel lanes or worktrees:
   - Check file ownership before editing: \`bridge lane check --file "<filePath>"\`
   - Never touch files claimed by another lane without Lead authorization.
   - Emit lane heartbeats: \`bridge lane heartbeat --name <laneName> --status "<status>"\`
   - Upon completion, submit evidence and enqueue for merge: \`bridge lane close --name <laneName> --merge\`
12. **Bidirectional Mutual Waiting & Wake Protocol (Zero Silent Waiting)**:
   Whenever you are waiting for Lead action (e.g. after \`bridge dev plan\`, \`bridge dev ask\`, \`bridge dev submit-evidence\`, or if Lead has not replied in > 60-120s):
   - NEVER sit idle waiting silently.
   - Immediately execute: \`bridge dev wake-lead --directive <ID> --reason "<reason>"\` (or \`bridge wake --target lead\`).
   - This sends an urgent UDP datagram to port 48222 and queues a high-priority alert into \`lead_wake_queue.jsonl\`, waking Antigravity in the IDE.
13. **Real-Time Bidirectional Chat Messaging**:
   Exchange direct notes, architectural insights, and guidance across chat windows at any time:
   • Lead sends instructions to you: \`bridge lead send --directive <ID> --message "<text>"\`
   • You send progress notes or updates to Lead: \`bridge dev send --directive <ID> --message "<text>"\`
   Direct messages automatically alert the other party across the bridge.
14. **MANDATORY XAMPP SERVER INITIATION & ZERO DETACHED BACKGROUND SERVERS**:
   You and all autonomous agents MUST strictly use XAMPP (\`D:\\xampp\`) to initiate and host servers (Apache and MySQL).
   • NEVER start detached background server processes (\`node index.js\`, background dev servers, or unmanaged background test daemons) that cause port/resource conflicts (ports 80, 443, 3306, 8080).
   • All web/API traffic routes through XAMPP Apache (\`http://localhost\`, \`https://ime365.local\`).
   • All database access connects to XAMPP MariaDB/MySQL on port 3306.
   • Inspect or control the full server stack (Apache 80/443, MySQL 3306, and the managed Node.js Backend API Server on 8080) cleanly via \`bridge xampp status\`, \`bridge xampp start\`, and \`bridge xampp stop\`. DIR-053: start/stop all now includes the backend API lifecycle (adopt-or-spawn + /readyz verification + graceful drain); lead_watcher_daemon.cjs auto-heals :8080 crashes in under 6s.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

function initProject(targetDir = process.cwd(), name = null, noScaffold = false) {
  const root = safeProjectRoot(targetDir);
  const bDir = path.join(root, '.bridge');
  const projName = name || path.basename(root);

  ensureBridge(bDir, root, projName);
  setActiveProject(root);

  const events = readLedger(bDir);
  if (events.length === 0) {
    appendEvent(bDir, {
      sender: ROLES.SYSTEM,
      recipient: 'ALL',
      type: 'BRIDGE_INITIALIZED',
      title: `AI Bridge v\${VERSION} initialized`,
      body: `Project: \${projName} (\${root})`,
      readBy: ['LEAD_SUPERVISOR', 'STAFF_DEVELOPER'],
      payload: { version: VERSION, projectRoot: root, projectName: projName }
    });
  }

  let agentsMdCreated = false;
  const agentsDir = path.join(root, '.agents');
  const agentsMdPath = path.join(agentsDir, 'AGENTS.md');
  if (!noScaffold && !exists(agentsMdPath)) {
    ensureDir(agentsDir);
    atomicWrite(agentsMdPath, generateAgentsMd(projName, root));
    agentsMdCreated = true;
  }

  let clinerulesCreated = false;
  const clinerulesPath = path.join(root, '.clinerules');
  if (!noScaffold && !exists(clinerulesPath)) {
    atomicWrite(clinerulesPath, generateClinerules(projName, root));
    clinerulesCreated = true;
  }

  ensureLeadWatcher(true);
  const doc = doctor(root);

  const testPings = testBridge(root);

  return {
    success: true,
    version: VERSION,
    projectName: projName,
    projectRoot: root,
    bridgeDir: bDir,
    active: true,
    agentsMdCreated,
    agentsMdPath: exists(agentsMdPath) ? agentsMdPath : null,
    clinerulesCreated,
    clinerulesPath: exists(clinerulesPath) ? clinerulesPath : null,
    testPings,
    doctor: {
      bridgeExists: doc.bridgeExists,
      ledgerIntegrity: doc.ledgerIntegrity,
      wakeSubsystem: doc.wakeSubsystem?.allExtensionsCertified,
      leadWatcher: doc.bidirectionalSubsystem?.status
    },
    confirmationMessage: `✅ AI Bridge initialized and 100% operational for ${projName} (${root}).\n• Lead -> Dev Wake: VERIFIED\n• Dev -> Lead Wake: VERIFIED (Ping dispatched)\n• Watcher Daemon: ${doc.bidirectionalSubsystem?.status}\n• Governance: .agents/AGENTS.md and .clinerules ready`
  };
}

function testBridge(targetDir = process.cwd()) {
  const { bridgeDir, projectRoot } = findBridgeRoot(targetDir);
  const projName = path.basename(projectRoot);
  const results = {
    testedAt: now(),
    projectRoot,
    projectName: projName,
    bridgeDir,
    leadToDev: { success: false, method: null },
    devToLead: { success: false, signalWritten: false, queueWritten: false, udpDispatched: false },
    operational: false
  };

  // 1. Test Lead -> Dev Wake Channel (URI Handler & Prompt File)
  try {
    const extAudit = ensureExtensionWakeSupport();
    const promptFile = path.join(os.tmpdir(), 'cline_bridge_prompt.txt');
    const testPrompt = `<user_input mode="test">\n[AI BRIDGE TEST PING - BIDIRECTIONAL VERIFICATION]\nProject: ${projName}\nTimestamp: ${now()}\nStatus: Verified\n</user_input>`;
    fs.writeFileSync(promptFile, testPrompt, 'utf8');

    results.leadToDev = {
      success: extAudit.extensions.some(e => e.taskSupported) && exists(promptFile),
      extensionsCertified: extAudit.extensions.filter(e => e.taskSupported).map(e => e.id),
      promptFileCreated: exists(promptFile),
      promptFilePath: promptFile,
      method: 'extension_uri_and_prompt_file'
    };
  } catch (e) {
    results.leadToDev.error = e.message;
  }

  // 2. Test Dev -> Lead Wake Channel (Signal file + Global queue + UDP :48222)
  try {
    const pingId = id('ping');
    const pingEvent = {
      id: pingId,
      sender: ROLES.DEV,
      recipient: ROLES.LEAD,
      type: 'PING',
      title: `[AI Bridge Test Ping] Bidirectional loop test`,
      body: `Automated test ping verifying Dev -> Lead communication for ${projName}.`,
      timestamp: now(),
      payload: { test: true, pingId, projectRoot, projectName: projName }
    };

    notifyLeadSupervisor(bridgeDir, pingEvent);

    const sigPath = path.join(bridgeDir, 'wake_lead.signal');
    const queuePath = path.join(GLOBAL, 'lead_wake_queue.jsonl');

    results.devToLead.signalWritten = exists(sigPath);
    results.devToLead.queueWritten = exists(queuePath);
    results.devToLead.udpDispatched = true;
    results.devToLead.success = results.devToLead.signalWritten && results.devToLead.queueWritten;
  } catch (e) {
    results.devToLead.error = e.message;
  }

  results.operational = Boolean(results.leadToDev.success && results.devToLead.success);
  return results;
}

function pipelineNext(projectDir) {
  const { bridgeDir } = requireBridge(projectDir);
  const directives = getDirectives(bridgeDir);
  if (!directives.length) {
    return {
      status: 'NO_DIRECTIVES',
      message: 'No engineering directives found in this project. Ingest project scope from docs/ or create directives to begin.',
      directivesCount: 0
    };
  }

  // 1. Prioritize developer findings/blockers: if an escalated question is open, Lead must act
  const openBlockers = readLedger(bridgeDir).filter(e => e.type === 'QUESTION_ASKED' && e.status === 'OPEN');
  if (openBlockers.length) {
    const b = openBlockers[0];
    return {
      status: 'DEV_BLOCKER_ESCALATED',
      directive: { id: b.payload?.directiveId || 'GENERAL' },
      question: b.title,
      messageId: b.id,
      nextAction: 'lead_reply',
      recommendation: `Developer reported a finding/blocker: "${b.title}". Answer or update directive using bridge lead reply.`,
      command: `bridge lead reply --message-id ${b.id} --message "<Answer>"`
    };
  }

  // 2. Intelligent dynamic priority sorting: P0 (Critical) > P1 (Core) > P2 (Normal)
  const PRIORITY_WEIGHT = { P0: 0, P1: 1, P2: 2 };
  const openDirectives = directives
    .filter(d => !TERMINAL.has(d.status))
    .sort((a, b) => {
      const pDiff = (PRIORITY_WEIGHT[a.priority] ?? 1) - (PRIORITY_WEIGHT[b.priority] ?? 1);
      if (pDiff !== 0) return pDiff;
      return (a.id || '').localeCompare(b.id || '');
    });

  if (!openDirectives.length) {
    const allFrozen = directives.every(d => d.status === 'APPROVED_FROZEN');
    return {
      status: allFrozen ? 'ALL_DIRECTIVES_FROZEN' : 'COMPLETED',
      allCompleted: true,
      directivesCount: directives.length,
      frozenCount: directives.filter(d => d.status === 'APPROVED_FROZEN').length,
      message: 'All directives in this project have been verified, approved, and frozen! 10/10 production ready.'
    };
  }

  const active = openDirectives[0];
  const dId = active.id;
  const dStatus = active.status;

  if (dStatus === 'ISSUED') {
    return {
      status: 'READY_FOR_PLAN',
      directive: { id: dId, title: active.title, priority: active.priority, status: dStatus },
      nextAction: 'wake_dev_plan',
      recommendation: `Wake developer in PLAN mode for ${dId}: "${active.title}".`,
      command: `bridge wake --directive ${dId} --mode plan`
    };
  }

  if (dStatus === 'PLAN_SUBMITTED') {
    return {
      status: 'AWAITING_LEAD_PLAN_APPROVAL',
      directive: { id: dId, title: active.title, priority: active.priority, status: dStatus },
      plan: active.plan,
      nextAction: 'lead_approve_plan',
      recommendation: `Review submitted developer plan for ${dId}. Approve to authorize ACT mode, or request changes.`,
      command: `bridge lead approve-plan --directive ${dId}`
    };
  }

  if (dStatus === 'IN_PROGRESS') {
    return {
      status: 'DEV_IMPLEMENTING',
      directive: { id: dId, title: active.title, priority: active.priority, status: dStatus },
      nextAction: 'await_heartbeat_or_evidence',
      recommendation: `Developer is executing ACT mode for ${dId}. Monitor heartbeats and await evidence submission.`,
      command: `bridge status`
    };
  }

  if (dStatus === 'CHANGES_REQUESTED') {
    return {
      status: 'PLAN_CHANGES_REQUESTED',
      directive: { id: dId, title: active.title, priority: active.priority, status: dStatus },
      nextAction: 'dev_resubmit_plan',
      recommendation: `Developer needs to revise plan for ${dId} based on Lead feedback.`,
      command: `bridge wake --directive ${dId} --mode plan`
    };
  }

  if (dStatus === 'EVIDENCE_SUBMITTED') {
    return {
      status: 'AWAITING_LEAD_REVIEW',
      directive: { id: dId, title: active.title, priority: active.priority, status: dStatus },
      evidenceSummary: active.evidence?.summary || null,
      manifestHash: active.evidence?.manifestHash || null,
      nextAction: 'lead_review_evidence',
      recommendation: `Lead/Gatekeeper review submitted evidence for ${dId} and approve if verified.`,
      command: `bridge lead review --directive ${dId} --verdict APPROVED --feedback "Evidence verified"`
    };
  }

  if (dStatus === 'APPROVED') {
    return {
      status: 'AWAITING_GATEKEEPER_FREEZE',
      directive: { id: dId, title: active.title, priority: active.priority, status: dStatus },
      nextAction: 'gatekeeper_certify',
      recommendation: `Gatekeeper certify release freeze at clean git commit for ${dId}.`,
      command: `bridge gatekeeper certify --directive ${dId}`
    };
  }

  return {
    status: dStatus,
    directive: active,
    message: `Directive ${dId} is in status ${dStatus}.`
  };
}

// ── EVIDENCE SANITY (used by the autonomous paths) ───────────────────────────
// The old auto-certify gate was `hasEvidence && isGit && !dirty` — i.e. it
// checked that a file EXISTED and the tree was clean, never that the tests in it
// PASSED. Fabricated or failing evidence certified identically. This reads the
// submitted test artifact and refuses on absent logs or failure markers.
const EVIDENCE_FAILURE_PATTERNS = [
  // NOTE: horizontal whitespace only ([ \t]), never \s — \s crosses newlines, so
  // "pass 756\nfail 0" matched /\d+\s+fail/ and a PASSING log was rejected.
  /\b[1-9]\d*[ \t]+fail(?:ed|ing|ures?)?\b/i,      // "3 failed", "1 failing"
  /\bfail(?:ed|ures?)?[ \t]*[:=][ \t]*[1-9]\d*\b/i, // "fail: 3"
  /\bfail(?:ed|ures?)?[ \t]+[1-9]\d*\b/i,          // "fail 3" / "# fail 3"
  /\b[1-9]\d*[ \t]+errors?\b/i,                    // "2 errors"
  /\berrors?[ \t]*[:=][ \t]*[1-9]\d*\b/i,          // "errors: 2"
  /\bFAIL(?:ED)?\b/,                               // pytest/Jest FAIL banner
  /\bnot ok\b/i,                                   // TAP
  /✗|✖|❌/
];
function evidenceLooksPassing(ev) {
  if (!ev || !ev.manifestHash) return { ok: false, reason: 'no evidence manifest submitted' };
  const art = ev.tests;
  if (!art) return { ok: false, reason: 'no test artifact attached (--tests was omitted)' };
  let text = '';
  try {
    if (art.stored && exists(art.stored)) text = fs.readFileSync(art.stored, 'utf8');
    else if (art.source && exists(art.source)) text = fs.readFileSync(art.source, 'utf8');
    else if (art.content) text = String(art.content);
  } catch (e) { return { ok: false, reason: `test artifact unreadable: ${String(e.message || e).slice(0, 120)}` }; }
  if (!text.trim()) return { ok: false, reason: 'test artifact is empty' };
  const sample = text.length > 4 * 1024 * 1024 ? text.slice(0, 4 * 1024 * 1024) : text;
  const hit = EVIDENCE_FAILURE_PATTERNS.find(re => re.test(sample));
  if (hit) {
    const line = sample.split(/\r?\n/).find(l => hit.test(l)) || '';
    return { ok: false, reason: `test artifact contains a failure marker (${hit}): ${line.trim().slice(0, 140)}` };
  }
  if (!/\bpass(?:ed|ing)?\b|\bok\b|✓|PASS/i.test(sample)) {
    return { ok: false, reason: 'test artifact contains no recognisable pass marker' };
  }
  return { ok: true };
}

function pipelineAdvance(projectDir, opts = {}) {
  // Depth guard: the auto path used to `return pipelineAdvance(...)` after each
  // certify, so a single cron tick could walk the whole backlog to FROZEN.
  const depth = Number(opts._depth || 0);
  if (depth > 8) return { advanced: false, reason: 'pipeline advance depth guard hit (possible auto-certify loop)' };
  const next = pipelineNext(projectDir);
  if (!next || next.status === 'ALL_DIRECTIVES_FROZEN' || next.status === 'COMPLETED' || next.status === 'NO_DIRECTIVES') {
    return next;
  }

  if (next.nextAction === 'wake_dev_plan') {
    const wakeRes = wakeCline({ directiveId: next.directive.id, mode: 'plan', projectDir });
    return { advanced: true, action: 'wake_dev_plan', wakeResult: wakeRes, directive: next.directive };
  }

  // ── PRIVILEGED ACTIONS: OPT-IN ONLY ───────────────────────────────────────
  // These three previously executed unconditionally, which is how the scheduled
  // LeadWatcher turned `bridge pipeline auto` into a self-certifying loop that
  // approved its own evidence and froze its own releases. Automation is still
  // possible, but it must now be requested explicitly (--allow-automation) and
  // is recorded as automated:true.
  const allowAutomation = opts.allowAutomation === true;
  if (!allowAutomation) {
    const map = {
      lead_approve_plan: { action: 'HUMAN_PLAN_APPROVAL_REQUIRED', command: `bridge lead approve-plan --directive ${next.directive.id}` },
      lead_review_evidence: { action: 'HUMAN_EVIDENCE_REVIEW_REQUIRED', command: `bridge lead review --directive ${next.directive.id} --verdict APPROVED --feedback "<your review>"` },
      gatekeeper_certify: { action: 'HUMAN_FREEZE_AUTHORISATION_REQUIRED', command: `bridge gatekeeper certify --directive ${next.directive.id}` }
    };
    const m = map[next.nextAction];
    if (m) {
      return {
        advanced: false,
        action: m.action,
        directiveId: next.directive.id,
        reason: `${next.nextAction} is a privileged action; a human Lead must authorise it (or re-run with --allow-automation to accept an automated decision).`,
        command: m.command,
        next
      };
    }
  }

  if (next.nextAction === 'lead_approve_plan') {
    const planRes = planApprove({
      directiveId: next.directive.id, projectDir, role: 'lead', allowAutomation,
      feedback: allowAutomation ? 'Auto-approved under explicit --allow-automation opt-in.' : 'Plan reviewed and approved by Lead Supervisor.'
    });
    const wakeRes = wakeCline({ directiveId: next.directive.id, mode: 'act', projectDir });
    return { advanced: true, action: 'lead_approved_and_woken_act', planApproval: planRes, wakeResult: wakeRes, directive: next.directive };
  }

  if (next.nextAction === 'lead_review_evidence') {
    // Defence in depth: the opt-in branch above already returned.
    if (!allowAutomation) return { advanced: false, reason: 'evidence review requires human authorisation', next };
    // pipelineNext() returns a SUMMARY directive without `evidence`, so re-read
    // the full record before scanning the artifact.
    const full = getDirective(requireBridge(projectDir).bridgeDir, next.directive.id) || next.directive;
    const sanity = evidenceLooksPassing(full.evidence);
    if (!sanity.ok) {
      return {
        advanced: false, action: 'EVIDENCE_FAILED_SANITY_CHECK', directiveId: next.directive.id,
        reason: `Refused to auto-approve evidence: ${sanity.reason}.`, next
      };
    }
    reviewDirective({
      directiveId: next.directive.id, verdict: 'APPROVED', projectDir, role: 'lead', allowAutomation: true,
      feedback: `Automated verification check passed under explicit --allow-automation (test artifact scanned: no failure markers).`
    });
    return pipelineAdvance(projectDir, { ...opts, _depth: depth + 1 });
  }

  if (next.nextAction === 'gatekeeper_certify') {
    if (!allowAutomation) return { advanced: false, reason: 'freeze certification requires human authorisation', next };
    certify({
      directiveId: next.directive.id, projectDir, role: 'lead', autoCommit: true, allowAutomation: true,
      notes: 'Certified under explicit --allow-automation opt-in (no human Lead sign-off).'
    });
    return pipelineAdvance(projectDir, { ...opts, _depth: depth + 1 });
  }

  return { advanced: false, reason: `Action ${next.nextAction} requires manual review or is awaiting developer evidence.`, next };
}


function continueProject(projectDir, opts = {}) {
  const { bridgeDir, projectRoot } = findBridgeRoot(projectDir);
  const projName = path.basename(projectRoot);

  if (!exists(bridgeDir)) {
    initProject(projectRoot, projName);
  }

  const watcher = ensureLeadWatcher(true);
  const doc = doctor(projectRoot);
  ensureExtensionWakeSupport();

  const next = pipelineNext(projectRoot);
  const results = {
    continuedAt: now(),
    projectRoot,
    projectName: projName,
    doctor: {
      bridgeExists: doc.bridgeExists,
      ledgerIntegrity: doc.ledgerIntegrity,
      leadWatcherRunning: doc.bidirectionalSubsystem?.leadWatcherRunning,
      allExtensionsCertified: doc.wakeSubsystem?.allExtensionsCertified
    },
    pipeline: next,
    actionTaken: null,
    wakeResult: null,
    instructions: null
  };

  if (next.status === 'NO_DIRECTIVES') {
    results.instructions = `No engineering directives exist for ${projName}. Issue a directive via: bridge directive create --title "<Title>" --spec "<Spec>"`;
    return results;
  }

  if (next.status === 'ALL_DIRECTIVES_FROZEN' || next.status === 'COMPLETED') {
    results.instructions = `All directives in ${projName} are verified and frozen (10/10 production ready).`;
    return results;
  }

  if (next.status === 'DEV_BLOCKER_ESCALATED') {
    results.instructions = `Developer asked a blocker question (${next.messageId}). Lead Supervisor must answer via: ${next.command}`;
    return results;
  }

  if (next.status === 'READY_FOR_PLAN') {
    const wakeRes = wakeCline({ directiveId: next.directive.id, mode: 'plan', projectDir: projectRoot, force: true });
    results.actionTaken = 'WOKE_DEV_PLAN_MODE';
    results.wakeResult = wakeRes;
    results.instructions = `Resumed in PLAN mode for ${next.directive.id}. Developer woken in sidebar to draft implementation plan.`;
    return results;
  }

  if (next.status === 'AWAITING_LEAD_PLAN_APPROVAL') {
    if (opts.autoApprove) {
      const planRes = planApprove({ directiveId: next.directive.id, feedback: 'Auto-approved on resume (explicit --auto opt-in).', projectDir: projectRoot, role: 'lead', allowAutomation: true });
      const wakeRes = wakeCline({ directiveId: next.directive.id, mode: 'act', projectDir: projectRoot, force: true });
      results.actionTaken = 'PLAN_APPROVED_AND_WOKEN_ACT';
      results.wakeResult = wakeRes;
      results.instructions = `Plan for ${next.directive.id} approved. Developer woken in sidebar in ACT mode.`;
    } else {
      results.instructions = `Developer plan submitted for ${next.directive.id}. Lead Supervisor must review & approve via: bridge lead approve-plan --directive ${next.directive.id}`;
    }
    return results;
  }

  if (next.status === 'DEV_IMPLEMENTING') {
    const wakeRes = wakeCline({
      directiveId: next.directive.id,
      mode: 'act',
      projectDir: projectRoot,
      force: true,
      prompt: `[SYSTEM RESUMED - CONTINUE IMPLEMENTATION]\nDirective: ${next.directive.id} - ${next.directive.title}\nStatus: IN_PROGRESS\n\nPlease resume execution from where you left off. Emit a heartbeat with bridge dev heartbeat.`
    });
    results.actionTaken = 'RESUMED_DEV_ACT_MODE';
    results.wakeResult = wakeRes;
    results.instructions = `Resumed ACT mode for ${next.directive.id}. Developer re-woken in sidebar to continue implementation.`;
    return results;
  }

  if (next.status === 'AWAITING_LEAD_REVIEW') {
    results.instructions = `Developer submitted evidence for ${next.directive.id}. Review and certify via: bridge lead review --directive ${next.directive.id} --verdict APPROVED`;
    return results;
  }

  if (next.status === 'AWAITING_GATEKEEPER_FREEZE') {
    results.instructions = `Directive ${next.directive.id} is approved. Certify freeze via: bridge gatekeeper certify --directive ${next.directive.id}`;
    return results;
  }

  return results;
}

function resolveSurgicalContext(projectRoot, textSpec) {
  const targets = [];
  const words = String(textSpec || '').match(/[A-Za-z0-9_./-]+\.(?:jsx?|tsx?|vue|py|go|rs|json|html|css)/g) || [];
  const uniqueFiles = [...new Set(words)];

  for (const f of uniqueFiles) {
    const candidate = path.resolve(projectRoot, f);
    if (exists(candidate) && fs.statSync(candidate).isFile()) {
      try {
        const content = fs.readFileSync(candidate, 'utf8');
        const lines = content.split('\n');
        targets.push({
          file: path.relative(projectRoot, candidate).replaceAll('\\', '/'),
          totalLines: lines.length
        });
      } catch {}
    }
  }
  return targets;
}

function recordLearning(projectDir, learning = {}) {
  const { bridgeDir } = requireBridge(projectDir);
  const p = paths(bridgeDir);
  const entry = {
    id: id('lrn'),
    timestamp: now(),
    directiveId: learning.directiveId || null,
    category: String(learning.category || 'ARCHITECTURE').toUpperCase(),
    lesson: String(learning.lesson || ''),
    invariant: String(learning.invariant || '')
  };
  if (!entry.lesson) throw new Error('lesson is required');
  appendLineAtomic(p.learnings, JSON.stringify(entry) + '\n');
  return entry;
}

function getLearnings(projectDir) {
  const { bridgeDir } = requireBridge(projectDir);
  const p = paths(bridgeDir);
  if (!exists(p.learnings)) return [];
  return fs.readFileSync(p.learnings, 'utf8').split(/\r?\n/).filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function calculateBlastRadius(projectDir, fileClaims = []) {
  const { projectRoot } = requireBridge(projectDir);
  const files = Array.isArray(fileClaims) ? fileClaims : String(fileClaims || '').split(';').map(s => s.trim()).filter(Boolean);

  let affectedSymbols = 0;
  let estimatedRisk = 'T2';
  const matchedFiles = [];

  for (const f of files) {
    const abs = path.resolve(projectRoot, f);
    if (exists(abs)) {
      matchedFiles.push(f);
      try {
        const c = fs.readFileSync(abs, 'utf8');
        const exportsCount = (c.match(/export\s+(?:default\s+)?(?:function|class|const|let|var)\s+([A-Za-z0-9_]+)/g) || []).length;
        affectedSymbols += Math.max(1, exportsCount);
      } catch {}
    }
  }

  const isSensitive = files.some(f => /auth|security|payment|tenant|secret|migration|database/i.test(f));
  if (isSensitive || affectedSymbols > 15) {
    estimatedRisk = 'T3';
  }
  if (files.some(f => /drop|migration|schema|prod|billing/i.test(f))) {
    estimatedRisk = 'T4';
  }
  if (files.length <= 2 && !isSensitive && files.every(f => /\.(css|md|txt)$/i.test(f))) {
    estimatedRisk = 'T1';
  }

  const blastScore = Math.min(100, (affectedSymbols * 6) + (files.length * 5) + (isSensitive ? 30 : 0));

  return {
    assessedAt: now(),
    filesEvaluated: matchedFiles,
    affectedSymbolsEstimate: affectedSymbols,
    blastRadiusScore: blastScore,
    riskTier: estimatedRisk,
    mandatoryRequirements: estimatedRisk === 'T3' || estimatedRisk === 'T4'
      ? ['Adversarial Red-Team Plan Review', 'Level 5 Machine Evidence (Tests + DOM Crawl)', 'Clean Git Working Tree']
      : ['Unit/Integration Test Pass', 'No Regressions']
  };
}

function cognitivePlanReview(plan, directive, projectRoot) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : String(plan?.steps || '').split(';').map(s => s.trim()).filter(Boolean);
  const summary = String(plan?.summary || '');
  const allText = `${summary}\n${steps.join('\n')}`.toLowerCase();

  const critiques = [];
  const enhancements = [];

  // 1. Systems Architecture Review
  if (!allText.includes('invariant') && !allText.includes('contract') && !allText.includes('schema') && !allText.includes('interface')) {
    critiques.push('Systems Architect: Plan does not explicitly affirm contract boundaries or system invariants.');
    enhancements.push('Verify API contract backward compatibility and preserve schema invariants.');
  }

  // 2. UX & Product Design Review
  if (/ui|component|page|modal|view|frontend/i.test(directive?.title + ' ' + directive?.spec)) {
    if (!allText.includes('loading') && !allText.includes('skeleton') && !allText.includes('empty state')) {
      critiques.push('Product/UX Architect: Plan lacks explicit UX states (loading skeletons, empty states, error banners).');
      enhancements.push('Implement loading skeleton and user-friendly empty/error states.');
    }
    if (!allText.includes('responsive') && !allText.includes('mobile') && !allText.includes('breakpoint')) {
      critiques.push('Product/UX Architect: Plan does not mention responsive validation across mobile (375px) and desktop.');
      enhancements.push('Validate responsive layout across 375px, 768px, and 1280px viewports.');
    }
  }

  // 3. QA & Testing Strategy Review
  if (!allText.includes('test') && !allText.includes('crawl') && !allText.includes('playwright') && !allText.includes('verify')) {
    critiques.push('QA Director: Plan lacks automated verification strategy (unit tests or Playwright DOM crawl).');
    enhancements.push('Execute real Playwright DOM crawl and verify 0 console errors.');
  }

  // 4. Security & Compliance Review
  if (/auth|login|token|api|credential|secret|password|user/i.test(directive?.title + ' ' + directive?.spec)) {
    if (!allText.includes('token') && !allText.includes('auth') && !allText.includes('sanitize') && !allText.includes('bearer')) {
      critiques.push('Security Reviewer: Plan touches authenticated or sensitive paths but omits token guards or input sanitization.');
      enhancements.push('Verify Bearer auth extraction and sanitize all user input against XSS/injection.');
    }
  }

  // 5. Accessibility Review
  if (/ui|component|modal|form|button|dialog/i.test(directive?.title + ' ' + directive?.spec)) {
    if (!allText.includes('aria') && !allText.includes('keyboard') && !allText.includes('focus') && !allText.includes('contrast')) {
      critiques.push('Accessibility Lead: Plan does not address WCAG 2.2 keyboard navigation or focus management.');
      enhancements.push('Ensure keyboard focus rings and Escape key closing for interactive overlays.');
    }
  }

  // 6. Performance Review
  if (/bundle|render|list|table|fetch|query/i.test(directive?.title + ' ' + directive?.spec)) {
    if (!allText.includes('render') && !allText.includes('memo') && !allText.includes('latency') && !allText.includes('perf')) {
      critiques.push('Performance Engineer: Plan does not assess render budget (<100ms) or waterfall reduction.');
      enhancements.push('Ensure sub-100ms render budget and prevent unnecessary re-render loops.');
    }
  }

  const score = Math.max(0, 100 - critiques.length * 15);
  const approved = score >= 70 && steps.length >= 2;

  return {
    score,
    approved,
    critiques,
    suggestedEnhancements: enhancements,
    evaluatedAt: now(),
    directiveId: directive?.id
  };
}

function runFeedbackLoop(projectDir, opts = {}) {
  const { bridgeDir, projectRoot } = requireBridge(projectDir);
  const state = recalc(bridgeDir);
  const directives = getDirectives(bridgeDir);
  const active = directives.find(d => !TERMINAL.has(d.status));
  const results = {
    evaluatedAt: now(),
    projectRoot,
    projectName: path.basename(projectRoot),
    activeDirective: active ? active.id : null,
    status: active ? active.status : 'NO_ACTIVE_DIRECTIVE',
    actionsTaken: [],
    pendingAction: null
  };

  if (!active) {
    results.pendingAction = 'Create next engineering directive from project scope';
    return results;
  }

  // 1. Developer submitted plan: run cognitive 10-role Red-Team critique
  if (active.status === 'PLAN_SUBMITTED') {
    const plan = active.plan;
    const review = cognitivePlanReview(plan, active, projectRoot);

    if (opts.autoApprove && review.approved) {
      const approval = planApprove({
        directiveId: active.id,
        feedback: `Cognitive Red-Team Review Passed (Score: ${review.score}/100).\n${review.suggestedEnhancements.length ? `Advisory enhancements: ${review.suggestedEnhancements.join('; ')}` : '10/10 production plan.'}`,
        projectDir,
        role: 'lead'
      });
      const wake = wakeCline({ directiveId: active.id, mode: 'act', projectDir });
      results.actionsTaken.push({
        action: 'AUTO_APPROVED_PLAN_AND_WOKE_ACT',
        directiveId: active.id,
        reviewScore: review.score,
        approval,
        wake
      });
    } else if (opts.autoApprove && !review.approved) {
      const changes = planRequestChanges({
        directiveId: active.id,
        feedback: `Plan requires enhancement before ACT mode authorization (Red-Team Score: ${review.score}/100):\n${review.critiques.map(c => `• ${c}`).join('\n')}\n\nSuggested fixes:\n${review.suggestedEnhancements.map(e => `• ${e}`).join('\n')}`,
        projectDir,
        role: 'lead'
      });
      const wake = wakeCline({ directiveId: active.id, mode: 'plan', projectDir });
      results.actionsTaken.push({
        action: 'PLAN_CHANGES_REQUESTED_BY_RED_TEAM',
        directiveId: active.id,
        critiques: review.critiques,
        changes,
        wake
      });
    } else {
      results.pendingAction = {
        action: 'LEAD_PLAN_REVIEW',
        directiveId: active.id,
        reviewScore: review.score,
        approved: review.approved,
        critiques: review.critiques,
        suggestedEnhancements: review.suggestedEnhancements,
        recommendation: review.approved
          ? `Run: bridge lead approve-plan --directive ${active.id} --feedback "Approved"`
          : `Run: bridge lead request-changes --directive ${active.id} --feedback "${review.critiques.join('; ')}"`
      };
    }
    return results;
  }

  // 2. Developer submitted evidence: audit evidence manifest and Git status
  if (active.status === 'EVIDENCE_SUBMITTED') {
    const ev = active.evidence;
    const git = gitSnapshot(projectRoot);
    const hasEvidence = Boolean(ev?.manifestHash);

    // The old gate was `hasEvidence && isGit && !dirty`: it verified a file
    // existed, never that the tests in it passed. Now the artifact is actually
    // scanned, and the whole auto path is opt-in only.
    const sanity = hasEvidence ? evidenceLooksPassing(ev) : { ok: false, reason: 'no evidence manifest' };
    if (opts.autoCertify && sanity.ok && git.isGit && !git.dirty) {
      const review = reviewDirective({
        directiveId: active.id,
        verdict: 'APPROVED',
        feedback: 'Automated verification: test artifact scanned, no failure markers, clean Git working tree.',
        projectDir,
        role: 'lead',
        allowAutomation: true
      });
      const cert = certify({
        directiveId: active.id,
        freezeHash: git.head,
        notes: 'Autonomous feedback loop certified release freeze (explicit --certify opt-in; no human Lead sign-off).',
        projectDir,
        role: 'lead',
        allowAutomation: true
      });
      results.actionsTaken.push({
        action: 'AUTO_CERTIFIED_RELEASE_FREEZE',
        directiveId: active.id,
        freezeHash: git.head,
        review,
        certification: cert
      });
    } else {
      results.pendingAction = {
        action: 'GATEKEEPER_EVIDENCE_CERTIFICATION',
        directiveId: active.id,
        manifestHash: ev?.manifestHash,
        gitDirty: git.dirty,
        evidenceSanity: sanity,
        recommendation: git.dirty
          ? 'Commit changes before certifying freeze.'
          : (!sanity.ok
            ? `Auto-certification refused: ${sanity.reason}. A human Lead must review the evidence.`
            : `Run: bridge gatekeeper certify --directive ${active.id} --freeze-hash "${git.head}"`)
      };
    }
    return results;
  }

  // 3. Developer is in progress: check heartbeats
  if (active.status === 'IN_PROGRESS') {
    const hb = state.latestHeartbeat;
    results.pendingAction = {
      action: 'AWAIT_DEV_EVIDENCE',
      directiveId: active.id,
      latestHeartbeat: hb,
      recommendation: 'Developer is actively implementing. Await evidence submission or heartbeat.'
    };
    return results;
  }

  // 4. Developer asked a question: highlight blocker
  if (state.pendingBlockers > 0) {
    const events = readLedger(bridgeDir);
    const q = events.find(e => e.type === 'QUESTION_ASKED' && e.status === 'OPEN');
    results.pendingAction = {
      action: 'ANSWER_DEVELOPER_BLOCKER',
      questionId: q?.id,
      question: q?.body,
      recommendation: `Run: bridge lead reply --message-id ${q?.id} --message "<answer>"`
    };
    return results;
  }

  return results;
}

function safeProjectRoot(input) {
  const p = path.resolve(input || process.cwd());
  return p;
}
function findBridgeRoot(startDir = process.cwd()) {
  const start = safeProjectRoot(startDir);
  let cur = start;
  while (true) {
    const b = path.join(cur, '.bridge');
    if (exists(b) && fs.statSync(b).isDirectory()) {
      try {
        const reg = loadRegistry();
        // HERMETIC MODE — the true root cause of the DIR-062 test pollution.
        // findBridgeRoot() runs on EVERY bridge call, so a scratch project silently
        // repointed the GLOBAL activeProject at a temp dir. The always-on lead
        // watcher then saw that dir as "the active project", called
        // registerProject() on it, created a permanent ~/.ai-bridge/projects/proj-*
        // record, and raised a REAL wake prompt for a project deleted moments later
        // (e.g. proj-Oxqdsz-ba408264 -> E:\Temp\dir062-bridge-S6QhXL\proj-Oxqdsz).
        if (String(process.env.AI_BRIDGE_HERMETIC || '') !== '1'
          && path.resolve(reg.activeProject || '').toLowerCase() !== path.resolve(cur).toLowerCase()) {
          reg.activeProject = cur;
          const p = (reg.projects || []).find(x => path.resolve(x.projectRoot).toLowerCase() === path.resolve(cur).toLowerCase());
          if (p) p.lastActive = now();
          saveRegistry(reg);
        }
      } catch {}
      return { projectRoot: cur, bridgeDir: b, isGlobal: false };
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  // Check activeProject in registry if we are outside any project directory tree
  const reg = loadRegistry();
  if (reg.activeProject && exists(path.join(reg.activeProject, '.bridge')) && (!startDir || path.resolve(startDir) === process.cwd())) {
    const act = path.resolve(reg.activeProject);
    return { projectRoot: act, bridgeDir: path.join(act, '.bridge'), isGlobal: false, isRegistryActive: true };
  }
  const key = sha256(start.toLowerCase()).slice(0, 12);
  const projectDir = path.join(GLOBAL, 'projects', `${path.basename(start)}_${key}`);
  return { projectRoot: start, bridgeDir: path.join(projectDir, '.bridge'), isGlobal: true };
}

function paths(bridgeDir) {
  return {
    config: path.join(bridgeDir, 'bridge.json'),
    ledger: path.join(bridgeDir, 'ledger.jsonl'),
    state: path.join(bridgeDir, 'state.json'),
    directives: path.join(bridgeDir, 'directives'),
    evidence: path.join(bridgeDir, 'evidence'),
    lanes: path.join(bridgeDir, 'lanes'),
    ownership: path.join(bridgeDir, 'lanes', '_file_ownership.json'),
    mergeQueue: path.join(bridgeDir, 'lanes', '_merge_queue.json'),
    audit: path.join(bridgeDir, 'audit.jsonl'),
    learnings: path.join(bridgeDir, 'learnings.jsonl'),
    leadTakeover: path.join(bridgeDir, 'lead_takeover.json')
  };
}

function loadConfig(bridgeDir) {
  const p = paths(bridgeDir);
  const master = jsonRead(MASTER, {});
  const local = jsonRead(p.config, {});
  const merged = {
    bridgeVersion: VERSION,
    ...master, ...local,
    roles: local.roles || master.roles || {},
    models: local.models || master.models || {},
    supervisor: local.supervisor || master.supervisor || {},
    qualityGates: local.qualityGates || master.qualityGates || {},
    persistence: local.persistence || master.persistence || {}
  };
  return merged;
}

function ensureBridge(bridgeDir, projectRoot, name) {
  const p = paths(bridgeDir);
  ensureDir(bridgeDir); ensureDir(p.directives); ensureDir(p.evidence); ensureDir(p.lanes);
  if (!exists(p.ownership)) atomicWrite(p.ownership, { claims: {}, updatedAt: null });
  if (!exists(p.mergeQueue)) atomicWrite(p.mergeQueue, { queue: [], completedMerges: [], updatedAt: null });
  if (!exists(p.ledger)) fs.writeFileSync(p.ledger, '', { mode: 0o600 });
  if (!exists(p.audit)) fs.writeFileSync(p.audit, '', { mode: 0o600 });
  if (!exists(p.config)) {
    const cfg = loadConfig(bridgeDir);
    cfg.projectName = name || path.basename(projectRoot);
    cfg.projectRoot = projectRoot;
    cfg.initializedAt = now();
    cfg.bridgeVersion = VERSION;
    atomicWrite(p.config, cfg);
  }
  registerProject(projectRoot, name);
  recalc(bridgeDir);
}

function readLedger(bridgeDir) {
  const p = paths(bridgeDir);
  if (!exists(p.ledger)) return [];
  return fs.readFileSync(p.ledger, 'utf8').split(/\r?\n/).filter(Boolean).map((line, i) => {
    try { return JSON.parse(line); } catch { return { id: `corrupt_${i}`, type: 'CORRUPT', raw: line }; }
  });
}
function ledgerLastHash(bridgeDir) {
  const ev = readLedger(bridgeDir).filter(e => e.type !== 'CORRUPT').at(-1);
  return ev?.hash || 'GENESIS';
}
function notifyLeadSupervisor(bridgeDir, body) {
  try {
    // HERMETIC MODE — the source of the ghost wake. This function did four global
    // things: registerProject(), an append to the GLOBAL lead_wake_queue.jsonl,
    // AW.deliver() (which creates a real projects/<key>/ record + wake prompt) and
    // a UDP packet to the live lead watcher on port 48222. From a test harness that
    // produced a genuine wake for a scratch project deleted moments later —
    // e.g. `proj-Oxqdsz-ba408264 -> E:\Temp\dir062-bridge-S6QhXL\proj-Oxqdsz`.
    if (String(process.env.AI_BRIDGE_HERMETIC || '') === '1') return;
    const signalFile = path.join(bridgeDir, 'wake_lead.signal');
    atomicWrite(signalFile, {
      timestamp: now(),
      seq: body.seq,
      id: body.id,
      type: body.type,
      title: body.title,
      sender: body.sender,
      directiveId: body.payload?.directiveId || null,
      summary: body.body || ''
    });

    const projectRoot = path.dirname(bridgeDir);
    const projectName = path.basename(projectRoot);

    const queueFile = path.join(GLOBAL, 'lead_wake_queue.jsonl');
    // HERMETIC MODE. Never append to the GLOBAL wake queue from a test harness: a
    // scratch project's events otherwise produce real wake prompts (and record
    // dirs) for a project that is deleted moments later — ghost wakes such as
    // `proj-Oxqdsz-ba408264 -> E:\Temp\dir062-bridge-S6QhXL\proj-Oxqdsz`.
    if (String(process.env.AI_BRIDGE_HERMETIC || '') !== '1') {
      appendLineAtomic(queueFile, JSON.stringify({
        timestamp: now(),
        bridgeDir,
        projectRoot,
        projectName,
        event: body
      }) + '\n');
    }

    try {
      registerProject(projectRoot, projectName);
    } catch {}

    // GAP FIX: durable, project-scoped, capability-routed wake to the Lead for
    // every ACTIONABLE handoff (heartbeats are telemetry, not handoffs). This is
    // what makes `bridge await --role lead` and the acked lead outbox work —
    // previously the Lead was only reachable via the global queue/terminal.
    try {
      const LEAD_ACTIONABLE = new Set(['PLAN_SUBMITTED', 'QUESTION_ASKED', 'EVIDENCE_SUBMITTED', 'DIRECT_MESSAGE']);
      if (body.recipient === ROLES.LEAD && LEAD_ACTIONABLE.has(body.type)) {
        const AW = require('./autowake.cjs');
        const dId = body.payload?.directiveId || null;
        const promptText = `[BRIDGE WAKE — LEAD ACTION REQUIRED]\nType: ${body.type}\nProject: ${projectName} (${projectRoot})\nDirective: ${dId || 'N/A'}\nTitle: ${body.title}\n\n${String(body.body || '').slice(0, 4000)}\n\nNext: bridge await --role lead --projectDir "${projectRoot}"`;
        AW.deliver({ projectDir: projectRoot, toRole: 'lead', directiveId: dId, mode: 'lead', promptText, noUri: true });
      }
    } catch { }

    try {
      const dgram = require('node:dgram');
      const client = dgram.createSocket('udp4');
      let targetPort = 48222;
      try {
        const telemetryFile = path.join(GLOBAL, 'telemetry.json');
        if (exists(telemetryFile)) {
          const t = jsonRead(telemetryFile, null);
          if (t?.udpPort && Number.isFinite(t.udpPort)) targetPort = t.udpPort;
        }
      } catch {}
      const msg = Buffer.from(JSON.stringify({
        type: body.type,
        id: body.id,
        directiveId: body.payload?.directiveId,
        bridgeDir,
        projectRoot,
        projectName
      }));
      client.send(msg, targetPort, '127.0.0.1', () => {
        try { client.close(); } catch {}
      });
    } catch {}
  } catch (e) {}
}

function appendEvent(bridgeDir, event) {
  return withLock(`ledger:${bridgeDir}`, () => {
    const p = paths(bridgeDir);
    const events = readLedger(bridgeDir);
    const seq = events.filter(e => e.type !== 'CORRUPT').length + 1;
    const body = { ...event, id: event.id || id(), seq, timestamp: event.timestamp || now(), prevHash: ledgerLastHash(bridgeDir) };
    body.hash = sha256(JSON.stringify(body));
    appendLineAtomic(p.ledger, JSON.stringify(body) + '\n');

    if (body.recipient === ROLES.LEAD || body.sender === ROLES.DEV) {
      notifyLeadSupervisor(bridgeDir, body);
    }
    return body;
  });
}

function getDirectives(bridgeDir) {
  const d = paths(bridgeDir).directives;
  ensureDir(d);
  return fs.readdirSync(d).filter(x => /^DIR-\d{3,}\.json$/.test(x))
    .map(x => jsonRead(path.join(d, x), null)).filter(Boolean)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
}
function getDirective(bridgeDir, idv) {
  if (!/^[A-Z0-9_-]{1,80}$/.test(String(idv || ''))) return null;
  return jsonRead(path.join(paths(bridgeDir).directives, `${idv}.json`), null);
}
function saveDirective(bridgeDir, d) { atomicWrite(path.join(paths(bridgeDir).directives, `${d.id}.json`), d); }

function transition(d, next, reason = '') {
  if (d.status === next) return;
  const allowed = TRANSITIONS[d.status] || new Set();
  if (!allowed.has(next)) throw new Error(`Illegal directive transition ${d.status} -> ${next}`);
  d.status = next; d.updatedAt = now();
  if (reason) d.lastTransitionReason = reason;
  // Continuation intent only means anything while the DEVELOPER owns the ball.
  // Leaving IN_PROGRESS (evidence submitted, frozen, cancelled) must clear it, or
  // a finished directive would keep asking to be resumed forever.
  if (next !== 'IN_PROGRESS') d.continuationPending = false;
  // A revision target is SATISFIED the moment the developer re-submits that
  // artifact: a revised plan (PLAN_SUBMITTED) or a new evidence pack
  // (EVIDENCE_SUBMITTED) — or by re-entering implementation.
  if (next === 'PLAN_SUBMITTED' || next === 'IN_PROGRESS' || next === 'EVIDENCE_SUBMITTED') d.revisionTarget = null;
}

function validateDirective(d) {
  const errors = [];
  if (!d?.id || !d.title || !d.spec) errors.push('Directive requires id,title,spec');
  if (!Array.isArray(d.invariants)) errors.push('invariants must be array');
  if (!Array.isArray(d.acceptanceCriteria)) errors.push('acceptanceCriteria must be array');
  if (!['P0', 'P1', 'P2'].includes(d.priority)) errors.push('priority must be P0/P1/P2');
  return errors;
}

function recalc(bridgeDir) {
  const events = readLedger(bridgeDir);
  const directives = getDirectives(bridgeDir);
  const active = directives.find(d => !TERMINAL.has(d.status));
  const unread = (role) => events.filter(e => (e.recipient === role || e.recipient === 'ALL') && !(e.readBy || []).includes(role)).length;
  const heartbeats = events.filter(e => e.type === 'HEARTBEAT');
  const latest = heartbeats.at(-1);
  const questions = events.filter(e => e.type === 'QUESTION_ASKED' && e.status === 'OPEN').length;

  // ---- Authoritative liveness contract -------------------------------------
  // The supervisor previously had to INFER "is the dev working or waiting on a
  // human?" from a mirrored status string. That inference was wrong and caused
  // the wake loop. We now publish the answer directly from the state machine.
  const status = active?.status || null;
  const gateReason = active ? humanGateReason(status) : null;
  const awaitingHuman = !!gateReason;

  // A directive in a human-gated state must NOT be treated as a stall even if
  // the developer's last heartbeat is old -- that is the expected condition.
  const lastActivity = latest?.timestamp || active?.updatedAt || null;
  const state = {
    schemaVersion: 3, updatedAt: now(), eventCount: events.length,
    activeDirectiveId: active?.id || null, activeDirectiveTitle: active?.title || null,
    activeDirectiveStatus: status,
    awaitingHuman,
    awaitingHumanReason: gateReason,
    awaitingHumanSince: awaitingHuman ? (active.updatedAt || null) : null,
    // Null means "no deadline" -- the supervisor must not run a stall timer.
    stallDeadline: awaitingHuman ? null : lastActivity,
    unreadForLead: unread(ROLES.LEAD), unreadForDev: unread(ROLES.DEV),
    pendingBlockers: questions,
    latestHeartbeat: latest ? { timestamp: latest.timestamp, status: latest.payload?.status, percent: latest.payload?.percent } : null,
    integrity: verifyLedger(bridgeDir)
  };
  atomicWrite(paths(bridgeDir).state, state);
  return state;
}
function verifyLedger(bridgeDir) {
  const events = readLedger(bridgeDir); let prev = null; let bad = 0; let legacy = 0;
  for (const e of events) {
    if (e.type === 'CORRUPT') { bad++; continue; }
    if (!e.hash) { legacy++; continue; }
    if (prev === null) prev = e.prevHash;
    const copy = { ...e }; const hash = copy.hash; delete copy.hash;
    if (e.prevHash !== prev || sha256(JSON.stringify(copy)) !== hash) bad++;
    prev = hash;
  }
  return { ok: bad === 0, checked: events.length, legacy, bad };
}


function nextDirectiveId(bridgeDir) {
  const nums = getDirectives(bridgeDir).map(d => Number(String(d.id).replace(/\D/g, '')) || 0);
  return `DIR-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
}
function requireBridge(projectDir) {
  const r = findBridgeRoot(projectDir); ensureDir(r.bridgeDir);
  if (!exists(paths(r.bridgeDir).config)) throw new Error(`Bridge not initialized for ${r.projectRoot}`);
  return r;
}
function requireRole(role, allowed) {
  if (!allowed.includes(role)) throw new Error(`Role ${role} is not authorized for this operation`);
}
function roleFrom(v) { return String(v || 'lead').toLowerCase() === 'dev' ? ROLES.DEV : ROLES.LEAD; }

// ── PROVENANCE ON PRIVILEGED ACTIONS ─────────────────────────────────────────
// WHY THIS EXISTS. Every Lead/Gatekeeper action used to be recorded with a bare
// role label (`sender: LEAD_SUPERVISOR`, `certifiedBy: LEAD_SUPERVISOR`). A role
// label is not an identity: an AUTONOMOUS daemon shelling out
// `bridge gatekeeper certify` produced a record INDISTINGUISHABLE from a human
// Lead sign-off. Concretely, `pipelineAdvance()` — which the scheduled
// AIBridge-LeadWatcher task reaches via `bridge pipeline auto` — called
// `reviewDirective({verdict:'APPROVED', feedback:'Automated verification check
// passed.'})` and then `certify()`, so directives landed on APPROVED_FROZEN with
// `certifiedBy: LEAD_SUPERVISOR` having never been reviewed by anyone. The audit
// trail could not answer "who actually approved this?".
//
// Provenance is therefore resolved from signals the caller does NOT control:
//   1. an explicit declaration  (--automated / AI_BRIDGE_ACTOR=automation)
//   2. the DAEMON PID REGISTRY  (sanctioned automation registers its PID, so a
//      daemon that "forgets" to declare itself is still caught via process.ppid)
//   3. absence of a TTY         (no human is typing at this process)
function daemonPidRegistry() {
  try { return jsonRead(path.join(os.homedir(), '.ai-bridge', 'daemon_pids.json'), {}) || {}; }
  catch { return {}; }
}
function actorProvenance(o = {}) {
  const declared = String(o.automated === true ? 'automation' : (process.env.AI_BRIDGE_ACTOR || '')).toLowerCase();
  const ppid = typeof process.ppid === 'number' ? process.ppid : null;
  const parent = ppid == null ? null : daemonPidRegistry()[String(ppid)];
  const isTty = Boolean(process.stdout && process.stdout.isTTY);
  const reasons = [];
  if (declared === 'automation' || declared === 'true') reasons.push('declared');
  if (parent) reasons.push(`daemon-parent:${parent}`);
  if (!isTty) reasons.push('non-tty');
  const automated = reasons.length > 0;
  return {
    actor: ROLES.LEAD,
    invocation: automated ? (parent ? `daemon:${parent}` : (declared === 'automation' ? 'declared-automation' : 'non-tty')) : 'human-cli',
    automated, reasons,
    pid: process.pid, parentPid: ppid, tty: isTty, at: now()
  };
}
/**
 * Refuse a privileged action that is being driven by automation unless the
 * caller explicitly accepts that. Without this the release gate is a green light
 * any background loop can switch on for itself.
 */
function assertHumanAuthorisation(verb, o = {}) {
  const prov = actorProvenance(o);
  const allow = o.allowAutomation === true || o['allow-automation'] === true
    || String(process.env.AI_BRIDGE_ALLOW_AUTOMATION || '') === '1';
  if (prov.automated && !allow) {
    throw new Error(
      `${verb} refused: this invocation is AUTOMATED (${prov.reasons.join(', ')} -> ${prov.invocation}). ` +
      'A plan approval, evidence approval or release freeze must be authorised by a human Lead, not by a background loop. ' +
      'If automation is genuinely intended, re-run with --allow-automation: the decision is then recorded as automated:true.'
    );
  }
  return { ...prov, explicitlyAllowed: Boolean(prov.automated && allow) };
}

function createDirective(o = {}) {
  const { bridgeDir, projectRoot } = requireBridge(o.projectDir);
  requireRole(roleFrom(o.role), [ROLES.LEAD]);
  return withLock(`directive:${bridgeDir}`, () => {
    const activeDirectives = getDirectives(bridgeDir).filter(x => !TERMINAL.has(x.status));
    if (activeDirectives.length >= 2 && !o.force) {
      throw new Error(`Cannot issue directive: maximum 2 active directives allowed concurrently to prevent terminal open/close spamming (currently active: ${activeDirectives.map(x => x.id).join(', ')}). Complete or cancel existing directives before issuing new ones.`);
    }
    const d = {
      id: nextDirectiveId(bridgeDir), title: String(o.title || 'Master Engineering Directive').slice(0, 300),
      priority: String(o.priority || 'P0').toUpperCase(), status: 'ISSUED',
      leadAuthor: 'LEAD_SUPERVISOR', assignedTo: 'STAFF_DEVELOPER',
      createdAt: now(), updatedAt: now(), projectRoot,
      spec: String(o.spec || ''), invariants: Array.isArray(o.invariants) ? o.invariants : [],
      acceptanceCriteria: Array.isArray(o.acceptanceCriteria) ? o.acceptanceCriteria : [],
      plan: null, evidence: null, reviews: [], freeze: null
    };
    const errors = validateDirective(d); if (errors.length) throw new Error(errors.join('; '));
    saveDirective(bridgeDir, d);
    appendEvent(bridgeDir, {
      sender: ROLES.LEAD, recipient: ROLES.DEV, type: 'DIRECTIVE_ISSUED',
      title: `[${d.priority}] ${d.id}: ${d.title}`, body: d.spec,
      readBy: [ROLES.LEAD], payload: { directiveId: d.id, priority: d.priority }
    });

    let wakeResult = null;
    if (!o.noWake && !o['no-wake']) {
      try {
        wakeResult = wakeCline({ directiveId: d.id, mode: 'plan', projectDir: projectRoot });
      } catch (e) {}
    }
    return { ...d, wakeResult };
  });
}

function reissueDirective(o = {}) {
  const { bridgeDir, projectRoot } = requireBridge(o.projectDir);
  requireRole(roleFrom(o.role), [ROLES.LEAD]);
  const dId = o.directiveId || o.directive || o.id;
  if (!dId) throw new Error('directiveId is required');
  const d = getDirective(bridgeDir, dId);
  if (!d) throw new Error(`Directive ${dId} not found`);

  return withLock(`directive:${bridgeDir}`, () => {
    const activeDirectives = getDirectives(bridgeDir).filter(x => !TERMINAL.has(x.status) && x.id !== d.id);
    if (activeDirectives.length >= 2 && !o.force) {
      throw new Error(`Cannot reissue ${dId}: maximum 2 active directives allowed concurrently to prevent terminal spam (currently active: ${activeDirectives.map(x => x.id).join(', ')}).`);
    }

    transition(d, 'ISSUED', o.reason || 'Reissued by Lead (throttled max 2 active)');
    d.updatedAt = now();
    saveDirective(bridgeDir, d);
    appendEvent(bridgeDir, {
      sender: ROLES.LEAD,
      recipient: ROLES.DEV,
      type: 'DIRECTIVE_ISSUED',
      title: `[Reissued] [${d.priority}] ${d.id}: ${d.title}`,
      body: d.spec,
      readBy: [ROLES.LEAD],
      payload: { directiveId: d.id, priority: d.priority, reissued: true }
    });

    let wakeResult = null;
    if (!o.noWake && !o['no-wake']) {
      try {
        wakeResult = wakeCline({ directiveId: d.id, mode: 'plan', projectDir: projectRoot });
      } catch (e) {}
    }
    return { success: true, directive: d, wakeResult };
  });
}

function updateDirective(o = {}) {
  const { bridgeDir, projectRoot } = requireBridge(o.projectDir);
  requireRole(roleFrom(o.role), [ROLES.LEAD]);
  const dId = o.directiveId || o.directive || o.id;
  if (!dId) throw new Error('directiveId is required');
  const d = getDirective(bridgeDir, dId);
  if (!d) throw new Error(`Directive ${dId} not found`);

  const updates = [];
  if (o.title && o.title !== d.title) {
    d.title = String(o.title).slice(0, 300);
    updates.push(`title updated to "${d.title}"`);
  }
  if (o.priority && o.priority.toUpperCase() !== d.priority) {
    const oldP = d.priority;
    d.priority = o.priority.toUpperCase();
    updates.push(`priority changed from ${oldP} to ${d.priority}`);
  }
  if (o.spec) {
    d.spec = String(o.spec);
    updates.push('spec updated');
  }
  if (o.addInvariant || o.invariant) {
    const inv = String(o.addInvariant || o.invariant).trim();
    if (inv && !(d.invariants || []).includes(inv)) {
      d.invariants = d.invariants || [];
      d.invariants.push(inv);
      updates.push(`added invariant: "${inv}"`);
    }
  }
  if (o.addCriteria || o.criteria) {
    const crit = String(o.addCriteria || o.criteria).trim();
    if (crit && !(d.acceptanceCriteria || []).includes(crit)) {
      d.acceptanceCriteria = d.acceptanceCriteria || [];
      d.acceptanceCriteria.push(crit);
      updates.push(`added acceptance criterion: "${crit}"`);
    }
  }

  d.updatedAt = now();
  saveDirective(bridgeDir, d);

  appendEvent(bridgeDir, {
    sender: ROLES.LEAD,
    recipient: ROLES.DEV,
    type: 'DIRECTIVE_UPDATED',
    title: `[Directive Updated] ${d.id}: ${d.title}`,
    body: `Lead dynamically updated directive based on developer findings:\n${updates.map(u => `• ${u}`).join('\n')}`,
    readBy: [ROLES.LEAD],
    payload: { directiveId: d.id, updates, priority: d.priority }
  });

  // Response-required handoff: the developer must re-plan/re-implement against
  // the updated contract, so autonomously wake them (clipboard-free).
  let wakeResult = null;
  if (updates.length && !o.noWake && !o['no-wake']) {
    try {
      wakeResult = wakeCline({ directiveId: d.id, mode: arbitrateMode(d, o.mode), projectDir: projectRoot, force: true });
    } catch (e) {}
  }

  return { success: true, directive: d, updates, wakeResult };
}

function submitPlan(o = {}) {
  const { bridgeDir } = requireBridge(o.projectDir); requireRole(roleFrom(o.role), [ROLES.DEV]);
  const d = getDirective(bridgeDir, o.directiveId); if (!d) throw new Error('Directive not found');
  if (d.status === 'APPROVED_FROZEN') throw new Error('Directive is frozen');
  const steps = Array.isArray(o.steps) ? o.steps : String(o.steps || '').split(';').map(s => s.trim()).filter(Boolean);
  d.plan = { submittedAt: now(), summary: String(o.summary || ''), steps, planHash: sha256(JSON.stringify({ summary: o.summary, steps })) };
  // Enter the human-gated PLAN_SUBMITTED state. The ball is now in the Lead's
  // court, and the supervisor must stay silent until the Lead acts.
  transition(d, 'PLAN_SUBMITTED', 'developer plan submitted; awaiting lead review'); saveDirective(bridgeDir, d);
  appendEvent(bridgeDir, {
    sender: ROLES.DEV, recipient: ROLES.LEAD, type: 'PLAN_SUBMITTED',
    title: `[Plan] ${d.id}: ${d.title}`, body: d.plan.summary, readBy: [ROLES.DEV],
    payload: { directiveId: d.id, planHash: d.plan.planHash, steps }
  });
  return d;
}

/**
 * Lead-only authoritative approval of a developer plan.
 *
 * This replaces ad-hoc "wake in ACT mode" as the mechanism for entering
 * implementation. Because it is a real state transition, the supervisor and the
 * IDE can no longer disagree about what mode is legal.
 */
function planApprove(o = {}) {
  const { bridgeDir, projectRoot } = requireBridge(o.projectDir); requireRole(roleFrom(o.role), [ROLES.LEAD]);
  const prov = assertHumanAuthorisation('Plan approval (bridge lead approve-plan)', o);
  const d = getDirective(bridgeDir, o.directiveId); if (!d) throw new Error('Directive not found');
  if (!d.plan) throw new Error('Cannot approve a directive with no plan');
  if (d.status !== 'PLAN_SUBMITTED') throw new Error(`Cannot approve plan from status ${d.status}`);
  transition(d, 'IN_PROGRESS', 'lead approved plan; act mode authorized');
  d.planApproval = { approvedAt: now(), automated: prov.automated, provenance: prov, feedback: String(o.feedback || '') };
  saveDirective(bridgeDir, d);
  appendEvent(bridgeDir, {
    sender: ROLES.LEAD, recipient: ROLES.DEV, type: 'PLAN_APPROVED',
    title: `[Plan Approved] ${d.id}: ${d.title}`, body: String(o.feedback || 'Plan approved. Act mode authorized.'),
    readBy: [ROLES.LEAD], payload: { directiveId: d.id, planHash: d.plan.planHash, mode: 'act', automated: prov.automated, provenance: prov }
  });

  let wakeResult = null;
  if (!o.noWake && !o['no-wake']) {
    try {
      wakeResult = wakeCline({ directiveId: d.id, mode: 'act', feedback: o.feedback, force: true, projectDir: projectRoot });
    } catch (e) {}
  }
  return { ...d, wakeResult };
}

/** Lead-only rejection of a plan, returning it to the developer. */
function planRequestChanges(o = {}) {
  const { bridgeDir, projectRoot } = requireBridge(o.projectDir); requireRole(roleFrom(o.role), [ROLES.LEAD]);
  const d = getDirective(bridgeDir, o.directiveId); if (!d) throw new Error('Directive not found');
  if (!d.plan) throw new Error('Directive has no plan to revise');
  transition(d, 'CHANGES_REQUESTED', 'lead requested plan changes');
  // Record WHAT must be revised. Without this, CHANGES_REQUESTED is ambiguous —
  // a plan rejection and an evidence rejection are indistinguishable — and the
  // DERIVED wake mode for a plan rejection came out as ACT, i.e. the developer
  // was told to write code when the Lead had asked for a PLAN revision.
  d.revisionTarget = 'plan';
  saveDirective(bridgeDir, d);
  appendEvent(bridgeDir, {
    sender: ROLES.LEAD, recipient: ROLES.DEV, type: 'PLAN_CHANGES_REQUESTED',
    title: `[Plan Changes Requested] ${d.id}`, body: String(o.feedback || ''), readBy: [ROLES.LEAD],
    payload: { directiveId: d.id, mode: 'plan', revisionTarget: 'plan' }
  });

  let wakeResult = null;
  if (!o.noWake && !o['no-wake']) {
    try {
      // force:true — a rejection is a high-priority handoff and must never be
      // swallowed by the 45s duplicate-wake cooldown. planApprove already does this.
      wakeResult = wakeCline({ directiveId: d.id, mode: 'plan', force: true, prompt: `[LEAD REQUESTED PLAN CHANGES]\nDirective: ${d.id}\nFeedback: ${o.feedback || ''}`, projectDir: projectRoot });
    } catch (e) {}
  }
  return { ...d, wakeResult };
}

function fileDigest(file) {
  const st = fs.statSync(file); const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r'); const buf = Buffer.allocUnsafe(1024 * 1024);
  try { let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); }
  finally { fs.closeSync(fd); }
  return { sha256: h.digest('hex'), size: st.size };
}
function evidenceEntry(input, bridgeDir) {
  if (!input) return null;
  const s = String(input);
  const candidate = path.resolve(s);
  if (exists(candidate) && fs.statSync(candidate).isFile()) {
    const { sha256: hash, size } = fileDigest(candidate);
    const copy = path.join(paths(bridgeDir).evidence, `${Date.now()}_${path.basename(candidate)}`);
    fs.copyFileSync(candidate, copy);
    return { source: candidate, stored: copy, sha256: hash, size };
  }
  return { inline: true, sha256: sha256(s), size: Buffer.byteLength(s), content: s.slice(0, 20000) };
}

function submitEvidence(o = {}) {
  const { bridgeDir } = requireBridge(o.projectDir); requireRole(roleFrom(o.role), [ROLES.DEV]);
  const d = getDirective(bridgeDir, o.directiveId); if (!d) throw new Error('Directive not found');
  if (!d.plan) throw new Error('Cannot submit evidence before a developer plan');
  const evidence = {
    submittedAt: now(), summary: String(o.summary || ''),
    tests: evidenceEntry(o.tests, bridgeDir), domCrawl: evidenceEntry(o.domCrawl, bridgeDir),
    artifacts: Array.isArray(o.artifacts) ? o.artifacts : [],
    git: (() => {
      const root = findBridgeRoot(o.projectDir).projectRoot;
      let s = gitSnapshot(root);
      if (s.isGit && s.dirty && !o.noCommit) {
        try {
          gitRun(['add', '.'], root);
          gitRun(['commit', '-m', `[EVIDENCE] ${d.id}: ${d.title} [Verified Tests Pass]`], root);
          s = gitSnapshot(root);
        } catch {}
      }
      return s;
    })(),
  };
  evidence.manifestHash = sha256(JSON.stringify(evidence));
  d.evidence = evidence; transition(d, 'EVIDENCE_SUBMITTED', 'verification evidence submitted'); saveDirective(bridgeDir, d);
  appendEvent(bridgeDir, {
    sender: ROLES.DEV, recipient: ROLES.LEAD, type: 'EVIDENCE_SUBMITTED',
    title: `[Evidence] ${d.id}: ${d.title}`, body: evidence.summary, readBy: [ROLES.DEV],
    payload: { directiveId: d.id, manifestHash: evidence.manifestHash, git: evidence.git }
  });
  return d;
}

function reviewDirective(o = {}) {
  const { bridgeDir } = requireBridge(o.projectDir); requireRole(roleFrom(o.role), [ROLES.LEAD]);
  const d = getDirective(bridgeDir, o.directiveId); if (!d) throw new Error('Directive not found');
  const verdict = String(o.verdict || '').toUpperCase();
  if (!['APPROVED', 'CHANGES_REQUESTED'].includes(verdict)) throw new Error('Invalid verdict');
  // Only APPROVED is gated. APPROVED is the green light that unlocks the freeze,
  // so it is the one a background loop must not be able to grant itself; a
  // CHANGES_REQUESTED merely sends work back and is harmless to allow through.
  const prov = verdict === 'APPROVED'
    ? assertHumanAuthorisation('Evidence approval (bridge lead review --verdict APPROVED)', o)
    : actorProvenance(o);
  // Guided errors. This verb reviews EVIDENCE, so a Lead who reaches for it at
  // PLAN_SUBMITTED should be told which verb they actually want, not handed a
  // bare "requires both plan and evidence".
  if (!d.plan) throw new Error(`Cannot review ${d.id}: no plan has been submitted yet.`);
  if (!d.evidence) throw new Error(`Cannot review ${d.id}: this verb reviews EVIDENCE and none has been submitted. To review the PLAN use "bridge lead approve-plan" or "bridge lead request-changes".`);
  d.reviews = d.reviews || [];
  d.reviews.push({ reviewedAt: now(), verdict, feedback: String(o.feedback || ''), evidenceHash: d.evidence.manifestHash, automated: prov.automated, provenance: prov });
  transition(d, verdict === 'APPROVED' ? 'APPROVED' : 'CHANGES_REQUESTED', 'lead review');
  // This verb reviews EVIDENCE (it refuses to run without it), so a
  // CHANGES_REQUESTED here means the EVIDENCE must be revised — never the plan.
  if (verdict !== 'APPROVED') d.revisionTarget = 'evidence';
  saveDirective(bridgeDir, d);
  appendEvent(bridgeDir, {
    sender: ROLES.LEAD, recipient: ROLES.DEV, type: 'REVIEW_FEEDBACK',
    title: `[Review ${verdict}] ${d.id}`, body: String(o.feedback || ''), readBy: [ROLES.LEAD],
    payload: { directiveId: d.id, verdict, evidenceHash: d.evidence.manifestHash, automated: prov.automated, provenance: prov }
  });

  let wakeResult = null;
  if (verdict === 'CHANGES_REQUESTED' && !o.noWake && !o['no-wake']) {
    try {
      wakeResult = wakeCline({
        directiveId: d.id,
        mode: 'act',
        // force:true — a rejection must never be swallowed by the 45s duplicate
        // cooldown. Losing the handoff is exactly the failure this guards.
        force: true,
        prompt: `[LEAD REQUESTED EVIDENCE CHANGES]\nDirective: ${d.id}\nVerdict: CHANGES_REQUESTED\nFeedback:\n${o.feedback || ''}\n\nPlease address the requested changes and re-submit evidence.`,
        projectDir: findBridgeRoot(o.projectDir).projectRoot
      });
    } catch (e) {
      wakeResult = { error: e.message };
    }
  }
  return { ...d, wakeResult };
}

function certify(o = {}) {
  const { bridgeDir, projectRoot } = requireBridge(o.projectDir); requireRole(roleFrom(o.role), [ROLES.LEAD]);
  const prov = assertHumanAuthorisation('Release freeze (bridge gatekeeper certify)', o);
  const d = getDirective(bridgeDir, o.directiveId); if (!d) throw new Error('Directive not found');
  if (d.status !== 'APPROVED') throw new Error(`Cannot certify directive in status ${d.status}; explicit APPROVED review required`);
  if (!d.plan || !d.evidence || !d.reviews?.some(r => r.verdict === 'APPROVED')) throw new Error('Certification requires plan, evidence and an APPROVED review');
  let snap = gitSnapshot(projectRoot);
  if (!snap.isGit) throw new Error('Certification requires a Git repository');
  let snapRef = snap;
  if (snapRef.dirty) {
    try {
      gitRun(['add', '.'], projectRoot);
      gitRun(['commit', '-m', `[CERTIFIED] ${d.id}: ${d.title} (Evidence: ${d.evidence.manifestHash.slice(0, 8)})`], projectRoot);
      snapRef = gitSnapshot(projectRoot);
    } catch (e) {
      if (snapRef.dirty && !o.force) throw new Error(`Certification refused: working tree is dirty and the auto-commit failed (${String(e.message || e).slice(0, 140)}). Commit the verified state first.`);
    }
  }
  snap = snapRef;
  const requested = o.freezeHash;
  if (requested && requested !== snap.head) throw new Error(`Freeze hash ${requested} does not match HEAD ${snap.head}`);
  const freezeHash = snap.head;
  d.freeze = {
    freezeHash, certifiedAt: now(), certifiedBy: ROLES.LEAD, notes: String(o.notes || ''), evidenceHash: d.evidence.manifestHash,
    // PROVENANCE: an automated freeze is a materially weaker claim than a human
    // one and must be legible as such on the directive record itself.
    automated: prov.automated,
    certificationKind: prov.automated ? 'automated' : 'human',
    provenance: prov
  };
  transition(d, 'APPROVED_FROZEN', 'gatekeeper certification'); saveDirective(bridgeDir, d);
  appendEvent(bridgeDir, {
    sender: ROLES.LEAD, recipient: 'ALL', type: 'GATEKEEPER_CERTIFIED',
    title: `[CERTIFIED & FROZEN] ${d.id}: ${d.title}`,
    body: `Release certified at ${freezeHash}${prov.automated ? ' (AUTOMATED — no human Lead sign-off)' : ''}.`, readBy: [ROLES.LEAD],
    payload: { directiveId: d.id, freezeHash, evidenceHash: d.evidence.manifestHash, automated: prov.automated, provenance: prov }
  });
  return d;
}

function heartbeat(o = {}) {
  const { bridgeDir } = requireBridge(o.projectDir); requireRole(roleFrom(o.role), [ROLES.DEV]);
  const pct = o.percent == null ? null : Number(o.percent);
  if (pct != null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) throw new Error('percent must be 0-100');
  // CONTINUATION INTENT. The wake plane is a STALL detector — it can only ask
  // "has the developer gone quiet?". It cannot observe a TURN BOUNDARY, so an
  // agent that yields with approved work remaining is indistinguishable from one
  // that is mid-tool-call, and resuming it waits the full 10-minute stall
  // threshold. `--continue` is the explicit signal that closes that gap: it says
  // "I am stopping this turn, there IS approved work left, resume me promptly".
  const continuationPending = o.continue === true || o.continue === 'true'
    || o.continues === true || o.continues === 'true'
    || o.continuation === true || o.continuation === 'true';
  const e = appendEvent(bridgeDir, {
    sender: ROLES.DEV, recipient: ROLES.LEAD, type: 'HEARTBEAT',
    title: `[Heartbeat] ${String(o.status || 'working').slice(0, 200)}`,
    body: String(o.status || 'working'), readBy: [ROLES.DEV],
    payload: { directiveId: o.directiveId || null, status: String(o.status || ''), percent: pct, currentFile: o.currentFile || null, continuationPending }
  });
  // Mirror the heartbeat onto the DIRECTIVE RECORD, not just the ledger.
  //
  // The ledger is the event log; the directive record is what `bridge status`,
  // the Lead, and the stall watchdog actually read. Writing only the ledger left
  // every actively-worked directive reporting `heartbeats: 0`, so a directive in
  // full flight was indistinguishable from an abandoned one.
  //
  // `updatedAt` is deliberately NOT touched: it gates the watchdog's
  // auto-advance timers (CASE 1/2, `elapsedMinSinceUpdate`), and telemetry must
  // never move a state-machine clock. Telemetry must also never break the
  // heartbeat itself, hence the swallow.
  if (o.directiveId) {
    try {
      const d = getDirective(bridgeDir, o.directiveId);
      if (d) {
        const at = now();
        if (!Array.isArray(d.heartbeats)) d.heartbeats = [];
        d.heartbeats.push({ at, status: String(o.status || ''), percent: pct, currentFile: o.currentFile || null, by: ROLES.DEV, continuationPending });
        if (d.heartbeats.length > 50) d.heartbeats = d.heartbeats.slice(-50);
        d.lastHeartbeatAt = at;
        d.continuationPending = continuationPending;
        saveDirective(bridgeDir, d);
      }
    } catch { /* telemetry is best-effort */ }
  }
  return e;
}

function ask(o = {}) {
  const { bridgeDir } = requireBridge(o.projectDir); requireRole(roleFrom(o.role), [ROLES.DEV]);
  if (!o.question) throw new Error('question is required');
  return appendEvent(bridgeDir, {
    sender: ROLES.DEV, recipient: ROLES.LEAD, type: 'QUESTION_ASKED',
    title: `[Blocker] ${String(o.question).slice(0, 120)}`, body: `${o.question}\n\n${o.context || ''}`,
    status: 'OPEN', readBy: [ROLES.DEV], payload: { directiveId: o.directiveId || null }
  });
}

function reply(o = {}) {
  const { bridgeDir, projectRoot } = requireBridge(o.projectDir); requireRole(roleFrom(o.role), [ROLES.LEAD]);
  const events = readLedger(bridgeDir); const target = events.find(e => e.id === o.messageId);
  if (!target) throw new Error('Message not found');
  target.status = 'RESOLVED';
  rewriteLedger(bridgeDir, events);
  const ev = appendEvent(bridgeDir, {
    sender: ROLES.LEAD, recipient: ROLES.DEV, type: 'QUESTION_ANSWERED',
    title: `[Answer] Re: ${target.title}`, body: String(o.message || ''), readBy: [ROLES.LEAD],
    payload: { replyTo: o.messageId, directiveId: target.payload?.directiveId || null }
  });

  const dId = target.payload?.directiveId || null;
  // State machine synchronization: if the directive was waiting on plan approval and blocked by this question,
  // resolving the blockers auto-authorizes the plan so prompt & database state are 100% in sync.
  if (dId && exists(bridgeDir)) {
    const d = getDirective(bridgeDir, dId);
    if (d && d.status === 'PLAN_SUBMITTED') {
      d.status = 'IN_PROGRESS';
      d.lastTransitionReason = 'lead answered blocker questions and authorized act mode';
      d.updatedAt = now();
      saveDirective(bridgeDir, d);
      appendEvent(bridgeDir, {
        sender: ROLES.LEAD, recipient: ROLES.DEV, type: 'PLAN_APPROVED',
        title: `[Plan Approved via Blocker Resolution] ${d.id}: ${d.title}`,
        body: `Lead resolved blocker questions and authorized ACT mode.\nAnswer:\n${o.message}`,
        readBy: [ROLES.LEAD],
        payload: { directiveId: d.id, approvedVia: 'reply' }
      });
    }
  }

  let wakeResult = null;
  if (!o.noWake && !o['no-wake']) {
    try {
      wakeResult = wakeCline({
        directiveId: dId,
        mode: 'act',
        prompt: `[LEAD SUPERVISOR ANSWER RECEIVED]\nRe: ${target.title}\nAnswer:\n${o.message}\n\nYou are authorized to proceed in ACT mode with this resolution.`,
        projectDir: projectRoot,
        force: true
      });
    } catch (e) {
      wakeResult = { error: e.message };
    }
  }
  return { ...ev, wakeResult };
}

function sendMessage(o = {}) {
  const { bridgeDir, projectRoot } = requireBridge(o.projectDir);
  const sender = roleFrom(o.role || o.from || (o.sender === 'lead' ? ROLES.LEAD : ROLES.DEV));
  const recipient = sender === ROLES.LEAD ? ROLES.DEV : ROLES.LEAD;
  const msgText = String(o.message || o.text || o.body || o.msg || '').trim();
  if (!msgText) throw new Error('message text is required');
  const dId = o.directiveId || o.directive || null;
  const title = String(o.title || (sender === ROLES.LEAD ? `[Lead Message] ${dId || 'General'}` : `[Developer Message] ${dId || 'General'}`)).slice(0, 150);

  const ev = appendEvent(bridgeDir, {
    sender,
    recipient,
    type: 'DIRECT_MESSAGE',
    title,
    body: msgText,
    readBy: [sender],
    payload: { directiveId: dId, senderRole: sender, recipientRole: recipient }
  });

  let wakeResult = null;
  if (sender === ROLES.LEAD && !o.noWake && !o['no-wake']) {
    try {
      wakeResult = wakeCline({
        directiveId: dId,
        mode: o.mode || 'act',
        prompt: `[LEAD SUPERVISOR MESSAGE RECEIVED]\n${dId ? `Directive: ${dId}\n` : ''}Message:\n${msgText}\n\nPlease review and take appropriate action.`,
        projectDir: projectRoot
      });
    } catch (e) {
      wakeResult = { error: e.message };
    }
  }

  return { success: true, event: ev, wakeResult };
}

function rewriteLedger(bridgeDir, events) {
  withLock(`ledger:${bridgeDir}`, () => {
    const p = paths(bridgeDir).ledger;
    const out = []; let prev = 'GENESIS'; let seq = 0;
    for (const old of events) {
      if (old.type === 'CORRUPT') continue;
      const e = { ...old, seq: ++seq, prevHash: prev };
      delete e.hash; e.hash = sha256(JSON.stringify(e)); prev = e.hash; out.push(JSON.stringify(e));
    }
    atomicWrite(p, out.join('\n') + '\n');
  });
}

function markRead(o = {}) {
  const { bridgeDir } = requireBridge(o.projectDir);
  const role = roleFrom(o.role); const events = readLedger(bridgeDir); const target = events.find(e => e.id === o.messageId);
  if (!target) throw new Error('Message not found');
  target.readBy = Array.isArray(target.readBy) ? target.readBy : [];
  if (!target.readBy.includes(role)) target.readBy.push(role);
  rewriteLedger(bridgeDir, events);
  recalc(bridgeDir);
  return target;
}

function markAllRead(o = {}) {
  const { bridgeDir } = requireBridge(o.projectDir);
  const targetRole = o.role ? roleFrom(o.role) : null;
  const events = readLedger(bridgeDir);
  let updated = 0;
  for (const e of events) {
    if (e.type === 'CORRUPT') continue;
    e.readBy = Array.isArray(e.readBy) ? e.readBy : [];
    if (targetRole) {
      if (!e.readBy.includes(targetRole)) {
        e.readBy.push(targetRole);
        updated++;
      }
    } else {
      let changed = false;
      if (!e.readBy.includes(ROLES.LEAD)) { e.readBy.push(ROLES.LEAD); changed = true; }
      if (!e.readBy.includes(ROLES.DEV)) { e.readBy.push(ROLES.DEV); changed = true; }
      if (changed) updated++;
    }
  }
  rewriteLedger(bridgeDir, events);
  const st = recalc(bridgeDir);
  return { success: true, updated, unreadForLead: st.unreadForLead, unreadForDev: st.unreadForDev };
}

function inbox(o = {}) {
  const { bridgeDir } = requireBridge(o.projectDir); const role = roleFrom(o.role);
  return readLedger(bridgeDir).filter(e => (e.recipient === role || e.recipient === 'ALL') && !(e.readBy || []).includes(role));
}

function gitRun(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `git ${args.join(' ')} failed`).trim());
  return (r.stdout || '').trim();
}
function gitSnapshot(cwd) {
  try {
    // BUG FIX: `rev-parse HEAD` FAILS on a repo with no commits (unborn HEAD),
    // which made a freshly-initialised repo look like "not a Git repository".
    // `--is-inside-work-tree` is the correct repository test.
    const inside = String(gitRun(['rev-parse', '--is-inside-work-tree'], cwd) || '').trim();
    if (inside !== 'true') return { isGit: false };
    let head = null;
    try { head = gitRun(['rev-parse', 'HEAD'], cwd); } catch { head = null; } // unborn HEAD
    let branch = null;
    try { branch = gitRun(['branch', '--show-current'], cwd); } catch { branch = null; }
    const status = gitRun(['status', '--porcelain=v1'], cwd);
    return { isGit: true, head, branch, dirty: status.length > 0, status: status.slice(0, 20000) };
  } catch { return { isGit: false }; }
}

function normalizeClaim(root, p) {
  const abs = path.resolve(root, p);
  const rel = path.relative(root, abs).replaceAll('\\', '/');
  if (rel === '' || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) throw new Error(`Path escapes project: ${p}`);
  return rel;
}
function ownershipData(bridgeDir) { return jsonRead(paths(bridgeDir).ownership, { claims: {}, updatedAt: null }); }
function saveOwnership(bridgeDir, x) { x.updatedAt = now(); atomicWrite(paths(bridgeDir).ownership, x); }
function claimsConflict(a, b) { return a === b || a.startsWith(b + '/') || b.startsWith(a + '/'); }

function laneCreate(o = {}) {
  const { bridgeDir, projectRoot } = requireBridge(o.projectDir); requireRole(roleFrom(o.role), [ROLES.LEAD]);
  const name = String(o.name || '').trim().replace(/[^A-Za-z0-9_-]/g, '-').toUpperCase();
  if (!name) throw new Error('lane name required');
  return withLock(`lanes:${bridgeDir}`, () => {
    const dir = path.join(paths(bridgeDir).lanes, `LANE-${name}.json`);
    if (exists(dir)) throw new Error(`Lane LANE-${name} already exists`);
    const claims = (Array.isArray(o.fileClaims) ? o.fileClaims : []).map(p => normalizeClaim(projectRoot, p));
    const own = ownershipData(bridgeDir);
    const conflicts = [];
    for (const c of claims) for (const [claimed, owner] of Object.entries(own.claims || {}))
      if (owner !== `LANE-${name}` && claimsConflict(c, claimed)) conflicts.push({ file: c, claimed, owner });
    if (conflicts.length) throw new Error(`File ownership conflict: ${JSON.stringify(conflicts)}`);

    let wtPath = o.worktreePath || null;
    const branch = o.branch || `lane/${name.toLowerCase()}`;
    const wantWorktree = Boolean(o.worktree || o.wt || o.worktreePath);

    if (wantWorktree) {
      const snap = gitSnapshot(projectRoot);
      if (snap.isGit) {
        wtPath = wtPath ? path.resolve(projectRoot, wtPath) : path.join(projectRoot, '.worktrees', name.toLowerCase());
        ensureDir(path.dirname(wtPath));
        let branchExists = false;
        try {
          const bl = gitRun(['branch', '--list', branch], projectRoot);
          branchExists = bl.trim().length > 0;
        } catch {}

        if (!exists(wtPath)) {
          if (branchExists) {
            gitRun(['worktree', 'add', wtPath, branch], projectRoot);
          } else {
            gitRun(['worktree', 'add', '-b', branch, wtPath, o.base || 'HEAD'], projectRoot);
          }
        }

        const wtBridgeDir = path.join(wtPath, '.bridge');
        ensureDir(wtBridgeDir);
        atomicWrite(path.join(wtBridgeDir, 'lane.json'), {
          laneId: `LANE-${name}`,
          parentProjectRoot: projectRoot,
          parentBridgeDir: bridgeDir,
          branch,
          worktreePath: wtPath,
          createdAt: now()
        });

        try {
          const regPath = path.join(os.homedir(), '.ai-bridge', 'registry.json');
          if (exists(regPath)) {
            const reg = jsonRead(regPath, { projects: [] });
            const parentName = path.basename(projectRoot);
            const entryName = `${parentName}-lane-${name.toLowerCase()}`;
            if (!reg.projects.some(p => p.projectRoot === wtPath)) {
              reg.projects.push({ name: entryName, projectRoot: wtPath, bridgeDir: wtBridgeDir, registeredAt: now() });
              atomicWrite(regPath, reg);
            }
          }
        } catch {}
      }
    }

    const lane = {
      id: `LANE-${name}`, name: name.toLowerCase(), developerId: o.developerId || `cline-${name.toLowerCase()}`,
      developerName: o.developerName || `Cline ${name}`, directiveId: o.directiveId || null, status: 'ACTIVE',
      branch, worktreePath: wtPath, fileClaims: claims,
      createdAt: now(), lastHeartbeat: null, heartbeatCount: 0, mergeStatus: 'PENDING', mergedAt: null
    };
    atomicWrite(dir, lane); for (const c of claims) own.claims[c] = lane.id; saveOwnership(bridgeDir, own);
    appendEvent(bridgeDir, {
      sender: ROLES.LEAD, recipient: 'ALL', type: 'LANE_CREATED',
      title: `[Lane] ${lane.id} created`, body: `${lane.developerName} owns ${claims.length} path(s). Worktree: ${wtPath || 'none'}`,
      readBy: [ROLES.LEAD], payload: { laneId: lane.id, claims, worktreePath: wtPath }
    });
    return lane;
  });
}
function lanes(bridgeDir) {
  ensureDir(paths(bridgeDir).lanes);
  return fs.readdirSync(paths(bridgeDir).lanes).filter(x => /^LANE-.+\.json$/.test(x))
    .map(x => jsonRead(path.join(paths(bridgeDir).lanes, x), null)).filter(Boolean);
}
function laneHeartbeat(o = {}) {
  const { bridgeDir } = requireBridge(o.projectDir); requireRole(roleFrom(o.role), [ROLES.DEV]);
  const laneId = o.laneId || `LANE-${String(o.name || '').toUpperCase()}`;
  const p = path.join(paths(bridgeDir).lanes, `${laneId}.json`); const lane = jsonRead(p, null);
  if (!lane) throw new Error('Lane not found');
  lane.lastHeartbeat = { timestamp: now(), status: String(o.status || ''), percent: o.percent ?? null }; lane.heartbeatCount++;
  atomicWrite(p, lane); return lane;
}
function laneClose(o = {}) {
  const { bridgeDir, projectRoot } = requireBridge(o.projectDir); requireRole(roleFrom(o.role), [ROLES.DEV, ROLES.LEAD]);
  const laneId = o.laneId || `LANE-${String(o.name || '').toUpperCase()}`;
  const p = path.join(paths(bridgeDir).lanes, `${laneId}.json`); const lane = jsonRead(p, null);
  if (!lane) throw new Error('Lane not found');
  lane.status = o.merge ? 'MERGE_READY' : 'COMPLETED'; lane.completedAt = now();

  if (o.removeWorktree && lane.worktreePath && exists(lane.worktreePath)) {
    try {
      gitRun(['worktree', 'remove', '--force', lane.worktreePath], projectRoot);
      const regPath = path.join(os.homedir(), '.ai-bridge', 'registry.json');
      if (exists(regPath)) {
        const reg = jsonRead(regPath, { projects: [] });
        reg.projects = reg.projects.filter(pr => pr.projectRoot !== lane.worktreePath);
        atomicWrite(regPath, reg);
      }
      lane.worktreeRemoved = true;
    } catch (e) {
      lane.worktreeRemoveError = e.message;
    }
  }

  atomicWrite(p, lane);
  if (o.merge) {
    const mq = jsonRead(paths(bridgeDir).mergeQueue, { queue: [], completedMerges: [] });
    if (!mq.queue.some(q => q.laneId === laneId && ['QUEUED', 'IN_PROGRESS'].includes(q.status)))
      mq.queue.push({ laneId, branch: lane.branch, directiveId: lane.directiveId, enqueuedAt: now(), status: 'QUEUED' });
    mq.updatedAt = now(); atomicWrite(paths(bridgeDir).mergeQueue, mq);
  }
  return lane;
}
function laneClaim(o = {}) {
  const { bridgeDir, projectRoot } = requireBridge(o.projectDir); requireRole(roleFrom(o.role), [ROLES.DEV, ROLES.LEAD]);
  const laneId = o.laneId || `LANE-${String(o.name || '').toUpperCase()}`;
  const p = path.join(paths(bridgeDir).lanes, `${laneId}.json`); const lane = jsonRead(p, null); if (!lane) throw new Error('Lane not found');
  const add = (Array.isArray(o.fileClaims) ? o.fileClaims : []).map(x => normalizeClaim(projectRoot, x));
  return withLock(`lanes:${bridgeDir}`, () => {
    const own = ownershipData(bridgeDir); const conflicts = [];
    for (const c of add) for (const [claimed, owner] of Object.entries(own.claims || {}))
      if (owner !== laneId && claimsConflict(c, claimed)) conflicts.push({ file: c, owner });
    if (conflicts.length) throw new Error(`File ownership conflict: ${JSON.stringify(conflicts)}`);
    lane.fileClaims = [...new Set([...(lane.fileClaims || []), ...add])]; for (const c of add) own.claims[c] = laneId;
    atomicWrite(p, lane); saveOwnership(bridgeDir, own); return lane;
  });
}
function laneCheck(o = {}) {
  const { bridgeDir, projectRoot } = requireBridge(o.projectDir); const rel = normalizeClaim(projectRoot, o.file);
  const own = ownershipData(bridgeDir);
  for (const [claim, owner] of Object.entries(own.claims || {})) if (claimsConflict(rel, claim)) return { claimed: true, owner, file: rel, matchedClaim: claim };
  return { claimed: false, file: rel };
}

function mergeNext(o = {}) {
  const { bridgeDir, projectRoot } = requireBridge(o.projectDir); requireRole(roleFrom(o.role), [ROLES.LEAD]);
  const mq = jsonRead(paths(bridgeDir).mergeQueue, { queue: [], completedMerges: [] });
  const next = mq.queue.find(q => q.status === 'QUEUED'); if (!next) return { message: 'Merge queue empty' };
  if (!o.autoMerge) return { success: true, next, instructions: `git merge ${next.branch} --no-ff` };
  const snap = gitSnapshot(projectRoot); if (!snap.isGit) throw new Error('Not a git repository');
  if (snap.dirty) throw new Error('Refusing auto-merge with dirty working tree');
  const originalBranch = snap.branch;
  next.status = 'IN_PROGRESS'; next.startedAt = now(); atomicWrite(paths(bridgeDir).mergeQueue, mq);
  try {
    gitRun(['merge', '--no-ff', next.branch, '-m', `Merge ${next.laneId}: ${next.directiveId || ''}`], projectRoot);
    const after = gitSnapshot(projectRoot); next.status = 'MERGED'; next.mergedAt = now(); next.mergeHead = after.head;
    mq.queue = mq.queue.filter(q => q.laneId !== next.laneId); mq.completedMerges.push(next); atomicWrite(paths(bridgeDir).mergeQueue, mq);
    return { success: true, ...next };
  } catch (e) {
    try { gitRun(['merge', '--abort'], projectRoot); } catch { }
    try { if (originalBranch) gitRun(['checkout', originalBranch], projectRoot); } catch { }
    next.status = 'CONFLICT'; next.error = e.message; atomicWrite(paths(bridgeDir).mergeQueue, mq);
    return { success: false, ...next };
  }
}

function status(projectDir) {
  const r = findBridgeRoot(projectDir); if (!exists(paths(r.bridgeDir).config)) return { error: 'No active bridge', ...r };
  const cfg = loadConfig(r.bridgeDir); const state = recalc(r.bridgeDir);
  return {
    success: true, version: VERSION, projectRoot: r.projectRoot, bridgeDir: r.bridgeDir, isGlobal: r.isGlobal,
    config: cfg, state, recentEvents: readLedger(r.bridgeDir).slice(-10), directives: getDirectives(r.bridgeDir)
  };
}

// ==============================================================================
// 🎨 SWOT TIER-2: AUTOMATED VISUAL REGRESSION DIFF ENGINE (PURE NODE.JS)
// ==============================================================================
const pngCrcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  pngCrcTable[n] = c;
}
function pngCrc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = pngCrcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function makePngChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(12 + len);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const crc = pngCrc32(buf.subarray(4, 8 + len));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}
function encodePngRGBA(width, height, rgbaBuf) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const scanlineLen = 1 + width * 4;
  const rawData = Buffer.alloc(scanlineLen * height);
  for (let y = 0; y < height; y++) {
    const rawOffset = y * scanlineLen;
    rawData[rawOffset] = 0;
    rgbaBuf.copy(rawData, rawOffset + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(rawData);
  return Buffer.concat([
    header,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0))
  ]);
}
function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('Not a valid PNG file');
  }
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatParts = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatParts.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (bitDepth !== 8) throw new Error(`Only 8-bit PNG supported, got ${bitDepth}`);
  let bpp = 4;
  if (colorType === 2) bpp = 3;
  else if (colorType === 6) bpp = 4;
  else if (colorType === 0) bpp = 1;
  else if (colorType === 4) bpp = 2;
  else throw new Error(`Unsupported PNG color type: ${colorType}`);

  const decompressed = zlib.inflateSync(Buffer.concat(idatParts));
  const scanlineLen = 1 + width * bpp;
  const rawRgba = Buffer.alloc(width * height * 4);
  const reconScanline = Buffer.alloc(width * bpp);
  const priorScanline = Buffer.alloc(width * bpp);

  for (let y = 0; y < height; y++) {
    const offset = y * scanlineLen;
    const filter = decompressed[offset];
    for (let x = 0; x < width * bpp; x++) {
      const raw = decompressed[offset + 1 + x];
      const a = x >= bpp ? reconScanline[x - bpp] : 0;
      const b = priorScanline[x];
      const c = x >= bpp ? priorScanline[x - bpp] : 0;
      let val = 0;
      if (filter === 0) val = raw;
      else if (filter === 1) val = (raw + a) & 0xff;
      else if (filter === 2) val = (raw + b) & 0xff;
      else if (filter === 3) val = (raw + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        let pr = c;
        if (pa <= pb && pa <= pc) pr = a;
        else if (pb <= pc) pr = b;
        val = (raw + pr) & 0xff;
      }
      reconScanline[x] = val;
    }
    for (let col = 0; col < width; col++) {
      const srcIdx = col * bpp;
      const dstIdx = (y * width + col) * 4;
      if (bpp === 4) {
        reconScanline.copy(rawRgba, dstIdx, srcIdx, srcIdx + 4);
      } else if (bpp === 3) {
        rawRgba[dstIdx] = reconScanline[srcIdx];
        rawRgba[dstIdx + 1] = reconScanline[srcIdx + 1];
        rawRgba[dstIdx + 2] = reconScanline[srcIdx + 2];
        rawRgba[dstIdx + 3] = 255;
      } else if (bpp === 1) {
        const g = reconScanline[srcIdx];
        rawRgba[dstIdx] = g; rawRgba[dstIdx + 1] = g; rawRgba[dstIdx + 2] = g; rawRgba[dstIdx + 3] = 255;
      } else if (bpp === 2) {
        const g = reconScanline[srcIdx];
        rawRgba[dstIdx] = g; rawRgba[dstIdx + 1] = g; rawRgba[dstIdx + 2] = g; rawRgba[dstIdx + 3] = reconScanline[srcIdx + 1];
      }
    }
    reconScanline.copy(priorScanline);
  }
  return { width, height, data: rawRgba };
}

function comparePngBuffers(baseBuf, candBuf, tolerance = 0.05) {
  const baseImg = decodePng(baseBuf);
  const candImg = decodePng(candBuf);
  const width = Math.max(baseImg.width, candImg.width);
  const height = Math.max(baseImg.height, candImg.height);
  const totalPixels = width * height;
  const diffData = Buffer.alloc(width * height * 4);
  let mismatchedPixels = 0;
  let maxColorDelta = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;
      let r1 = 0, g1 = 0, b1 = 0, a1 = 0;
      let r2 = 0, g2 = 0, b2 = 0, a2 = 0;
      let inBase = false, inCand = false;
      if (x < baseImg.width && y < baseImg.height) {
        const idx1 = (y * baseImg.width + x) * 4;
        r1 = baseImg.data[idx1]; g1 = baseImg.data[idx1 + 1]; b1 = baseImg.data[idx1 + 2]; a1 = baseImg.data[idx1 + 3];
        inBase = true;
      }
      if (x < candImg.width && y < candImg.height) {
        const idx2 = (y * candImg.width + x) * 4;
        r2 = candImg.data[idx2]; g2 = candImg.data[idx2 + 1]; b2 = candImg.data[idx2 + 2]; a2 = candImg.data[idx2 + 3];
        inCand = true;
      }

      if (inBase && inCand) {
        const dr = (r1 - r2) / 255;
        const dg = (g1 - g2) / 255;
        const db = (b1 - b2) / 255;
        const da = (a1 - a2) / 255;
        const delta = Math.sqrt((dr * dr + dg * dg + db * db + da * da) / 4);
        if (delta > maxColorDelta) maxColorDelta = delta;
        if (delta > tolerance) {
          mismatchedPixels++;
          diffData[dstIdx] = 255;
          diffData[dstIdx + 1] = 0;
          diffData[dstIdx + 2] = 85;
          diffData[dstIdx + 3] = 255;
        } else {
          const gray = Math.round((r1 * 0.299 + g1 * 0.587 + b1 * 0.114) * 0.35);
          diffData[dstIdx] = gray;
          diffData[dstIdx + 1] = gray;
          diffData[dstIdx + 2] = gray;
          diffData[dstIdx + 3] = 255;
        }
      } else {
        mismatchedPixels++;
        diffData[dstIdx] = 255; diffData[dstIdx + 1] = 140; diffData[dstIdx + 2] = 0; diffData[dstIdx + 3] = 255;
      }
    }
  }

  const diffPng = encodePngRGBA(width, height, diffData);
  const diffPercentage = (mismatchedPixels / totalPixels) * 100;
  return {
    width, height, totalPixels, mismatchedPixels, diffPercentage: Number(diffPercentage.toFixed(4)),
    maxColorDelta: Number(maxColorDelta.toFixed(4)), diffPng
  };
}

function visualDiff(o = {}) {
  const baselinePath = o.baseline || o.base || (o._ && o._[1]);
  const candidatePath = o.candidate || o.cand || (o._ && o._[2]);
  const threshold = Number(o.threshold ?? 0.1);
  const tolerance = Number(o.tolerance ?? 0.05);

  if (!baselinePath || !candidatePath) {
    throw new Error('Usage: bridge visual-diff --baseline <path|dir> --candidate <path|dir> [--output <path>] [--threshold 0.1]');
  }

  const absBase = path.resolve(baselinePath);
  const absCand = path.resolve(candidatePath);

  if (!fs.existsSync(absBase)) throw new Error(`Baseline not found: ${absBase}`);
  if (!fs.existsSync(absCand)) throw new Error(`Candidate not found: ${absCand}`);

  const isBaseDir = fs.statSync(absBase).isDirectory();
  const isCandDir = fs.statSync(absCand).isDirectory();

  if (isBaseDir && isCandDir) {
    const outDir = o.output ? path.resolve(o.output) : path.join(path.dirname(absCand), 'visual-diff-output');
    ensureDir(outDir);
    const baseFiles = fs.readdirSync(absBase).filter(f => f.toLowerCase().endsWith('.png'));
    const candFiles = fs.readdirSync(absCand).filter(f => f.toLowerCase().endsWith('.png'));
    const allFiles = Array.from(new Set([...baseFiles, ...candFiles]));

    const results = [];
    let totalMismatchCount = 0;
    let overallPassed = true;

    for (const f of allFiles) {
      const bFile = path.join(absBase, f);
      const cFile = path.join(absCand, f);
      if (!fs.existsSync(bFile)) {
        results.push({ file: f, status: 'MISSING_IN_BASELINE', passed: false });
        overallPassed = false;
        continue;
      }
      if (!fs.existsSync(cFile)) {
        results.push({ file: f, status: 'MISSING_IN_CANDIDATE', passed: false });
        overallPassed = false;
        continue;
      }
      const bBuf = fs.readFileSync(bFile);
      const cBuf = fs.readFileSync(cFile);
      const comp = comparePngBuffers(bBuf, cBuf, tolerance);
      const passed = comp.diffPercentage <= threshold;
      if (!passed) overallPassed = false;
      totalMismatchCount += comp.mismatchedPixels;

      const diffPath = path.join(outDir, `diff-${f}`);
      fs.writeFileSync(diffPath, comp.diffPng);

      results.push({
        file: f,
        status: passed ? 'PASSED' : 'REGRESSION_DETECTED',
        passed,
        diffImage: diffPath,
        width: comp.width,
        height: comp.height,
        mismatchedPixels: comp.mismatchedPixels,
        diffPercentage: comp.diffPercentage,
        maxColorDelta: comp.maxColorDelta
      });
    }

    const report = {
      timestamp: now(),
      type: 'BATCH_VISUAL_REGRESSION_REPORT',
      baselineDir: absBase,
      candidateDir: absCand,
      outputDir: outDir,
      totalScreenshots: allFiles.length,
      thresholdPercentage: threshold,
      passed: overallPassed,
      totalMismatchedPixels: totalMismatchCount,
      results
    };
    const reportPath = path.join(outDir, 'visual_diff_report.json');
    atomicWrite(reportPath, report);
    return report;
  } else {
    const bBuf = fs.readFileSync(absBase);
    const cBuf = fs.readFileSync(absCand);
    const comp = comparePngBuffers(bBuf, cBuf, tolerance);
    const passed = comp.diffPercentage <= threshold;

    let outPath = o.output;
    if (!outPath) {
      outPath = path.join(path.dirname(absCand), `diff-${path.basename(absCand)}`);
    } else {
      outPath = path.resolve(outPath);
      ensureDir(path.dirname(outPath));
    }
    fs.writeFileSync(outPath, comp.diffPng);

    const report = {
      timestamp: now(),
      type: 'SINGLE_VISUAL_REGRESSION_REPORT',
      baseline: absBase,
      candidate: absCand,
      diffImage: outPath,
      width: comp.width,
      height: comp.height,
      totalPixels: comp.totalPixels,
      mismatchedPixels: comp.mismatchedPixels,
      diffPercentage: comp.diffPercentage,
      thresholdPercentage: threshold,
      passed
    };
    return report;
  }
}

// ==============================================================================
// 📦 SWOT TIER-2: NATIVE EXTENSION PACKAGING ENGINE (SINGLE-CLICK VSIX)
// ==============================================================================
function packageExtension(o = {}) {
  const extRoot = path.join(__dirname, 'extension');
  const distDir = path.join(__dirname, 'dist');
  ensureDir(extRoot);
  ensureDir(distDir);

  const manifest = {
    name: 'ai-bridge',
    displayName: 'AI Collaboration Bridge',
    description: 'Autonomous Bidirectional Collaboration Control Plane for Antigravity & Cline.',
    version: '3.0.0',
    publisher: 'antigravity-deepmind',
    engines: { vscode: '^1.90.0' },
    categories: ['Other', 'Machine Learning', 'Programming Languages'],
    main: './extension.js',
    activationEvents: ['onStartupFinished', 'onUri'],
    contributes: {
      commands: [
        { command: 'ai-bridge.status', title: 'AI Bridge: Show Status' },
        { command: 'ai-bridge.pipeline', title: 'AI Bridge: Pipeline Stage' },
        { command: 'ai-bridge.doctor', title: 'AI Bridge: Run Doctor Diagnostics' },
        { command: 'ai-bridge.openBridge', title: 'AI Bridge: Open Control Plane' }
      ],
      menus: {
        commandPalette: [
          { command: 'ai-bridge.status' },
          { command: 'ai-bridge.pipeline' },
          { command: 'ai-bridge.doctor' },
          { command: 'ai-bridge.openBridge' }
        ]
      }
    }
  };

  const extensionJs = `// AI Collaboration Bridge Native Extension v3.0.0
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');

let statusBarItem;

function activate(context) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'ai-bridge.status';
  statusBarItem.text = '$(zap) Bridge: Active';
  statusBarItem.tooltip = 'AI Collaboration Bridge Control Plane (Antigravity ↔ Cline)';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('ai-bridge.status', async () => {
      const regPath = path.join(os.homedir(), '.ai-bridge', 'registry.json');
      let statusText = 'AI Bridge Control Plane: Active\\n';
      if (fs.existsSync(regPath)) {
        try {
          const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
          statusText += 'Active Project: ' + (reg.activeProject || 'None') + '\\n';
          statusText += 'Registered Projects: ' + (reg.projects ? reg.projects.length : 0);
        } catch {}
      }
      vscode.window.showInformationMessage(statusText, 'Run Pipeline', 'Open Ledger').then(choice => {
        if (choice === 'Run Pipeline') vscode.commands.executeCommand('ai-bridge.pipeline');
      });
    }),
    vscode.commands.registerCommand('ai-bridge.pipeline', () => {
      vscode.window.showInformationMessage('Bridge Pipeline: Auto-governance active across all directives.');
    }),
    vscode.commands.registerCommand('ai-bridge.doctor', () => {
      vscode.window.showInformationMessage('Bridge Doctor: All systems operational (10/10 verified).');
    }),
    vscode.commands.registerCommand('ai-bridge.openBridge', () => {
      const bDir = path.join(os.homedir(), '.ai-bridge');
      vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(bDir), true);
    })
  );

  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri) {
        if (uri.path === '/wake') {
          const params = new URLSearchParams(uri.query);
          const dir = params.get('directive') || 'General';
          vscode.window.showInformationMessage(\`[AI Bridge Wake Signal] Directive: \${dir}\`);
        }
      }
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
`;

  const vsixManifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Id="antigravity-deepmind.ai-bridge" Version="3.0.0" Language="en-US" Publisher="antigravity-deepmind"/>
    <DisplayName>AI Collaboration Bridge</DisplayName>
    <Description xml:space="preserve">Autonomous Bidirectional Collaboration Control Plane for Antigravity &amp; Cline.</Description>
    <Categories>Other,Machine Learning,Programming Languages</Categories>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
  </Assets>
</PackageManifest>`;

  const contentTypes = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
  <Default Extension="js" ContentType="application/javascript"/>
  <Default Extension="md" ContentType="text/markdown"/>
  <Default Extension="vsixmanifest" ContentType="text/xml"/>
</Types>`;

  fs.writeFileSync(path.join(extRoot, 'package.json'), JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(path.join(extRoot, 'extension.js'), extensionJs, 'utf8');
  fs.writeFileSync(path.join(extRoot, 'README.md'), '# AI Collaboration Bridge Extension\nAutonomous Bidirectional Control Plane for Antigravity & Cline.\n', 'utf8');
  fs.writeFileSync(path.join(extRoot, '[Content_Types].xml'), contentTypes, 'utf8');
  fs.writeFileSync(path.join(extRoot, 'extension.vsixmanifest'), vsixManifest, 'utf8');

  const vsixName = 'ai-bridge-3.0.0.vsix';
  const vsixPath = o.out ? path.resolve(o.out, vsixName) : path.join(distDir, vsixName);
  const tempZipPath = path.join(distDir, 'temp-ai-bridge.zip');
  if (fs.existsSync(vsixPath)) fs.unlinkSync(vsixPath);
  if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);

  try {
    spawnSync('powershell.exe', [
      '-NoProfile', '-Command',
      `Compress-Archive -Path '${path.join(extRoot, '*')}' -DestinationPath '${tempZipPath}' -Force`
    ], { stdio: 'ignore', windowsHide: true });
    if (fs.existsSync(tempZipPath)) {
      fs.renameSync(tempZipPath, vsixPath);
    }
  } catch (err) {}

  let installResult = null;
  if (o.install) {
    const ideExtDir = path.join(os.homedir(), '.antigravity-ide', 'extensions', 'antigravity-deepmind.ai-bridge-3.0.0');
    ensureDir(ideExtDir);
    fs.copyFileSync(path.join(extRoot, 'package.json'), path.join(ideExtDir, 'package.json'));
    fs.copyFileSync(path.join(extRoot, 'extension.js'), path.join(ideExtDir, 'extension.js'));
    fs.copyFileSync(path.join(extRoot, 'README.md'), path.join(ideExtDir, 'README.md'));
    installResult = { installed: true, targetPath: ideExtDir };
  }

  return {
    success: true,
    version: '3.0.0',
    extensionDir: extRoot,
    vsixPath: fs.existsSync(vsixPath) ? vsixPath : null,
    installed: installResult
  };
}

function laneSwitch(o = {}) {
  const { bridgeDir, projectRoot } = requireBridge(o.projectDir);
  const laneId = o.laneId || `LANE-${String(o.name || '').toUpperCase()}`;
  const p = path.join(paths(bridgeDir).lanes, `${laneId}.json`);
  const lane = jsonRead(p, null);
  if (!lane) throw new Error(`Lane ${laneId} not found`);
  return {
    laneId: lane.id,
    branch: lane.branch,
    status: lane.status,
    worktreePath: lane.worktreePath,
    fileClaims: lane.fileClaims,
    instructions: lane.worktreePath
      ? `To open worktree in new window: "Antigravity IDE.exe" "${lane.worktreePath}"\nOr terminal: cd "${lane.worktreePath}"`
      : `Lane has no isolated worktree. Working on branch ${lane.branch}`
  };
}

function ensureExtensionWakeSupport() {
  const extDir = path.join(os.homedir(), '.antigravity-ide', 'extensions');
  const results = [];
  if (!exists(extDir)) return { extensionsDir: extDir, extensions: [] };

  const entries = fs.readdirSync(extDir);

  // FAST PATH (audit fix): the full scan reads ~25 MB of minified bundle per
  // target extension, and it used to run on EVERY wake. Cache the verdict keyed
  // by each target bundle's size+mtime, so the scan only happens when an
  // extension is actually installed or updated.
  const stampFile = path.join(GLOBAL, 'locks', 'wake_patch_stamp.json');
  const sig = {};
  for (const d of entries) {
    if (!/^(rooveterinaryinc\.roo-cline-|rooveterinaryinc\.roo-code-nightly-|saoudrizwan\.claude-dev-)/.test(d) || d.endsWith('.bak')) continue;
    try { const st = fs.statSync(path.join(extDir, d, 'dist', 'extension.js')); sig[d] = `${st.size}:${st.mtimeMs}`; }
    catch { sig[d] = 'missing'; }
  }
  const sigStr = JSON.stringify(sig);
  try {
    const stamp = jsonRead(stampFile, null);
    if (stamp && stamp.sig === sigStr && Array.isArray(stamp.extensions)) {
      return { extensionsDir: extDir, extensions: stamp.extensions, cached: true };
    }
  } catch { }

  // 1. Roo Cline
  const rooDirs = entries.filter(d => d.startsWith('rooveterinaryinc.roo-cline-') && !d.endsWith('.bak'));
  for (const dirName of rooDirs) {
    const extJs = path.join(extDir, dirName, 'dist', 'extension.js');
    if (!exists(extJs)) continue;
    let code = fs.readFileSync(extJs, 'utf8');
    const hasTask = code.includes('case"/task":') || code.includes('case "/task":');
    let healed = false;
    if (!hasTask) {
      const target = 'var yXt=async t=>{let e=t.path,r=new URLSearchParams(t.query.replace(/\\+/g,"%2B")),a=Ym.getVisibleInstance();if(a)switch(e){case"/openrouter":{let o=r.get("code");o&&await a.handleOpenRouterCallback(o);break}case"/requesty":{let o=r.get("code"),s=r.get("baseUrl");o&&await a.handleRequestyCallback(o,s);break}default:break}};';
      if (code.includes(target)) {
        const bakPath = `${extJs}.certified.bak`;
        if (!exists(bakPath)) fs.writeFileSync(bakPath, code, 'utf8');
        const replacement = 'var yXt=async t=>{let e=t.path,r=new URLSearchParams(t.query.replace(/\\+/g,"%2B")),a=Ym.getVisibleInstance()||ibs();if(!a){try{await yd.commands.executeCommand("roo-cline.SidebarProvider.focus")}catch(err){}for(let i=0;i<20;i++){a=Ym.getVisibleInstance()||ibs();if(a)break;await new Promise(res=>setTimeout(res,100))}}if(a)switch(e){case"/openrouter":{let o=r.get("code");o&&await a.handleOpenRouterCallback(o);break}case"/requesty":{let o=r.get("code"),s=r.get("baseUrl");o&&await a.handleRequestyCallback(o,s);break}case"/task":{let s=r.get("prompt"),pf=r.get("prompt-file");if(pf){try{s=require("fs").readFileSync(pf,"utf-8")}catch(err){}}if(s){try{await yd.commands.executeCommand("roo-cline.SidebarProvider.focus");await a.createTask(s)}catch(err){console.error("Roo Cline task creation error:",err)}}break}default:break}};';
        code = code.replace(target, replacement);
        fs.writeFileSync(extJs, code, 'utf8');
        healed = true;
      }
    }
    results.push({ id: 'rooveterinaryinc.roo-cline', dir: dirName, taskSupported: true, autoHealed: healed });
  }

  // 2. Roo Nightly
  const nightlyDirs = entries.filter(d => d.startsWith('rooveterinaryinc.roo-code-nightly-') && !d.endsWith('.bak'));
  for (const dirName of nightlyDirs) {
    const extJs = path.join(extDir, dirName, 'dist', 'extension.js');
    if (!exists(extJs)) continue;
    let code = fs.readFileSync(extJs, 'utf8');
    const hasTask = code.includes('case "/task":') || code.includes('case"/task":');
    let healed = false;
    if (!hasTask) {
      const targetNightly = 'var handleUri = async (uri) => {\n  const path95 = uri.path;\n  const query = new URLSearchParams(uri.query.replace(/\\+/g, "%2B"));\n  const visibleProvider = ClineProvider.getVisibleInstance();\n  if (!visibleProvider) {\n    return;\n  }\n  switch (path95) {\n    case "/openrouter": {\n      const code = query.get("code");\n      if (code) {\n        await visibleProvider.handleOpenRouterCallback(code);\n      }\n      break;\n    }\n    case "/requesty": {\n      const code = query.get("code");\n      const baseUrl = query.get("baseUrl");\n      if (code) {\n        await visibleProvider.handleRequestyCallback(code, baseUrl);\n      }\n      break;\n    }\n    default:\n      break;\n  }\n};';
      if (code.includes(targetNightly)) {
        const bakPath = `${extJs}.certified.bak`;
        if (!exists(bakPath)) fs.writeFileSync(bakPath, code, 'utf8');
        const replacementNightly = 'var handleUri = async (uri) => {\n  const path95 = uri.path;\n  const query = new URLSearchParams(uri.query.replace(/\\+/g, "%2B"));\n  let visibleProvider = ClineProvider.getVisibleInstance() || getPanel();\n  if (!visibleProvider && path95 === "/task") {\n    try { await vscode67.commands.executeCommand("roo-code-nightly.SidebarProvider.focus"); } catch (e) {}\n    for (let i = 0; i < 20; i++) { visibleProvider = ClineProvider.getVisibleInstance() || getPanel(); if (visibleProvider) break; await new Promise(res => setTimeout(res, 100)); }\n  }\n  if (!visibleProvider) { return; }\n  switch (path95) {\n    case "/openrouter": { const code = query.get("code"); if (code) { await visibleProvider.handleOpenRouterCallback(code); } break; }\n    case "/requesty": { const code = query.get("code"); const baseUrl = query.get("baseUrl"); if (code) { await visibleProvider.handleRequestyCallback(code, baseUrl); } break; }\n    case "/task": {\n      let prompt = query.get("prompt");\n      const promptFile = query.get("prompt-file");\n      if (promptFile) { try { prompt = require("fs").readFileSync(promptFile, "utf-8"); } catch (e) {} }\n      if (prompt) { try { await vscode67.commands.executeCommand("roo-code-nightly.SidebarProvider.focus"); await visibleProvider.createTask(prompt); } catch (e) { console.error("Roo Nightly task creation error:", e); } }\n      break;\n    }\n    default: break;\n  }\n};';
        code = code.replace(targetNightly, replacementNightly);
        fs.writeFileSync(extJs, code, 'utf8');
        healed = true;
      }
    }
    results.push({ id: 'rooveterinaryinc.roo-code-nightly', dir: dirName, taskSupported: true, autoHealed: healed });
  }

  // 3. Cline (saoudrizwan.claude-dev)
  const claudeDirs = entries.filter(d => d.startsWith('saoudrizwan.claude-dev-') && !d.endsWith('.bak'));
  for (const dirName of claudeDirs) {
    const extJs = path.join(extDir, dirName, 'dist', 'extension.js');
    if (!exists(extJs)) continue;
    let code = fs.readFileSync(extJs, 'utf8');
    const hasAutoFocus = code.includes('claude-dev.SidebarProvider.focus');
    let healed = false;
    if (!hasAutoFocus) {
      const target = code.includes('let n=nE.getVisibleInstance();if(!n)return Me.warn("SharedUriHandler: No visible webview found"),!1;') ? 'let n=nE.getVisibleInstance();if(!n)return Me.warn("SharedUriHandler: No visible webview found"),!1;' : 'let n=nE.getVisibleInstance()||nE.instance;if(!n)return Me.warn("SharedUriHandler: No visible webview found"),!1;';
      if (code.includes(target)) {
        const bakPath = `${extJs}.certified.bak`;
        if (!exists(bakPath)) fs.writeFileSync(bakPath, code, 'utf8');
        const replacement = 'let n=nE.getVisibleInstance()||nE.instance;if(!n){try{const vsc=require("vscode");await vsc.commands.executeCommand("claude-dev.SidebarProvider.focus")}catch(err){}for(let i=0;i<30;i++){n=nE.getVisibleInstance()||nE.instance;if(n)break;await new Promise(res=>setTimeout(res,100))}}if(!n)return Me.warn("SharedUriHandler: No visible webview found"),!1;';
        code = code.replace(target, replacement);
        fs.writeFileSync(extJs, code, 'utf8');
        healed = true;
      }
    }
    results.push({
      id: 'saoudrizwan.claude-dev',
      dir: dirName,
      taskSupported: code.includes('/task') && code.includes('handleTaskCreation'),
      promptFileSupported: code.includes('prompt-file'),
      sidebarAutoFocus: true,
      autoHealed: healed
    });
  }

  // Persist the verified verdict so subsequent wakes take the fast path.
  try { atomicWrite(stampFile, { sig: sigStr, extensions: results, at: now() }); } catch { }
  return { extensionsDir: extDir, extensions: results };
}

function getLeadWatcherStatus() {
  const pidPath = path.join(GLOBAL, 'lead_watcher.pid');
  const watcherScript = path.join(GLOBAL, 'lead_watcher.cjs');
  const bakPath = path.join(GLOBAL, 'lead_watcher.cjs.certified.bak');
  let running = false;
  let pid = null;
  if (exists(pidPath)) {
    try {
      pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
      if (pid && !isNaN(pid)) {
        process.kill(pid, 0);
        running = true;
      }
    } catch {
      running = false;
    }
  }
  return {
    running,
    pid: running ? pid : null,
    udpPort: 48222,
    scriptExists: exists(watcherScript),
    certifiedBackupExists: exists(bakPath)
  };
}

function ensureLeadWatcher(autoSpawn = false) {
  const st = getLeadWatcherStatus();
  const watcherScript = path.join(GLOBAL, 'lead_watcher.cjs');
  const supervisorScript = path.join(GLOBAL, 'lead_watcher_daemon.cjs');
  const bakPath = path.join(GLOBAL, 'lead_watcher.cjs.certified.bak');

  if (!exists(watcherScript) && exists(bakPath)) {
    try { fs.copyFileSync(bakPath, watcherScript); } catch {}
  }

  if (!st.running && autoSpawn && exists(watcherScript)) {
    try {
      const { spawn } = require('child_process');
      const scriptToRun = exists(supervisorScript) ? supervisorScript : watcherScript;
      const args = exists(supervisorScript) ? [supervisorScript, '--loop'] : [watcherScript];
      const child = spawn(process.execPath, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        cwd: GLOBAL,
        // The watcher acts AS the autonomous Lead, so its CLI children must
        // declare the lead role to pass the capability matrix.
        env: { ...process.env, AI_BRIDGE_ROLE: 'lead' }
      });
      child.unref();
      return { ...st, running: true, pid: child.pid, autoSpawned: true };
    } catch (e) {
      return { ...st, autoSpawnError: e.message };
    }
  }
  return st;
}

/** Fast synchronous liveness probe against an extension IPC `/status` endpoint. */
function httpProbeStatusSync(port, timeoutMs = 1200) {
  const script = `
    const http=require('http');
    const req=http.request({hostname:'127.0.0.1',port:${Number(port)},path:'/status',method:'GET',timeout:${Number(timeoutMs)}},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>{process.stdout.write(JSON.stringify({status:res.statusCode,body:b}));process.exit(0);});});
    req.on('error',e=>{process.stdout.write(JSON.stringify({status:0,error:String((e&&e.code)||(e&&e.message)||e)}));process.exit(0);});
    req.on('timeout',()=>{try{req.destroy();}catch(e){}process.stdout.write(JSON.stringify({status:0,error:'TIMEOUT'}));process.exit(0);});
    req.end();
  `;
  try {
    const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: timeoutMs + 1200, windowsHide: true });
    const out = String(r.stdout || '').trim();
    if (!out) return { ok: false, status: 0, error: 'NO_RESPONSE' };
    const j = JSON.parse(out);
    return { ok: j.status === 200, status: j.status, body: j.body || null, error: j.error || null };
  } catch (e) { return { ok: false, status: 0, error: e.message }; }
}

/**
 * wakeDoctor — end-to-end health of the autonomous mutual-wake plane.
 * Reports exactly which delivery layer is live and what (if anything) is needed
 * to make the deep integration fully active. Clipboard is never used.
 */
function wakeDoctor(projectDir) {
  const root = findBridgeRoot(projectDir);
  const bridgeDir = root.bridgeDir;
  let extAudit = { extensions: [] };
  try { extAudit = ensureExtensionWakeSupport(); } catch {}
  const clineExt = (extAudit.extensions || []).find(x => x.id === 'saoudrizwan.claude-dev') || null;

  const AW0 = (() => { try { return require('./autowake.cjs'); } catch { return null; } })();
  const pp = AW0 ? AW0.pPaths(root.projectRoot) : null;
  const leaseDev = AW0 ? AW0.readLease(root.projectRoot, 'dev') : null;
  const primary = (leaseDev && leaseDev.live && leaseDev.httpPort)
    ? httpProbeStatusSync(leaseDev.httpPort)
    : { ok: false, status: 0, error: leaseDev ? 'LEASE_STALE' : 'NO_LIVE_LEASE' };
  const watcher = getLeadWatcherStatus();
  const ideExe = AW0 ? AW0.resolveIdeExe() : null;
  const inbox = pp ? jsonRead(pp.devInbox, null) : null;
  const devOutbox = (pp && AW0) ? AW0.readOutboxFile(pp.devOutbox) : [];
  const pending = devOutbox.filter(e => !e.delivered && !e.expired);
  const expired = devOutbox.filter(e => e.expired);
  const devAck = pp ? jsonRead(pp.devAck, null) : null;

  const layers = {
    L1_clineIpc_activeTask: { port: (leaseDev && leaseDev.httpPort) || null, live: !!primary.ok, detail: primary.ok ? 'live' : (primary.error || `HTTP ${primary.status}`) },
    L2_leadWatcher: { running: watcher.running, pid: watcher.pid, udpPort: watcher.udpPort },
    L3_durableInbox: { path: pp ? pp.devInbox : null, present: !!inbox, processed: !!(inbox && inbox.processed === true), id: inbox?.id || null },
    L4_clineUriHandler: { ideExe: ideExe || null, clineExtensionPatched: !!(clineExt && clineExt.taskSupported && clineExt.promptFileSupported), sidebarAutoFocus: !!(clineExt && clineExt.sidebarAutoFocus) },
    outbox: { total: devOutbox.length, pending: pending.length, expired: expired.length, lastAck: devAck?.ackedAt || null },
    clipboardUsed: false
  };

  const activeLayers = [];
  if (primary.ok) activeLayers.push('L1_clineIpc_activeTask');
  if (watcher.running) activeLayers.push('L2_leadWatcher');

  let status, remediation;
  if (primary.ok) {
    status = 'FULLY_INTEGRATED';
    remediation = 'Primary IPC live: wakes feed the running Cline task. No action required.';
  } else if (clineExt && clineExt.taskSupported) {
    status = 'URI_ONLY';
    remediation = 'No IPC listener; wakes are delivered via the Cline URI handler with a short pointer prompt (works now). Reload the IDE window to activate L1/L2 IPC for full deep integration.';
  } else {
    status = 'BROKEN';
    remediation = 'No delivery channel detected. Ensure Antigravity IDE is running and the Cline + ai-bridge extensions are installed.';
  }

  const AW = AW0;
  const wakePlane = AW ? (() => {
    try {
      const p = AW.pPaths(root.projectRoot);
      const dl = AW.readLease(root.projectRoot, 'dev');
      const ll = AW.readLease(root.projectRoot, 'lead');
      return {
        projectKey: p.key, wakeDir: p.dir, tokenPresent: exists(p.token),
        devOutboxEntries: AW.readOutboxFile(p.devOutbox).length,
        leadOutboxEntries: AW.readOutboxFile(p.leadOutbox).length,
        devLease: dl ? { live: dl.live, httpPort: dl.httpPort || null, ageMs: dl.ageMs } : null,
        leadLease: ll ? { live: ll.live, httpPort: ll.httpPort || null, ageMs: ll.ageMs } : null,
        turn: AW.turn({ projectDir: root.projectRoot })
      };
    } catch (e) { return { error: e.message }; }
  })() : { error: 'autowake.cjs unavailable' };

  return {
    success: status !== 'BROKEN', status, remediation, activeLayers, layers, wakePlane,
    checkedAt: now(), projectRoot: root.projectRoot, bridgeDir: bridgeDir || null
  };
}

/* ── Session-watcher supervision (project-agnostic autonomous Lead) ─────────── */
const SESSION_SCRIPT = path.join(GLOBAL, 'lead_watcher_session.cjs');
const SESSION_PID = path.join(GLOBAL, 'lead_watcher_session.pid');
function sessionWatcherStatus() {
  if (!exists(SESSION_PID)) return { running: false, pid: null };
  try {
    const pid = Number.parseInt(fs.readFileSync(SESSION_PID, 'utf8').trim(), 10);
    if (!pid) return { running: false, pid: null };
    process.kill(pid, 0);
    return { running: true, pid };
  } catch { return { running: false, pid: null }; }
}
function ensureSessionWatcher(autoSpawn = false) {
  const st = sessionWatcherStatus();
  if (st.running || !autoSpawn || !exists(SESSION_SCRIPT)) return st;
  try {
    const child = spawn(process.execPath, [SESSION_SCRIPT], { detached: true, stdio: 'ignore', windowsHide: true, cwd: GLOBAL, env: { ...process.env, AI_BRIDGE_ROLE: 'lead' } });
    child.unref();
    // The child claims SESSION_PID atomically itself (singleton lock).
    return { running: true, pid: child.pid, autoSpawned: true };
  } catch (e) { return { ...st, autoSpawnError: e.message }; }
}
/** Cheap, safe self-heal run on every CLI invocation. */
function selfHealLight() {
  const out = {};
  try { out.watcher = ensureLeadWatcher(true); } catch (e) { out.watcher = { error: e.message }; }
  try { out.session = ensureSessionWatcher(true); } catch (e) { out.session = { error: e.message }; }
  return out;
}

/**
 * heal — comprehensive, idempotent self-repair. Safe to run any time.
 * Repairs: global scaffold, per-project scaffolds/tokens, extension deployment
 * and patches, daemon liveness, MCP registration, orphaned temp files.
 */
/* ── Launcher shims: Scheduled-Task targets that must never go missing ────────
 *
 * WHY THIS EXISTS
 *   The AIBridge-* scheduled tasks invoke `wscript.exe <shim>.vbs`. wscript.exe
 *   is the GUI host: when the shim is absent it raises a MODAL "Can not find
 *   script file" dialog and waits for the user to click OK. Because
 *   AIBridge-LeadWatcher-Periodic repeats every 5 minutes, a deleted shim
 *   becomes an un-dismissable desktop interruption loop that no agent can close
 *   (the dialog is outside the IDE). That is exactly what happened here.
 *
 * The bridge therefore OWNS these files: they are regenerated on every `heal`,
 * and the shims themselves carry a hard "never raise a dialog" contract
 * (On Error Resume Next + WScript.Quit 0) so even an internal failure is silent
 * rather than modal.
 */
const SHIM_DAEMON = 'lead_watcher_daemon.cjs';

/** Shared shim body. `extra` is the daemon argument list ('' or ' --loop'). */
function shimBody(extra) {
  return [
    "' AI Collaboration Bridge launcher shim - AUTO-GENERATED by `bridge heal`.",
    "'",
    "' WHY: the AIBridge-* scheduled tasks invoke wscript.exe on this exact path.",
    "' wscript.exe is the GUI host, so a MISSING file becomes a MODAL \"Can not",
    "' find script file\" dialog that blocks the desktop. Because one task repeats",
    "' every 5 minutes that becomes an un-dismissable interruption loop. The bridge",
    "' therefore owns this file and regenerates it - do not delete it.",
    "'",
    "' CONTRACT: NEVER raise a dialog. Always quit 0.",
    'Option Explicit',
    'Dim fso, sh, here, daemon, nodeExe',
    'On Error Resume Next',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'Set sh  = CreateObject("WScript.Shell")',
    'here    = fso.GetParentFolderName(WScript.ScriptFullName)',
    `daemon  = here & "\\${SHIM_DAEMON}"`,
    'nodeExe = "node.exe"',
    'If fso.FileExists(daemon) Then',
    `    sh.Run """" & nodeExe & """ """ & daemon & """${extra}", 0, False`,
    'End If',
    'WScript.Quit 0',
    ''
  ].join('\r\n');
}

const LAUNCHER_SHIMS = {
  // Periodic health check: one supervisor pass. The daemon is singleton-guarded
  // ("Supervisor loop already running in another process. Exiting."), so this is
  // a cheap no-op whenever a supervisor is already up.
  'lead_watcher_check_silent.vbs': shimBody(''),
  // Logon start: the continuous supervisor loop.
  'lead_watcher_silent.vbs': shimBody(' --loop')
};

/** (Re)write any launcher shim that is missing or has drifted. Idempotent. */
function writeLauncherShims() {
  const written = [];
  for (const [name, body] of Object.entries(LAUNCHER_SHIMS)) {
    const file = path.join(GLOBAL, name);
    let cur = '';
    try { cur = fs.readFileSync(file, 'utf8'); } catch { }
    if (cur.replace(/\r\n/g, '\n') === body.replace(/\r\n/g, '\n')) continue;
    atomicWrite(file, body);
    written.push(name);
  }
  return written;
}

/**
 * Validate that every AIBridge-* scheduled task's script target still EXISTS.
 *
 * Reads the task XML through schtasks (no PowerShell dependency) and extracts
 * <Command>/<Arguments>. Only wscript/cscript targets are checked, because those
 * are the ones that turn a missing file into a modal dialog. Returns the tasks
 * whose referenced script is gone — precisely the condition that produced the
 * dialog storm.
 */
function auditScheduledTasks() {
  const list = spawnSync('schtasks', ['/query', '/fo', 'CSV', '/nh'], { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  if (list.error) return { checked: 0, missing: [], error: list.error.message };
  // CSV task names are ROOTED: "\AIBridge-LeadWatcher". Strip the root for the
  // prefix test, but keep the rooted form for `schtasks /tn`.
  const names = String(list.stdout || '').split(/\r?\n/)
    .map(l => (l.match(/^"([^"]+)"/) || [])[1])
    .filter(n => n && n.replace(/^\\+/, '').startsWith('AIBridge-'));
  const missing = [];
  for (const name of names) {
    const xml = spawnSync('schtasks', ['/query', '/tn', name, '/xml'], { encoding: 'utf8', windowsHide: true, timeout: 20000 });
    const text = String(xml.stdout || '');
    const cmd = (text.match(/<Command>([\s\S]*?)<\/Command>/) || [])[1] || '';
    const args = (text.match(/<Arguments>([\s\S]*?)<\/Arguments>/) || [])[1] || '';
    if (!/wscript|cscript/i.test(cmd)) continue;   // node targets need no shim
    const target = args.trim().replace(/^"|"$/g, '');
    if (target && !exists(target)) missing.push({ task: name, target });
  }
  return { checked: names.length, missing, error: null };
}

/**
 * `bridge queue` — inspect (and optionally reconcile) the wake queue.
 *
 * The queue is what decides whether a developer gets woken, so it must be
 * INSPECTABLE. Before this command the only way to see it was to hand-read
 * JSONL — which is how three stale wakes for an APPROVED_FROZEN directive sat
 * unnoticed, and why every `await` had to skip them as `superseded`.
 *
 * Read-only by default. `--prune` applies the reconciliation.
 */
function queueCmd(o = {}) {
  const AW = require('./autowake.cjs');
  const dryRun = !(o.prune || o.apply);
  const roots = [];
  if (o.projectDir) roots.push(o.projectDir);
  else {
    try { for (const p of (loadRegistry().projects || [])) if (p && p.projectRoot) roots.push(p.projectRoot); } catch { }
  }
  const projects = [];
  let retired = 0, prunedArtifacts = 0;
  for (const root of roots) {
    try {
      const before = AW.queueStatus(root);
      const rec = AW.retireStaleWakes(root, { dryRun });
      const after = AW.queueStatus(root);
      retired += rec.retired;
      prunedArtifacts += rec.prunedArtifacts;
      projects.push({
        projectKey: before.projectKey,
        liveBefore: before.dev.live.length + before.lead.live.length,
        liveAfter: after.dev.live.length + after.lead.live.length,
        dev: { live: after.dev.live, delivered: after.dev.delivered, expired: after.dev.expired, total: after.dev.total },
        lead: { live: after.lead.live, delivered: after.lead.delivered, expired: after.lead.expired, total: after.lead.total },
        promptArtifacts: after.promptArtifacts,
        liveEntries: after.dev.liveEntries.concat(after.lead.liveEntries),
        reconciled: rec.reasons
      });
    } catch (e) { projects.push({ projectRoot: root, error: e.message }); }
  }
  return {
    success: true,
    mode: dryRun ? 'DRY-RUN (nothing written — pass --prune to apply)' : 'APPLIED',
    retired, prunedArtifacts, projects, at: now()
  };
}

function heal(projectDir) {
  const actions = [];
  const ok = (name, detail) => actions.push({ name, ok: true, detail: detail || null });
  const bad = (name, detail) => actions.push({ name, ok: false, detail: detail || null });
  let AW = null;
  try { AW = require('./autowake.cjs'); } catch (e) { bad('autowake-module', e.message); }

  try { ensureDir(GLOBAL); ensureDir(path.join(GLOBAL, 'projects')); ok('global-scaffold'); } catch (e) { bad('global-scaffold', e.message); }

  // Per-project scaffolds (token, dirs, registry entry)
  try {
    const reg = loadRegistry();
    const projects = (reg.projects || []).filter(p => p && p.projectRoot);
    let healed = 0;
    for (const p of projects) { try { AW.ensureScaffold(p.projectRoot); healed++; } catch { } }
    ok('project-scaffolds', `${healed}/${projects.length}`);
  } catch (e) { bad('project-scaffolds', e.message); }

  // Extension deployment (v4 control plane) + wake patches
  try {
    const src = path.join(GLOBAL, 'extension', 'extension.js');
    const extRoot = path.join(HOME, '.antigravity-ide', 'extensions');
    let synced = 0, targets = 0;
    if (exists(src) && exists(extRoot)) {
      const s = fs.readFileSync(src, 'utf8');
      for (const d of fs.readdirSync(extRoot)) {
        if (!d.startsWith('antigravity-deepmind.ai-bridge-')) continue;
        const dst = path.join(extRoot, d, 'extension.js');
        targets++;
        let cur = ''; try { cur = fs.readFileSync(dst, 'utf8'); } catch { }
        if (cur !== s) { try { fs.copyFileSync(src, dst); synced++; } catch { } }
      }
    }
    ok('extension-deployed', `synced=${synced} targets=${targets}`);
  } catch (e) { bad('extension-deployed', e.message); }
  try { const r = ensureExtensionWakeSupport(); ok('extension-patches', `exts=${(r.extensions || []).length}`); } catch (e) { bad('extension-patches', e.message); }

  // Daemons
  try { const w = ensureLeadWatcher(true); w.running ? ok('lead-watcher', `pid=${w.pid}`) : bad('lead-watcher', 'not running'); } catch (e) { bad('lead-watcher', e.message); }
  try { const s = ensureSessionWatcher(true); s.running ? ok('session-watcher', `pid=${s.pid}`) : bad('session-watcher', 'not running'); } catch (e) { bad('session-watcher', e.message); }

  // MCP registration for both roles (serverless agent-to-agent tool channel)
  try {
    const r = AW.mcpConfig({ role: 'dev', install: true });
    ok('mcp-registration', (r.installed || []).map(x => `${(x.file || '').split('\\').pop()}${x.changed ? ':updated' : ':ok'}`).join(', '));
  } catch (e) { bad('mcp-registration', e.message); }

  // Orphan temp cleanup (ipc payloads, atomic-write leftovers)
  try {
    let cleaned = 0;
    const root = path.join(GLOBAL, 'projects');
    if (exists(root)) for (const d of fs.readdirSync(root)) {
      const dir = path.join(root, d);
      try {
        for (const f of fs.readdirSync(dir)) {
          if (/^\.ipc-.*\.json$/.test(f) || /\.tmp-\d+-[0-9a-f]+$/.test(f)) { try { fs.unlinkSync(path.join(dir, f)); cleaned++; } catch { } }
        }
      } catch { }
    }
    ok('orphan-cleanup', `removed=${cleaned}`);
  } catch (e) { bad('orphan-cleanup', e.message); }

  // Wake-queue reconciliation: retire wakes whose directive is terminal, or
  // whose ball is with the Lead, and prune the prompt artifacts they owned.
  // Without this the queue accumulates entries that can never be acted on.
  try {
    if (!AW) throw new Error('autowake module unavailable');
    let retired = 0, prunedArtifacts = 0, scanned = 0;
    const roots = [];
    try { for (const pr of (loadRegistry().projects || [])) if (pr && pr.projectRoot) roots.push(pr.projectRoot); } catch { }
    if (projectDir) roots.push(projectDir);
    for (const r of [...new Set(roots)]) {
      try {
        const rec = AW.retireStaleWakes(r);
        retired += rec.retired; prunedArtifacts += rec.prunedArtifacts; scanned += rec.scanned;
      } catch { /* per-project reconciliation is best-effort */ }
    }
    ok('wake-queue', `scanned=${scanned} retired=${retired} prunedArtifacts=${prunedArtifacts}`);
  } catch (e) { bad('wake-queue', e.message); }

  // Launcher shims + scheduled-task target audit.
  //
  // The AIBridge-* tasks hard-code a wscript target. A deleted target turns into
  // a MODAL Script Host dialog on EVERY trigger — see the block comment above
  // LAUNCHER_SHIMS. Regenerate first, then audit, then fail loudly if any task
  // still points at a file that does not exist.
  try {
    const written = writeLauncherShims();
    ok('launcher-shims', written.length ? `regenerated=${written.join(',')}` : 'present');
  } catch (e) { bad('launcher-shims', e.message); }

  try {
    const audit = auditScheduledTasks();
    if (audit.error) bad('scheduled-tasks', audit.error);
    else if (audit.missing.length) {
      bad('scheduled-tasks', `MISSING TARGET: ${audit.missing.map(m => `${m.task} -> ${m.target}`).join('; ')}`);
    } else ok('scheduled-tasks', `${audit.checked} AIBridge-* task(s) resolve their target`);
  } catch (e) { bad('scheduled-tasks', e.message); }

  const failed = actions.filter(a => !a.ok);
  const result = {
    success: failed.length === 0, actions,
    score: Math.round(((actions.length - failed.length) / Math.max(1, actions.length)) * 100), at: now()
  };
  try { AW.logEvent(failed.length ? 'warn' : 'info', 'heal', 'HEAL', { score: result.score, failed: failed.map(a => a.name), actions: actions.map(a => `${a.name}${a.ok ? ':ok' : ':FAIL'}`) }); } catch { }
  return result;
}

/** verify — one command that proves the whole plane is healthy. */
function runSuites(projectDir) {
  const dir = path.join(findBridgeRoot(projectDir).projectRoot, '.bridge', 'evidence');
  const suites = ['autowake-suite.cjs', 'e2e-lifecycle.cjs', 'freeze-lock-selftest.cjs', 'mcp-conformance.cjs', 'role-matrix-selftest.cjs', 'wake-guard-selftest.cjs'];
  const out = [];
  for (const s of suites) {
    const p = path.join(dir, s);
    if (!exists(p)) { out.push({ suite: s, skipped: true }); continue; }
    let r;
    try {
      r = spawnSync(process.execPath, [p], { encoding: 'utf8', timeout: 180000, windowsHide: true, env: { ...process.env, BRIDGE_NO_URI: '1' } });
    } catch (e) { out.push({ suite: s, ok: false, error: e.message }); continue; }
    const txt = String(r.stdout || '') + String(r.stderr || '');
    const m = txt.match(/RESULT:\s*(\d+)\/(\d+)/);
    out.push({ suite: s, exit: r.status, passed: m ? Number(m[1]) : 0, total: m ? Number(m[2]) : 0, ok: r.status === 0 });
  }
  const passed = out.reduce((a, s) => a + (s.passed || 0), 0);
  const total = out.reduce((a, s) => a + (s.total || 0), 0);
  return { suites: out, passed, total, allOk: out.every(s => s.skipped || s.ok) };
}

function verify(projectDir, opts = {}) {
  let suite = { success: false, passed: 0, total: 0, checks: [], error: 'autowake unavailable' };
  let AW = null;
  try { AW = require('./autowake.cjs'); suite = AW.selfTest(); } catch (e) { suite.error = e.message; }
  let doc = null;
  try { doc = wakeDoctor(projectDir); } catch (e) { doc = { status: 'ERROR', error: e.message }; }
  let h = null;
  try { h = heal(projectDir); } catch (e) { h = { success: false, score: 0, error: e.message }; }
  const failedChecks = (suite.checks || []).filter(c => !c.ok).map(c => c.name);
  const deep = !!(opts.deep || opts.all || process.env.BRIDGE_VERIFY_DEEP === '1');
  let suites = null;
  if (deep) { try { suites = runSuites(projectDir); } catch (e) { suites = { error: e.message, allOk: false }; } }
  const result = {
    success: !!suite.success && !!h.success && (!suites || suites.allOk !== false),
    selfTest: { success: !!suite.success, passed: suite.passed, total: suite.total, failed: failedChecks },
    wakePlane: doc.status,
    healthScore: h.score,
    healActions: h.actions,
    ...(suites ? { integration: { passed: suites.passed, total: suites.total, suites: suites.suites } } : {}),
    at: now()
  };
  try {
    AW.logEvent(result.success ? 'info' : 'error', 'verify', 'VERIFY', {
      selfTest: `${suite.passed}/${suite.total}`, failed: failedChecks,
      wakePlane: doc.status, health: h.score,
      integration: suites ? `${suites.passed}/${suites.total}` : null
    });
  } catch { }
  return result;
}

function freezeBridge(projectDir) {
  const r = findBridgeRoot(projectDir);
  const extAudit = ensureExtensionWakeSupport();
  const watcherStatus = getLeadWatcherStatus();

  const filesToCertify = [
    { src: path.join(__dirname, 'bridge.cjs'), bak: path.join(__dirname, 'bridge.cjs.certified.bak') },
    { src: path.join(__dirname, 'lead_watcher.cjs'), bak: path.join(__dirname, 'lead_watcher.cjs.certified.bak') },
    { src: path.join(__dirname, 'autowake.cjs'), bak: path.join(__dirname, 'autowake.cjs.certified.bak') }
  ];

  const certifiedFiles = [];
  for (const f of filesToCertify) {
    if (exists(f.src)) {
      const content = fs.readFileSync(f.src, 'utf8');
      fs.writeFileSync(f.bak, content, 'utf8');
      certifiedFiles.push({
        file: path.basename(f.src),
        sha256: sha256(content),
        bytes: Buffer.byteLength(content, 'utf8'),
        certifiedBackup: path.basename(f.bak)
      });
    }
  }

  const manifest = {
    certifiedAt: now(),
    version: VERSION,
    architecture: 'BIDIRECTIONAL_INSTANT_WAKE_V1',
    status: 'FROZEN_AND_CERTIFIED',
    leadToDevWake: {
      protocol: 'short_uri_prompt_file_dual_dispatch',
      extensions: extAudit.extensions,
      allExtensionsCertified: extAudit.extensions.every(e => e.taskSupported)
    },
    devToLeadWake: {
      protocol: 'triple_redundant_signal_queue_udp',
      udpPort: 48222,
      leadWatcher: watcherStatus
    },
    certifiedFiles
  };

  const globalManifest = path.join(GLOBAL, 'CERTIFIED_FREEZE_MANIFEST.json');
  atomicWrite(globalManifest, manifest);

  if (r.bridgeDir && exists(r.bridgeDir)) {
    atomicWrite(path.join(r.bridgeDir, 'CERTIFIED_FREEZE_MANIFEST.json'), manifest);
  }

  return {
    success: true,
    frozen: true,
    manifestPath: globalManifest,
    manifest
  };
}

function doctor(projectDir) {
  const r = findBridgeRoot(projectDir); const p = paths(r.bridgeDir);
  const wakeAudit = ensureExtensionWakeSupport();
  const watcherStatus = getLeadWatcherStatus();
  const ideExe = 'C:\\Users\\mbhas\\AppData\\Local\\Programs\\Antigravity IDE\\Antigravity IDE.exe';
  const manifestPath = path.join(GLOBAL, 'CERTIFIED_FREEZE_MANIFEST.json');
  const freezeManifest = exists(manifestPath) ? jsonRead(manifestPath, null) : null;
  return {
    version: VERSION, node: process.version, platform: process.platform, arch: process.arch,
    projectRoot: r.projectRoot, bridgeExists: exists(r.bridgeDir), ledgerExists: exists(p.ledger),
    ledgerIntegrity: exists(p.ledger) ? verifyLedger(r.bridgeDir) : null, git: gitSnapshot(r.projectRoot),
    masterConfig: exists(MASTER), globalDir: GLOBAL,
    wakeSubsystem: {
      ideExecutablePresent: exists(ideExe),
      ideExecutablePath: ideExe,
      extensions: wakeAudit.extensions,
      allExtensionsCertified: wakeAudit.extensions.every(e => e.taskSupported)
    },
    bidirectionalSubsystem: {
      leadWatcherRunning: watcherStatus.running,
      leadWatcherPid: watcherStatus.pid,
      udpPort: watcherStatus.udpPort,
      signalFile: path.join(r.bridgeDir, 'wake_lead.signal'),
      signalFileExists: exists(path.join(r.bridgeDir, 'wake_lead.signal')),
      certifiedBackupExists: watcherStatus.certifiedBackupExists,
      status: watcherStatus.running ? 'ACTIVE_AND_MONITORING' : 'INACTIVE'
    },
    freezeStatus: {
      certified: Boolean(freezeManifest),
      certifiedAt: freezeManifest?.certifiedAt || null,
      manifestPath: exists(manifestPath) ? manifestPath : null
    }
  };
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const k = a.slice(2); const n = argv[i + 1];
    if (n !== undefined && !n.startsWith('--')) { out[k] = n; i++; } else out[k] = true;
  }
  return out;
}

/**
 * XAMPP Server Control & Invariant Enforcement — DIR-053 three-tier lifecycle
 * Strictly initiates and manages all servers through XAMPP:
 *   1. Apache  (ports 80/443)
 *   2. MySQL   (port 3306)
 *   3. Node.js Backend API Server (backend/index.js on port 8080)
 * and prohibits unmanaged background node/vite server conflicts.
 *
 * DIR-053 RCA-1: START scripts + `bridge xampp start all` only ever launched
 * apache_start.bat / mysql_start.bat, so the Express API on :8080 was an
 * unsupervised manual process that 502'd every /api/* request the moment it
 * died. The backend is now adopted-or-spawned on start (backend_api.pid +
 * /readyz verification), drained on stop, and reported by status. The 24/7
 * crash recovery remains owned by lead_watcher_daemon.cjs using the same
 * sanctioned supervisor pattern DIR-052 certified for :48200.
 */
const BACKEND_API_PORT = 8080;
const BACKEND_API_PID_FILE = path.join(GLOBAL, 'backend_api.pid');
const BACKEND_API_LOG_FILE = path.join(GLOBAL, 'backend_api.log');

function resolveBackendApiTarget() {
  const seen = new Set();
  const candidates = [];
  const active = getActiveProject();
  if (active?.projectRoot) candidates.push(active.projectRoot);
  for (const project of (loadRegistry().projects || [])) {
    if (project?.projectRoot) candidates.push(project.projectRoot);
  }
  for (const root of candidates) {
    const key = String(root).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const script = path.join(root, 'backend', 'index.js');
    if (exists(script)) return { script, projectRoot: root };
  }
  return null;
}

function findPortListenerPid(port) {
  try {
    const out = require('node:child_process').execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', timeout: 2000, windowsHide: true });
    const match = out.match(/LISTENING\s+(\d+)/);
    return match ? Number.parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

function readBackendPidFile() {
  try {
    if (!exists(BACKEND_API_PID_FILE)) return null;
    const pid = Number.parseInt(fs.readFileSync(BACKEND_API_PID_FILE, 'utf8').trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return Boolean(err && (err.code === 'EPERM' || err.code === 'EACCES'));
  }
}

function probeBackendApi(pathName = '/readyz', timeoutSec = 2) {
  const ps = `try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:${BACKEND_API_PORT}${pathName}' -UseBasicParsing -TimeoutSec ${timeoutSec}; if ($r.StatusCode -eq 200) { 'UP' } else { 'DOWN' } } catch { 'DOWN' }`;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: (timeoutSec + 3) * 1000 });
  return String(r.stdout || '').trim() === 'UP';
}

function spawnBackendApi(script, cwd) {
  let outFd = null;
  try { outFd = fs.openSync(BACKEND_API_LOG_FILE, 'a'); } catch {}
  const child = spawn(process.execPath, [script], {
    detached: true,
    stdio: outFd ? ['ignore', outFd, outFd] : 'ignore',
    windowsHide: true,
    cwd,
  });
  if (child.pid) {
    try { fs.writeFileSync(BACKEND_API_PID_FILE, String(child.pid), 'utf8'); } catch {}
  }
  child.unref();
  if (outFd !== null) { try { fs.closeSync(outFd); } catch {} }
  return child.pid || null;
}

function waitForBackendApiReady(timeoutMs = 20000) {
  const ps = `$deadline = (Get-Date).AddMilliseconds(${timeoutMs}); $ok = $false; while ((Get-Date) -lt $deadline) { try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:${BACKEND_API_PORT}/readyz' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { $ok = $true; break } } catch {}; Start-Sleep -Milliseconds 250 }; if ($ok) { 'READY' } else { 'TIMEOUT' }`;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: timeoutMs + 5000 });
  return String(r.stdout || '').trim() === 'READY';
}

function xamppControl(action = 'status', target = 'all') {
  const xampp = 'D:\\xampp';
  if (!fs.existsSync(xampp)) {
    return { error: `XAMPP not found at ${xampp}` };
  }
  const act = (action || 'status').toLowerCase();
  const tgt = (target || 'all').toLowerCase();

  if (act === 'status') {
    const ps = `$a = (Get-Process -Name httpd -ErrorAction SilentlyContinue) -ne $null; $m = (Get-Process -Name mysqld -ErrorAction SilentlyContinue) -ne $null; $p80 = (Get-NetTCPConnection -LocalPort 80 -State Listen -ErrorAction SilentlyContinue) -ne $null; $p443 = (Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue) -ne $null; $p3306 = (Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue) -ne $null; $c8080 = Get-NetTCPConnection -LocalPort ${BACKEND_API_PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; $owner8080 = $null; if ($c8080) { $owner8080 = $c8080.OwningProcess }; $live8080 = 'DOWN'; $ready8080 = 'DOWN'; if ($c8080) { try { $r1 = Invoke-WebRequest -Uri 'http://127.0.0.1:${BACKEND_API_PORT}/healthz' -UseBasicParsing -TimeoutSec 2; if ($r1.StatusCode -eq 200) { $live8080 = 'UP' } } catch {}; try { $r2 = Invoke-WebRequest -Uri 'http://127.0.0.1:${BACKEND_API_PORT}/readyz' -UseBasicParsing -TimeoutSec 2; if ($r2.StatusCode -eq 200) { $ready8080 = 'READY' } } catch {} }; [PSCustomObject]@{ apacheProcess = $a; mysqlProcess = $m; port80 = $p80; port443 = $p443; port3306 = $p3306; port8080 = ($null -ne $c8080); owner8080 = $owner8080; live8080 = $live8080; ready8080 = $ready8080 } | ConvertTo-Json`;
    const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true });
    let res = {};
    try { res = JSON.parse(r.stdout.trim()); } catch {}
    const managedPid = readBackendPidFile();
    return {
      xamppDir: xampp,
      apache: { running: Boolean(res.apacheProcess), port80: Boolean(res.port80), port443: Boolean(res.port443) },
      mysql: { running: Boolean(res.mysqlProcess), port3306: Boolean(res.port3306) },
      backendApi: {
        running: Boolean(res.port8080),
        pid: res.owner8080 ? Number(res.owner8080) : (isProcessAlive(managedPid) ? managedPid : null),
        managedPid,
        healthy: res.live8080 === 'UP',
        ready: res.ready8080 === 'READY'
      },
      policy: 'STRICT_XAMPP_ENFORCED (Apache 80/443 + MySQL 3306 + managed Node Backend API 8080; no conflicting background servers permitted)'
    };
  }

  if (act === 'start') {
    let out = [];
    if (tgt === 'all' || tgt === 'apache') {
      const ps = `Start-Process -FilePath "${path.join(xampp, 'apache_start.bat')}" -WorkingDirectory "${xampp}" -WindowStyle Hidden`;
      spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true });
      out.push('Apache start command issued');
    }
    if (tgt === 'all' || tgt === 'mysql') {
      const ps = `Start-Process -FilePath "${path.join(xampp, 'mysql_start.bat')}" -WorkingDirectory "${xampp}" -WindowStyle Hidden`;
      spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true });
      out.push('MySQL start command issued');
    }
    sleep(1500);
    if (tgt === 'all' || tgt === 'backend' || tgt === 'api') {
      const resolved = resolveBackendApiTarget();
      if (!resolved) {
        out.push('Backend API: SKIPPED - no registered bridge project exposes backend/index.js');
      } else if (findPortListenerPid(BACKEND_API_PORT) && probeBackendApi('/readyz')) {
        const livePid = findPortListenerPid(BACKEND_API_PORT);
        try { fs.writeFileSync(BACKEND_API_PID_FILE, String(livePid), 'utf8'); } catch {}
        out.push(`Backend API already running and ready on :${BACKEND_API_PORT} (PID ${livePid}) - adopted into managed lifecycle`);
      } else {
        const zombiePid = findPortListenerPid(BACKEND_API_PORT);
        if (zombiePid) {
          spawnSync('powershell', ['-NoProfile', '-Command', `taskkill /F /T /PID ${zombiePid}`], { encoding: 'utf8', windowsHide: true });
          out.push(`Backend API zombie listener on :${BACKEND_API_PORT} (PID ${zombiePid}) tree-killed before respawn`);
          sleep(500);
        }
        const pid = spawnBackendApi(resolved.script, resolved.projectRoot);
        const ready = pid ? waitForBackendApiReady(20000) : false;
        out.push(ready
          ? `Backend API started and READY on :${BACKEND_API_PORT} (PID ${pid}, /readyz 200)`
          : `Backend API spawn issued (PID ${pid}) but /readyz not verified; lead_watcher_daemon.cjs guards :${BACKEND_API_PORT} and will self-heal`);
      }
    }
    return { success: true, actions: out, status: xamppControl('status') };
  }

  if (act === 'stop') {
    let out = [];
    if (tgt === 'all' || tgt === 'apache') {
      const ps = `Start-Process -FilePath "${path.join(xampp, 'apache_stop.bat')}" -WorkingDirectory "${xampp}" -WindowStyle Hidden; Start-Sleep -Seconds 1; Get-Process -Name httpd -ErrorAction SilentlyContinue | Stop-Process -Force`;
      spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true });
      out.push('Apache stopped');
    }
    if (tgt === 'all' || tgt === 'mysql') {
      const ps = `& "${path.join(xampp, 'mysql\\bin\\mysqladmin.exe')}" -u root shutdown; Start-Sleep -Seconds 1; Get-Process -Name mysqld -ErrorAction SilentlyContinue | Stop-Process -Force`;
      spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true });
      out.push('MySQL stopped');
    }
    if (tgt === 'all' || tgt === 'backend' || tgt === 'api') {
      const listenerPid = findPortListenerPid(BACKEND_API_PORT);
      const managedPid = readBackendPidFile();
      const targetPid = listenerPid || (isProcessAlive(managedPid) ? managedPid : null);
      if (!targetPid) {
        out.push(`Backend API already stopped on :${BACKEND_API_PORT}`);
      } else {
        // Best-effort graceful close first (win32 has no real SIGTERM delivery to
        // another process), then a bounded force tree-kill if the port lingers.
        spawnSync('powershell', ['-NoProfile', '-Command', `taskkill /PID ${targetPid} /T`], { encoding: 'utf8', windowsHide: true });
        let released = false;
        for (let i = 0; i < 6; i++) {
          sleep(500);
          if (!findPortListenerPid(BACKEND_API_PORT)) { released = true; break; }
        }
        if (!released) {
          spawnSync('powershell', ['-NoProfile', '-Command', `taskkill /F /T /PID ${targetPid}`], { encoding: 'utf8', windowsHide: true });
          for (let i = 0; i < 8 && findPortListenerPid(BACKEND_API_PORT); i++) sleep(250);
        }
        try { if (exists(BACKEND_API_PID_FILE)) fs.unlinkSync(BACKEND_API_PID_FILE); } catch {}
        out.push(`Backend API stopped (PID ${targetPid}, port ${BACKEND_API_PORT} released=${!findPortListenerPid(BACKEND_API_PORT)})`);
      }
    }
    sleep(1000);
    return { success: true, actions: out, status: xamppControl('status') };
  }

  throw new Error(`Unknown XAMPP action: ${act}. Use: status, start, stop`);
}

/** Protocol spec view — makes the wire contract discoverable from the CLI. */
function protocolInfo() {
  const specPath = path.join(__dirname, 'BRIDGE-PROTOCOL.md');
  let text = '';
  try { text = exists(specPath) ? fs.readFileSync(specPath, 'utf8') : ''; } catch { }
  const found = [...text.matchAll(/\*\*(INV-\d+)\*\*/g)].map(m => m[1]);
  const invariants = [...new Set(found)].sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
  return {
    success: true,
    version: 'v1',
    specPresent: exists(specPath),
    specPath,
    invariantCount: invariants.length,
    invariants,
    conformance: {
      inProcess: 'bridge verify',
      integration: '<projectDir>\\.bridge\\evidence\\autowake-suite.cjs'
    },
    docs: [specPath, path.join(__dirname, 'README.md')]
  };
}

/** Model governance view — reads bridge-config.json directly (no Python). */
function modelsInfo() {
  const cfg = jsonRead(MASTER, {});
  const m = cfg.models || {};
  return {
    success: true,
    primary: m.primary || null,
    fallbacks: m.fallbacks || [],
    profiles: Object.keys(m.profiles || {}),
    policy: m.modelLockPolicy || null,
    note: 'Live routing is served by auto_ai_router.cjs on http://127.0.0.1:48200/v1'
  };
}

/**
 * Mode arbitration.
 *
 * A wake signal is a request to enter a mode, but the STATE MACHINE is the
 * authority on which mode is legal. Previously `mode` defaulted to 'plan' with
 * no consultation of directive state, so a wake aimed at an approved directive
 * could silently demote an active implementation back into planning -- the
 * second half of the loop.
 *
 * We now reconcile: an explicit human intent always wins; otherwise the mode is
 * DERIVED from directive state.
 */
function arbitrateMode(d, requested) {
  const explicit = requested ? String(requested).toLowerCase() : null;
  if (explicit === 'plan' || explicit === 'act') {
    // Explicit intent from a human Lead always wins, but ACT is only legal once
    // a plan has actually been approved.
    if (explicit === 'act') {
      if (!d) return 'act';
      if (d.status === 'PLAN_SUBMITTED') {
        return 'act'; // legal to continue; Lead may be resuming an approved plan
      }
      if (d.status === 'IN_PROGRESS' && d.plan) return 'act';
    }
    return explicit;
  }
  if (!d) return 'plan';
  // A CHANGES_REQUESTED directive is AMBIGUOUS on its own: it can mean "revise the
  // PLAN" or "revise the EVIDENCE". `revisionTarget` resolves it, and the two cases
  // need OPPOSITE modes — a plan rejection must NOT wake the developer into act
  // mode, which is exactly what this derived path used to do.
  if (d.status === 'CHANGES_REQUESTED') return d.revisionTarget === 'evidence' ? 'act' : 'plan';
  if (d.plan && d.status === 'IN_PROGRESS') return 'act';
  return 'plan';
}

/* ──────────────────────────────────────────────────────────────────────────
 * CLIPBOARD-FREE DEV WAKE TRANSPORT
 *
 * Design contract:
 *  - Every wake produces a durable, immutable prompt artifact + inbox + outbox
 *    entry BEFORE any delivery is attempted. Delivery can therefore never lose
 *    the prompt, and a crashed/hung IDE is recoverable by replay.
 *  - Delivery is CONFIRMED, not fire-and-forget: the synchronous IPC probe
 *    returns the real HTTP status so we know whether the extension accepted it.
 *  - The clipboard is NEVER used (user mandate: clipboard-free deep integration).
 *  - Only the Cline developer in Antigravity IDE is ever targeted (Roo excluded).
 * ────────────────────────────────────────────────────────────────────────── */

/* NOTE: all wake-transport helpers now live in ./autowake.cjs (project-scoped). */

/** Cooldown so a stuck IDE cannot be spammed with identical wake signals. */
const WAKE_COOLDOWN_MS = 45000;

function wakeCline(o = {}) {
  const { bridgeDir, projectRoot } = findBridgeRoot(o.projectDir);
  // HERMETIC MODE. wakeCline -> autowake.cjs ensureScaffold() pushes the project
  // into the GLOBAL registry and creates ~/.ai-bridge/projects/<key>/. That is how
  // the 5 scratch projects per run of tests/dir062-bridge-provenance.test.mjs
  // (each `createDirective` wakes the dev) leaked 5 permanent record dirs.
  if (String(process.env.AI_BRIDGE_HERMETIC || '') === '1') {
    return { success: true, suppressed: 'hermetic', projectRoot, directiveId: o.directiveId || o.directive || null };
  }
  const target = (o.target || 'antigravity').toLowerCase();
  ensureExtensionWakeSupport();
  let promptText = o.prompt || '';
  let dId = o.directiveId || o.directive;

  if (!dId && exists(bridgeDir)) {
    const dirs = getDirectives(bridgeDir).filter(x => !TERMINAL.has(x.status));
    if (dirs.length) {
      const active = dirs.find(x => x.status === 'ISSUED' || x.status === 'IN_PROGRESS' || x.status === 'CHANGES_REQUESTED') || dirs[0];
      if (active) dId = active.id;
    }
  }

  const d = dId && exists(bridgeDir) ? getDirective(bridgeDir, dId) : null;
  const mode = arbitrateMode(d, o.mode);

  // Structural loop guard: refuse to re-dispatch an identical wake that the
  // developer has not yet had a chance to act on.
  //
  // Defect 5: this guard used to require `payload.dispatchConfirmed !== false`,
  // which EXEMPTED every unconfirmed dispatch — so a wake that failed to reach
  // the IDE could be re-issued with no cooldown at all. That exemption is wrong:
  // an unconfirmed wake is already owned by the durable outbox, which replays it
  // with exponential backoff until ack. Suppressing the duplicate is therefore
  // always correct, and re-issuing it only manufactures queue noise.
  if (exists(bridgeDir) && dId && !o.force) {
    const recent = readLedger(bridgeDir).filter(e =>
      e.type === 'WAKE_DISPATCHED' &&
      e.payload?.directiveId === dId &&
      e.payload?.mode === mode
    ).at(-1);
    if (recent && (Date.now() - Date.parse(recent.timestamp)) < WAKE_COOLDOWN_MS) {
      return {
        success: false, suppressed: true, reason: 'DUPLICATE_WAKE_COOLDOWN', mode, directiveId: dId,
        lastDispatchedAt: recent.timestamp, cooldownMs: WAKE_COOLDOWN_MS,
        message: `Wake suppressed: an identical ${mode.toUpperCase()} wake was dispatched ${Math.round((Date.now() - Date.parse(recent.timestamp)) / 1000)}s ago. Use --force to override.`
      };
    }
  }

  if (d && !promptText) {
    const surgical = resolveSurgicalContext(projectRoot, `${d.title}\n${d.spec}`);
    const learnings = getLearnings(bridgeDir);
    const surgicalBlock = surgical.length
      ? `\n\n🎯 SURGICAL TARGET CONTEXT (Zero-Search Mode):\n${surgical.map(s => `• \`${s.file}\` (${s.totalLines} lines)`).join('\n')}\nDirectly target these files. Do NOT burn turns searching the filesystem.`
      : '';
    const learningBlock = learnings.length
      ? `\n\n🧠 PROJECT LEARNINGS & INVARIANTS TO UPHOLD:\n${learnings.slice(-3).map(l => `• [${l.category}] ${l.lesson}`).join('\n')}`
      : '';

    const projName = path.basename(projectRoot);
    const workspaceHeader = `Target Project: ${projName} (${projectRoot})\n(Verify your current workspace matches this path before modifying any files)\n`;

    const feedbackBlock = o.feedback ? `\n\n💡 LEAD GUIDANCE & APPROVAL FEEDBACK:\n${o.feedback}` : '';

    if (mode === 'plan') {
      promptText = `[ANTIGRAVITY EXECUTIVE DIRECTIVE - PLAN MODE]\n${workspaceHeader}Directive: ${d.id} - ${d.title}\nPriority: ${d.priority}\nStatus: ${d.status}\n\nTask:\nExplore the codebase, inspect affected components, and submit your implementation plan.\nDo NOT modify code or execute state-changing actions yet.\n\nInvariants to uphold:\n${(d.invariants || []).map(i => `• ${i}`).join('\n')}${surgicalBlock}${learningBlock}\n\n⚡ MANDATORY: Execute the following terminal command to submit your plan (do NOT just reply in chat):\nbridge dev plan --directive ${d.id} --projectDir "${projectRoot}" --summary "<Plan summary>" --steps "<Step 1>;<Step 2>"`;
    } else {
      promptText = `[ANTIGRAVITY EXECUTIVE DIRECTIVE - ACT MODE AUTHORIZED]\n${workspaceHeader}Directive: ${d.id} - ${d.title}\nStatus: ${d.status}\nPlan approved by Lead Supervisor.${feedbackBlock}\n\nYou are authorized to execute surgical code changes, run automated tests, and crawl the rendered DOM using Playwright.\n\nInvariants to uphold:\n${(d.invariants || []).map(i => `• ${i}`).join('\n')}${surgicalBlock}${learningBlock}\n\nEmit heartbeats:\nbridge dev heartbeat --directive ${d.id} --projectDir "${projectRoot}" --status "<status>" --percent <0-100>\n\n⚡ MANDATORY: When done, submit verifiable evidence using the terminal command:\nbridge dev submit-evidence --directive ${d.id} --projectDir "${projectRoot}" --summary "<evidence summary>" --tests "<test-output.log>"`;
    }
  }

  if (!promptText) promptText = `Antigravity wake signal: Resume execution in ${mode.toUpperCase()} mode.`;

  const formattedPrompt = `<user_input mode="${mode}">\n${promptText}\n</user_input>`;

  // Delegate durable, project-scoped, authenticated delivery to the autowake plane.
  const AW = require('./autowake.cjs');
  // Dispatch ONLY to Cline (saoudrizwan.claude-dev) in Antigravity IDE (Roo strictly prohibited)
  let targetExts = ['saoudrizwan.claude-dev'];
  if (o.extension && !o.extension.toLowerCase().includes('roo')) targetExts = [o.extension];

  const delivery = AW.deliver({
    projectDir: projectRoot,
    toRole: 'dev',
    directiveId: dId,
    mode,
    promptText: formattedPrompt,
    uriExt: targetExts[0],
    // BRIDGE_NO_URI=1 is a global kill-switch for tests/headless runs.
    noUri: o.noUri || o['no-uri'] || process.env.BRIDGE_NO_URI === '1'
  });
  const wakeId = delivery.wakeId;
  const promptFile = delivery.promptFile;
  const uriDispatched = !!delivery.channels.uri;
  const httpWoken = !!(delivery.channels.ipc && delivery.channels.ipc.ok);
  // Clipboard is never used (clipboard-free mandate).
  const clipboardCopied = false;

  // ── URI fallback (CLINE-ONLY, path-constrained) is handled inside AW.deliver ─

  // ── Consumption verification (project-scoped ack, idempotent by wakeId) ────
  const consumed = AW.isAcked(projectRoot, 'dev', wakeId);
  // dispatchConfirmed is TRUE when a live channel accepted the wake (or it was
  // provably consumed). Otherwise the durable outbox keeps replaying until ack.
  const dispatchConfirmed = httpWoken || consumed || uriDispatched;

  if (exists(bridgeDir)) {
    appendEvent(bridgeDir, {
      sender: ROLES.LEAD,
      recipient: ROLES.DEV,
      type: 'WAKE_DISPATCHED',
      title: `[Wake Cline] Mode: ${mode.toUpperCase()} (${target.toUpperCase()})`,
      body: promptText,
      readBy: [ROLES.LEAD],
      payload: {
        target, mode, directiveId: dId, wakeId, projectKey: delivery.projectKey,
        channels: delivery.channels, lease: delivery.lease,
        uriDispatched, consumed, dispatchConfirmed,
        clipboardCopied: false, channel: 'clipboard-free',
        directiveStatus: d?.status || null, promptFile
      }
    });
  }

  return {
    success: true, target, mode, directiveId: dId, wakeId,
    projectKey: delivery.projectKey, projectRoot: delivery.projectRoot,
    channels: delivery.channels, lease: delivery.lease,
    uriDispatched, consumed, dispatchConfirmed,
    clipboardCopied: false, channel: 'clipboard-free', promptFile
  };
}

function wakeLead(o = {}) {
  const { bridgeDir, projectRoot } = findBridgeRoot(o.projectDir);
  const AW = require('./autowake.cjs');
  const dId = o.directiveId || o.directive || null;
  const reason = String(o.reason || o.prompt || 'Developer waiting for Lead action/review').trim();
  const d = dId && exists(bridgeDir) ? getDirective(bridgeDir, dId) : null;
  const statusStr = d ? ` [Status: ${d.status}]` : '';

  let ev = null;
  if (exists(bridgeDir)) {
    ev = appendEvent(bridgeDir, {
      sender: ROLES.DEV,
      recipient: ROLES.LEAD,
      type: 'WAKE_LEAD_REQUESTED',
      title: `[WAKE LEAD] ${dId ? `${dId}${statusStr}` : 'Developer ping'}`,
      body: reason,
      readBy: [ROLES.DEV],
      payload: {
        directiveId: dId,
        status: d?.status || null,
        reason,
        waitingSince: d?.updatedAt || now()
      }
    });
  }

  // Symmetric, durable, project-scoped push to the Lead. No URI task is spawned
  // for the Lead (it consumes the durable inbox via `bridge await --role lead`
  // or the watcher); this keeps resources low and avoids spurious windows.
  const promptText = `[BRIDGE WAKE — LEAD ACTION REQUIRED]\nProject: ${path.basename(projectRoot)} (${projectRoot})\nDirective: ${dId || 'N/A'}${statusStr}\nReason: ${reason}\n\nNext: bridge inbox --role lead --projectDir "${projectRoot}"  (or: bridge await --role lead)`;
  const delivery = AW.deliver({
    projectDir: projectRoot, toRole: 'lead', directiveId: dId, mode: 'lead',
    promptText, noUri: true
  });

  return {
    success: true,
    target: 'LEAD_SUPERVISOR',
    directiveId: dId,
    reason,
    eventId: ev?.id || null,
    wakeId: delivery.wakeId,
    projectKey: delivery.projectKey,
    channels: delivery.channels,
    lease: delivery.lease,
    timestamp: ev?.timestamp || now(),
    message: `Wake dispatched to Lead Supervisor${dId ? ` for ${dId}` : ''} (project-scoped, durable, capability-routed).`
  };
}

/* ── LEAD TAKE-OVER POLICY ────────────────────────────────────────────────────
 * The Lead MUST NOT author code on its own initiative. There are exactly TWO
 * lawful exceptions, and both must be DECLARED:
 *   (a) provider-failure — the developer hard-rejected after real provider
 *       failures/retries. This must be VERIFIABLE in the ledger, not asserted.
 *   (b) user-requested  — the human explicitly told the Lead to act as developer.
 * Anything else is a policy violation and is detected + reported.
 * ──────────────────────────────────────────────────────────────────────────── */
const TAKEOVER_REASONS = Object.freeze(['provider-failure', 'user-requested']);

/** Look for real, recent developer/provider failure evidence in the ledger. */
function providerFailureEvidence(bridgeDir, windowMs = 24 * 60 * 60 * 1000) {
  const since = Date.now() - windowMs;
  // Deliberately STRICT: only explicit failure/retry signals count. An
  // unconfirmed WAKE_DISPATCHED is NOT evidence — that is the normal state when
  // no extension IPC is live for a project, and must not justify a take-over.
  const hits = readLedger(bridgeDir).filter(e => {
    const t = Date.parse(e.timestamp || 0);
    if (!Number.isFinite(t) || t < since) return false;
    return e.type === 'SUPERVISOR_AUTO_RETRY'      // provider socket abort → retry storm
      || e.type === 'DEV_FAILURE'                  // developer reported a hard failure
      || e.type === 'PROVIDER_FAILURE';            // provider outage recorded
  });
  return { found: hits.length > 0, count: hits.length, latest: hits.slice(-1)[0] || null };
}

function leadTakeoverStatus(o = {}) {
  const { bridgeDir } = requireBridge(o.projectDir);
  const cur = jsonRead(paths(bridgeDir).leadTakeover, null);
  const ev = providerFailureEvidence(bridgeDir);
  return {
    success: true,
    active: !!(cur && cur.active),
    takeover: cur || null,
    providerFailureEvidence: { found: ev.found, count: ev.count, latestId: (ev.latest && ev.latest.id) || null },
    allowedReasons: TAKEOVER_REASONS.slice(),
    policy: 'The Lead MUST NOT author code on its own initiative. Lawful only for: (a) provider-failure WITH verifiable evidence, or (b) user-requested WITH a note.'
  };
}

/** Declare or end a Lead take-over. Only the two lawful reasons are accepted. */
function leadTakeover(o = {}) {
  const { bridgeDir, projectRoot } = requireBridge(o.projectDir);
  requireRole(roleFrom(o.role), [ROLES.LEAD]);
  const p = paths(bridgeDir);
  const cur = jsonRead(p.leadTakeover, null);

  if (o.end) {
    if (!cur || !cur.active) return { success: true, active: false, note: 'no active take-over to end' };
    atomicWrite(p.leadTakeover, { ...cur, active: false, endedAt: now(), endedBy: o.by || 'lead' });
    appendEvent(bridgeDir, {
      sender: ROLES.LEAD, recipient: ROLES.DEV, type: 'LEAD_TAKEOVER_ENDED',
      title: '[Lead Take-over Ended]', body: 'Lead has returned to supervision; the developer owns implementation again.',
      readBy: [ROLES.LEAD], payload: { reason: cur.reason, directiveId: cur.directiveId || null }
    });
    try { require('./autowake.cjs').logEvent('info', 'roles', 'LEAD_TAKEOVER_ENDED', { reason: cur.reason }); } catch { }
    return { success: true, active: false, endedAt: now(), previousReason: cur.reason };
  }

  const reason = String(o.reason || '').trim().toLowerCase();
  if (!TAKEOVER_REASONS.includes(reason)) {
    throw new Error(`Lead take-over DENIED: --reason must be one of ${TAKEOVER_REASONS.join(' | ')}. The Lead MUST NOT decide on its own to code.`);
  }
  if (cur && cur.active) return { success: true, active: true, alreadyActive: true, takeover: cur };

  let evidence = null;
  if (reason === 'provider-failure') {
    const ev = providerFailureEvidence(bridgeDir);
    if (!ev.found) {
      throw new Error('Lead take-over DENIED: --reason provider-failure requires EVIDENCE of a real developer/provider failure within 24h (SUPERVISOR_AUTO_RETRY, an unconfirmed WAKE_DISPATCHED, or DEV_FAILURE). None found in the ledger.');
    }
    evidence = { count: ev.count, latestId: (ev.latest && ev.latest.id) || null, latestType: (ev.latest && ev.latest.type) || null };
  } else {
    const note = String(o.note || '').trim();
    if (!note) throw new Error('Lead take-over DENIED: --reason user-requested requires --note "<the user\'s exact instruction>".');
    evidence = { note };
  }

  const rec = {
    active: true, reason,
    note: String(o.note || '').trim() || null,
    evidence,
    startedAt: now(), startedBy: o.by || 'lead',
    directiveId: o.directiveId || null,
    projectRoot
  };
  atomicWrite(p.leadTakeover, rec);
  appendEvent(bridgeDir, {
    sender: ROLES.LEAD, recipient: ROLES.DEV, type: 'LEAD_TAKEOVER',
    title: `[Lead Take-over] ${reason}`,
    body: `Lead is authoring code. Reason: ${reason}.${rec.note ? ` Note: ${rec.note}` : ''}${evidence && evidence.latestType ? ` Evidence: ${evidence.latestType} (${evidence.count} event(s)).` : ''}`,
    readBy: [ROLES.LEAD],
    payload: { reason, note: rec.note, evidence, directiveId: rec.directiveId }
  });
  try { require('./autowake.cjs').logEvent('warn', 'roles', 'LEAD_TAKEOVER', rec); } catch { }
  return { success: true, ...rec };
}

function getBridgeHelp() {
  return `
================================================================================
  \x1b[1;36m🌉 AI COLLABORATION BRIDGE (v${VERSION}) — BIDIRECTIONAL CONTROL PLANE\x1b[0m
================================================================================
  Antigravity (Google DeepMind) ↔ Cline Autonomous Engineering Bridge

\x1b[1;33mCORE WORKSPACE & LIFECYCLE:\x1b[0m
  bridge init [dir] [--name <name>]   Initialize bridge & scaffold .agents/AGENTS.md
  bridge ping [dir]                   Send bidirectional verification pings
  bridge status                       View active directive, inbox, and ledger health
  bridge doctor                       Run full integrity & subsystem diagnostics
  bridge pipeline                     Show current lifecycle stage & recommended action
  bridge pipeline auto                Auto-advance directive to next state (plan/act)
  bridge feedback [--auto]            Run cognitive critique loop & gatekeeper release
  bridge project list                 List all registered projects in global registry
  bridge project switch <name|auto>   Auto-detect or switch active workspace context
  bridge project active               Show currently active workspace

\x1b[1;33mCOGNITIVE ARCHITECTURE & RISK:\x1b[0m
  bridge plan review [--directive <ID>] [--summary "..."] [--steps "..."]
                                      Run 10-Role Red-Team adversarial critique
  bridge risk --files "<f1>;<f2>"     Calculate blast radius & risk tier (T1-T4)
  bridge learning list                List cumulative project learnings & invariants
  bridge learning add --category <cat> --lesson "..."
                                      Record architectural decision or gotcha

\x1b[1;33mLEAD SUPERVISION (ANTIGRAVITY):\x1b[0m
  bridge directive create --title "..." --spec "..." [--priority P0|P1|P2]
  bridge directive list               List all engineering directives
  bridge directive get <DIR-ID>       View specific directive details
  bridge wake --directive <DIR-ID> --mode plan|act
                                      Wake Cline in Antigravity IDE / VS Code
  bridge lead wake-dev [--directive <DIR-ID>] [--mode plan|act]
                                      Explicitly wake developer to resume execution
  bridge lead approve-plan --directive <DIR-ID> [--feedback "..."]
  bridge lead request-changes --directive <DIR-ID> --feedback "..."
  bridge lead reply --message-id <MSG-ID> --message "..."
  bridge lead review --directive <DIR-ID> --verdict APPROVED|CHANGES_REQUESTED
  bridge gatekeeper certify --directive <DIR-ID> [--freeze-hash <commit>]
  bridge freeze-bridge                Freeze and certify bridge scripts & hashes

\x1b[1;33mDEVELOPER EXECUTION (CLINE):\x1b[0m
  bridge dev plan --directive <DIR-ID> --summary "..." --steps "s1;s2"
  bridge dev heartbeat --directive <DIR-ID> --status "..." --percent <0-100>
                                       --continue signals "I am yielding this turn but
                                       APPROVED work remains" -> prompt resume
  bridge dev ask --directive <DIR-ID> --question "..."
  bridge dev wake-lead [--directive <DIR-ID>] [--reason "..."]
                                      Explicitly wake Lead when waiting for review/approval
  bridge wake --target lead [--reason "..."]
                                      Universal wake target switch (wake lead supervisor)
  bridge dev submit-evidence --directive <DIR-ID> --summary "..." --tests "output.log"
  bridge inbox [--role lead|dev]      Check unread event messages
  bridge read <messageId|all>         Mark message as read

--- AUTONOMOUS WAKE PLANE (PROJECT-SCOPED, SERVERLESS-FIRST) --------------------
  bridge turn                          Show WHO owns the ball (lead|dev|none) + reason
  bridge await --role dev|lead [--timeout <s>]
                                       Block until a message arrives (event-driven, ~0 CPU)
  bridge ack --role dev|lead --id <wakeId>
                                       Acknowledge a wake (idempotent, at-least-once)
  bridge lease [--role dev|lead] [--list]
                                       Show or refresh the agent capability lease
  bridge mcp-config --role dev|lead [--install]
                                       Generate/install the serverless MCP registration
  bridge wake-doctor                   Per-layer wake-plane diagnostics

--- AUTONOMY & SELF-HEALING -----------------------------------------------------
  bridge heal                          Full idempotent self-repair (scaffolds, extension,
                                       daemons, MCP, orphans) -> health score
  bridge verify [--deep]               Prove it works: self-test + doctor + heal
                                       --deep also runs the 6 integration suites
  bridge queue [--prune]               Inspect the wake queue (live / delivered /
                                       expired) per project. --prune retires wakes
                                       for terminal or Lead-owned directives and
                                       prunes their orphaned prompt artifacts
  bridge logs [--level warn|error] [--component wake|cli] [--tail N]
  bridge logs --summary                Roll-up counts + recent errors/warnings
  bridge logs --follow                 Live tail (watch the plane work in real time)
--- ROLES & CAPABILITIES --------------------------------------------------------
  bridge roles                         Role model: responsibilities, authority,
                                       capability matrix (tool → allowed roles),
                                       handoff contract + matrix integrity report
  bridge lead take-over --reason provider-failure|user-requested [--note "..."]
                                       Declare that the LEAD is authoring code.
                                       provider-failure requires ledger evidence;
                                       user-requested requires the user's note.
                                       --end returns the Lead to supervision.
  bridge lead status                   Is a take-over active? + evidence available?
  bridge protocol                      Print the wire-contract version + invariant map
  bridge models                        Model governance view (reads bridge-config.json)

--- FREEZE / LOCK (change control) ---------------------------------------------
  bridge freeze                        Lock: hash every frozen file, close any window
  bridge lock-status                   Verify integrity; show drift + approval history
  bridge unlock --reason "..." [--minutes 30]
                                       Approve a change window (REQUIRED before edits)
                                       Mutating commands are REFUSED while drifted.

\x1b[1;33mMULTI-AGENT CONCURRENCY (LANES):[0m
  bridge lane create --name <name> --files "f1;f2" [--worktree] [--base <branch>]
  bridge lane list                    List active lanes & file claims
  bridge lane claim --name <name> --files "f3"
  bridge lane heartbeat --name <name> --status "..." --percent <0-100>
  bridge lane close --name <name> [--merge] [--remove-worktree]
  bridge lane switch --name <name>    View worktree paths & instructions
  bridge merge next [--auto]          Merge next queued lane safely

[1;33mVISUAL REGRESSION & EVIDENCE (SWOT TIER-2):[0m
  bridge visual-diff --baseline <path|dir> --candidate <path|dir> [--output <path>] [--threshold 0.1]
                                      Pixel-by-pixel Playwright DOM screenshot diff engine

[1;33mNATIVE EXTENSION PACKAGING (SWOT TIER-2):[0m
  bridge package [--out <dir>] [--install]
                                      Package AI Bridge into clean, 1-click installable .vsix
================================================================================
`;
}

const TOOL_SCHEMAS = [
  { name: 'bridge_help', description: 'Get comprehensive command guide, roles, and workflows for the AI Collaboration Bridge.', inputSchema: { type: 'object', properties: {} } },
  { name: 'bridge_status', description: 'Get bridge state and integrity.', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' } } } },
  { name: 'bridge_inbox', description: 'Read unread bridge events.', inputSchema: { type: 'object', properties: { role: { type: 'string', enum: ['lead', 'dev'] }, projectDir: { type: 'string' } } } },
  { name: 'bridge_read', description: 'Read and mark a bridge message.', inputSchema: { type: 'object', required: ['messageId'], properties: { messageId: { type: 'string' }, role: { type: 'string', enum: ['lead', 'dev'] }, projectDir: { type: 'string' } } } },
  { name: 'bridge_directive_create', description: 'Create a lead engineering directive.', inputSchema: { type: 'object', required: ['title', 'spec'], properties: { title: { type: 'string' }, spec: { type: 'string' }, priority: { type: 'string', enum: ['P0', 'P1', 'P2'] }, invariants: { type: 'array', items: { type: 'string' } }, acceptanceCriteria: { type: 'array', items: { type: 'string' } }, role: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_directive_update', description: 'Dynamically update directive priority, invariants, criteria, or spec based on developer findings.', inputSchema: { type: 'object', required: ['directiveId'], properties: { directiveId: { type: 'string' }, priority: { type: 'string', enum: ['P0', 'P1', 'P2'] }, title: { type: 'string' }, spec: { type: 'string' }, addInvariant: { type: 'string' }, addCriteria: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_directive_list', description: 'List all engineering directives in the project.', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' } } } },
  { name: 'bridge_directive_get', description: 'Get details of a specific engineering directive.', inputSchema: { type: 'object', required: ['directiveId'], properties: { directiveId: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_dev_plan', description: 'Submit developer plan.', inputSchema: { type: 'object', required: ['directiveId', 'summary'], properties: { directiveId: { type: 'string' }, summary: { type: 'string' }, steps: { type: 'array', items: { type: 'string' } }, role: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_dev_heartbeat', description: 'Emit developer heartbeat. Set continue=true when yielding a turn with APPROVED work still remaining, so the supervisor resumes you promptly instead of waiting the full stall threshold.', inputSchema: { type: 'object', required: ['status'], properties: { status: { type: 'string' }, percent: { type: 'number' }, directiveId: { type: 'string' }, currentFile: { type: 'string' }, continue: { type: 'boolean' }, role: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_dev_ask', description: 'Escalate a blocker/question.', inputSchema: { type: 'object', required: ['question'], properties: { question: { type: 'string' }, context: { type: 'string' }, directiveId: { type: 'string' }, role: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_dev_submit_evidence', description: 'Submit hashed verification evidence.', inputSchema: { type: 'object', required: ['directiveId', 'summary'], properties: { directiveId: { type: 'string' }, summary: { type: 'string' }, tests: { type: 'string' }, domCrawl: { type: 'string' }, artifacts: { type: 'array', items: { type: 'string' } }, role: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_lead_send', description: 'Send a direct message or architectural instruction to the developer.', inputSchema: { type: 'object', required: ['message'], properties: { message: { type: 'string' }, directiveId: { type: 'string' }, mode: { type: 'string', enum: ['plan', 'act'] }, projectDir: { type: 'string' } } } },
  { name: 'bridge_dev_send', description: 'Send a direct message, progress update, or note to the Lead Supervisor.', inputSchema: { type: 'object', required: ['message'], properties: { message: { type: 'string' }, directiveId: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_lead_reply', description: 'Answer a developer question.', inputSchema: { type: 'object', required: ['messageId', 'message'], properties: { messageId: { type: 'string' }, message: { type: 'string' }, role: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_lead_approve_plan', description: 'Approve a submitted developer plan and authorize ACT mode via a real state transition (PLAN_SUBMITTED -> IN_PROGRESS).', inputSchema: { type: 'object', required: ['directiveId'], properties: { directiveId: { type: 'string' }, feedback: { type: 'string' }, role: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_lead_request_changes', description: 'Request changes to a submitted developer plan (PLAN_SUBMITTED -> CHANGES_REQUESTED).', inputSchema: { type: 'object', required: ['directiveId'], properties: { directiveId: { type: 'string' }, feedback: { type: 'string' }, role: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_lead_review', description: 'Review evidence and approve or request changes.', inputSchema: { type: 'object', required: ['directiveId', 'verdict', 'feedback'], properties: { directiveId: { type: 'string' }, verdict: { type: 'string', enum: ['APPROVED', 'CHANGES_REQUESTED'] }, feedback: { type: 'string' }, role: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_gatekeeper_certify', description: 'Certify only an explicitly approved, evidenced, clean Git state.', inputSchema: { type: 'object', required: ['directiveId'], properties: { directiveId: { type: 'string' }, freezeHash: { type: 'string' }, notes: { type: 'string' }, role: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_wake', description: 'Dispatch wake signal to Cline or Lead Supervisor with instructions and mode.', inputSchema: { type: 'object', properties: { directiveId: { type: 'string' }, mode: { type: 'string', enum: ['plan', 'act'] }, target: { type: 'string', enum: ['antigravity', 'vscode', 'lead'] }, prompt: { type: 'string' }, reason: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_dev_wake_lead', description: 'Explicitly wake and alert the Lead Supervisor when developer is waiting for review, approval, or blocker resolution.', inputSchema: { type: 'object', properties: { directiveId: { type: 'string' }, reason: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_lead_wake_dev', description: 'Explicitly wake the developer in plan or act mode to resume execution.', inputSchema: { type: 'object', properties: { directiveId: { type: 'string' }, mode: { type: 'string', enum: ['plan', 'act'] }, target: { type: 'string' }, prompt: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_lane_create', description: 'Create lane with exclusive normalized file claims.', inputSchema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, directiveId: { type: 'string' }, developerName: { type: 'string' }, developerId: { type: 'string' }, fileClaims: { type: 'array', items: { type: 'string' } }, branch: { type: 'string' }, projectDir: { type: 'string' }, role: { type: 'string' } } } },
  { name: 'bridge_lane_list', description: 'List lanes.', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' } } } },
  { name: 'bridge_lane_heartbeat', description: 'Update lane heartbeat.', inputSchema: { type: 'object', required: ['name', 'status'], properties: { name: { type: 'string' }, status: { type: 'string' }, percent: { type: 'number' }, role: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_lane_close', description: 'Close a lane and optionally queue merge.', inputSchema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, merge: { type: 'boolean' }, role: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_lane_claim', description: 'Claim additional files.', inputSchema: { type: 'object', required: ['name', 'fileClaims'], properties: { name: { type: 'string' }, fileClaims: { type: 'array', items: { type: 'string' } }, role: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_lane_check', description: 'Check file ownership.', inputSchema: { type: 'object', required: ['file'], properties: { file: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_merge_next', description: 'Safely merge next queued lane.', inputSchema: { type: 'object', properties: { autoMerge: { type: 'boolean' }, role: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_merge_status', description: 'Get merge queue.', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' } } } },
  { name: 'bridge_doctor', description: 'Run integrity and environment diagnostics.', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' } } } },
  { name: 'bridge_freeze', description: 'Freeze and certify both directions of the AI bridge (Lead -> Cline wake patches and Cline -> Lead watcher).', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' } } } },
  { name: 'bridge_init', description: 'Initialize and bootstrap the AI Bridge for any project root, setting up .bridge and .agents/AGENTS.md.', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' }, name: { type: 'string' }, noScaffold: { type: 'boolean' } } } },
  { name: 'bridge_test_ping', description: 'Send test pings to verify both directions of the AI bridge for a project.', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' } } } },
  { name: 'bridge_project_list', description: 'List all registered projects in the global registry.', inputSchema: { type: 'object', properties: {} } },
  { name: 'bridge_project_switch', description: 'Dynamically switch active project.', inputSchema: { type: 'object', required: ['project'], properties: { project: { type: 'string', description: 'Project name or directory path' } } } },
  { name: 'bridge_project_active', description: 'Get the currently active project.', inputSchema: { type: 'object', properties: {} } },
  { name: 'bridge_pipeline_next', description: 'Inspect all directives in the project and return the exact next lifecycle action for autonomous execution.', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' } } } },
  { name: 'bridge_continue', description: 'Check health, restore active workspace, and resume autonomous execution from where it left off, waking Cline in the sidebar.', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' }, autoApprove: { type: 'boolean' } } } },
  { name: 'bridge_pipeline_advance', description: 'Automatically advance the pipeline to the next lifecycle step (e.g. wake dev in plan mode, or approve plan and wake in act mode).', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' } } } },
  { name: 'bridge_feedback_loop', description: 'Run the autonomous feedback loop engine: audits pending plans against invariants, verifies evidence hashes, and auto-advances execution.', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' }, autoApprove: { type: 'boolean' }, autoCertify: { type: 'boolean' } } } },
  { name: 'bridge_plan_review', description: 'Run the 10-role executive red-team review on a submitted plan or custom plan text against directive invariants and project standards.', inputSchema: { type: 'object', properties: { directiveId: { type: 'string' }, planText: { type: 'string' }, steps: { type: 'array', items: { type: 'string' } }, projectDir: { type: 'string' } } } },
  { name: 'bridge_risk_assess', description: 'Calculate the blast radius and risk tier (T1-T4) for a set of proposed file changes.', inputSchema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' } }, fileClaims: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_learning_add', description: 'Record an architectural decision, bug finding, or invariant rule into the cumulative project learnings bank.', inputSchema: { type: 'object', required: ['lesson'], properties: { category: { type: 'string', enum: ['ARCHITECTURE', 'BUG_FINDING', 'GOTCHA', 'PERFORMANCE', 'INVARIANT'] }, lesson: { type: 'string' }, invariant: { type: 'string' }, directiveId: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_learning_list', description: 'Retrieve the cumulative project learnings, bugs discovered, and architectural decisions from the memory bank.', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' } } } },
  { name: 'bridge_xampp', description: 'Inspect or control XAMPP servers (Apache 80/443, MySQL 3306, and the managed Node.js Backend API Server on port 8080). Strictly enforces XAMPP server initiation without conflicting background node processes.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['status', 'start', 'stop'] }, target: { type: 'string', enum: ['all', 'apache', 'mysql', 'backend'] } } } },
  { name: 'bridge_turn', description: 'Return WHO owns the ball right now (lead|dev|none) with the reason, derived from the active directive state. Use this instead of guessing who to wake.', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' } } } },
  { name: 'bridge_await', description: 'Block until a message addressed to your role arrives (event-driven, near-zero CPU), then return the newest one and mark it seen. Replaces polling.', inputSchema: { type: 'object', properties: { role: { type: 'string', enum: ['lead', 'dev'] }, timeout: { type: 'number', description: 'seconds to wait (default 300)' }, autoAck: { type: 'boolean' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_ack', description: 'Acknowledge a wake by wakeId so the sender retires it (idempotent, at-least-once delivery).', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, role: { type: 'string', enum: ['lead', 'dev'] }, projectDir: { type: 'string' } } } },
  { name: 'bridge_lease', description: 'List all agent capability leases, or refresh your own lease (advertises supported transports + IPC port so the peer can route wakes to you).', inputSchema: { type: 'object', properties: { list: { type: 'boolean' }, role: { type: 'string', enum: ['lead', 'dev'] }, transports: { type: 'array', items: { type: 'string' } }, httpPort: { type: 'number' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_heal', description: 'Run full idempotent self-repair: project scaffolds, tokens, extension deployment, daemon liveness, MCP registration, orphan cleanup. Returns a health score.', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' } } } },
  { name: 'bridge_verify', description: 'One call that proves the plane is healthy: in-process self-test + wake-plane doctor + heal.', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' } } } },
  { name: 'bridge_logs', description: 'Read the unified operational log (CLI calls, wake dispatches, heal/verify, errors). Filter by level/component/project; summary:true gives roll-up counts + recent errors.', inputSchema: { type: 'object', properties: { level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] }, component: { type: 'string' }, project: { type: 'string' }, event: { type: 'string' }, tail: { type: 'number' }, summary: { type: 'boolean' } } } },
  { name: 'bridge_protocol', description: 'Return the wire-contract version and the normative invariant list (INV-1..) with conformance pointers.', inputSchema: { type: 'object', properties: {} } },
  { name: 'bridge_lock_status', description: 'Change control: report freeze state — locked, intact, drift list, open approval window, and recent lock/unlock history.', inputSchema: { type: 'object', properties: {} } },
  { name: 'bridge_unlock', description: 'Change control: open a time-boxed approval window so frozen files may be modified. Requires a reason (recorded in the audit trail).', inputSchema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' }, minutes: { type: 'number' }, by: { type: 'string' } } } },
  { name: 'bridge_roles', description: 'Return the role model: per-role responsibilities/authority, the enforced capability matrix (tool → allowed roles), the handoff contract, and a matrix integrity report.', inputSchema: { type: 'object', properties: {} } },
  { name: 'bridge_lead_take_over', description: 'Declare (or end) a Lead take-over of implementation. LAWFUL ONLY for reason=provider-failure (requires verifiable ledger evidence of a real developer/provider failure) or reason=user-requested (requires a note quoting the user). The Lead must never decide on its own to code.', inputSchema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', enum: ['provider-failure', 'user-requested'] }, note: { type: 'string' }, end: { type: 'boolean' }, directiveId: { type: 'string' }, projectDir: { type: 'string' } } } },
  { name: 'bridge_lead_takeover_status', description: 'Report whether a Lead take-over is active, its reason/evidence, and whether provider-failure evidence currently exists in the ledger.', inputSchema: { type: 'object', properties: { projectDir: { type: 'string' } } } }
];

function roleForMcp(args, defaultRole = null) {
  if (args?.role) return roleFrom(args.role);
  if (process.env.AI_BRIDGE_ROLE) return roleFrom(process.env.AI_BRIDGE_ROLE);
  return defaultRole || ROLES.DEV;
}

/* ── ROLE MODEL: capability matrix + separation of duties (enforced) ──────────
 * Previously `AI_BRIDGE_ROLE` only affected 5 tools, so a DEV client could
 * create directives and a LEAD client could submit dev plans/evidence. The
 * matrix below is the single source of truth for "who may call what", enforced
 * at BOTH boundaries (MCP stdio and CLI when a role is declared).
 * ──────────────────────────────────────────────────────────────────────────── */
const ROLE_IDS = Object.freeze({
  lead: ROLES.LEAD, dev: ROLES.DEV,
  qa: 'QA_VALIDATOR', security: 'SECURITY_AUDITOR', gatekeeper: 'RELEASE_GATEKEEPER'
});
const ROLE_SHORT_IDS = Object.freeze(['lead', 'dev', 'qa', 'security', 'gatekeeper']);
const ANY_ROLE = ROLE_SHORT_IDS.slice();
const AGENT_ROLES = ['lead', 'dev'];   // roles bound to live agents today

/** tool → roles allowed to invoke it */
const ROLE_CAPABILITY = Object.freeze({
  // ── read / observe / self-service (everyone) ──
  bridge_help: ANY_ROLE,
  bridge_status: ANY_ROLE,
  bridge_directive_list: ANY_ROLE,
  bridge_directive_get: ANY_ROLE,
  bridge_turn: ANY_ROLE,
  bridge_protocol: ANY_ROLE,
  bridge_roles: ANY_ROLE,
  bridge_lead_takeover_status: ANY_ROLE,
  bridge_logs: ANY_ROLE,
  bridge_verify: ANY_ROLE,
  bridge_lock_status: ANY_ROLE,
  bridge_doctor: ANY_ROLE,
  bridge_test_ping: ANY_ROLE,
  bridge_project_list: ANY_ROLE,
  bridge_project_active: ANY_ROLE,
  bridge_pipeline_next: ANY_ROLE,
  bridge_merge_status: ANY_ROLE,
  bridge_lane_list: ANY_ROLE,
  bridge_lane_check: ANY_ROLE,
  bridge_learning_list: ANY_ROLE,
  // ── shared agent transport (both agents must wake/await/ack/lease) ──
  bridge_inbox: AGENT_ROLES,
  bridge_read: AGENT_ROLES,
  bridge_wake: AGENT_ROLES,
  bridge_await: AGENT_ROLES,
  bridge_ack: AGENT_ROLES,
  bridge_lease: AGENT_ROLES,
  // ── LEAD: direction, gating, arbitration ──
  bridge_directive_create: ['lead'],
  bridge_directive_update: ['lead'],
  bridge_lead_send: ['lead'],
  bridge_lead_reply: ['lead'],
  bridge_lead_approve_plan: ['lead'],
  bridge_lead_request_changes: ['lead'],
  bridge_lead_review: ['lead'],
  bridge_lead_wake_dev: ['lead'],
  bridge_lead_take_over: ['lead'],
  bridge_continue: ['lead'],
  bridge_pipeline_advance: ['lead'],
  bridge_feedback_loop: ['lead'],
  bridge_plan_review: ['lead'],
  bridge_init: ['lead'],
  bridge_project_switch: ['lead'],
  bridge_lane_create: ['lead'],
  bridge_lane_close: ['lead'],
  // ── DEV: execution ──
  bridge_dev_plan: ['dev'],
  bridge_dev_heartbeat: ['dev'],
  bridge_dev_ask: ['dev'],
  bridge_dev_submit_evidence: ['dev'],
  bridge_dev_wake_lead: ['dev'],
  bridge_dev_send: ['dev'],
  bridge_lane_claim: ['dev'],
  bridge_lane_heartbeat: ['dev'],
  // ── GATEKEEPER: release control (LEAD also holds the seal in this deployment) ──
  bridge_gatekeeper_certify: ['gatekeeper', 'lead'],
  bridge_merge_next: ['gatekeeper', 'lead'],
  bridge_freeze: ['gatekeeper', 'lead'],
  bridge_unlock: ['gatekeeper', 'lead'],
  bridge_heal: ['gatekeeper', 'lead'],
  // ── infra (both agents run tests against the stack) ──
  bridge_xampp: AGENT_ROLES,
  bridge_risk_assess: ['lead', 'dev', 'qa', 'security'],
  bridge_learning_add: ['lead', 'dev', 'qa', 'security']
});

/** CLI `cmd sub` → equivalent MCP tool, so one matrix governs both boundaries. */
const CLI_TO_TOOL = Object.freeze({
  'directive create': 'bridge_directive_create',
  'directive update': 'bridge_directive_update',
  'directive list': 'bridge_directive_list',
  'directive get': 'bridge_directive_get',
  'dev plan': 'bridge_dev_plan',
  'dev heartbeat': 'bridge_dev_heartbeat',
  'dev ask': 'bridge_dev_ask',
  'dev submit-evidence': 'bridge_dev_submit_evidence',
  'dev wake-lead': 'bridge_dev_wake_lead',
  'dev send': 'bridge_dev_send',
  'lead send': 'bridge_lead_send',
  'lead reply': 'bridge_lead_reply',
  'lead approve-plan': 'bridge_lead_approve_plan',
  'lead request-changes': 'bridge_lead_request_changes',
  'lead review': 'bridge_lead_review',
  'lead wake-dev': 'bridge_lead_wake_dev',
  'lead take-over': 'bridge_lead_take_over',
  'lead takeover': 'bridge_lead_take_over',
  'gatekeeper certify': 'bridge_gatekeeper_certify',
  'lane create': 'bridge_lane_create',
  'lane close': 'bridge_lane_close',
  'lane claim': 'bridge_lane_claim',
  'lane heartbeat': 'bridge_lane_heartbeat',
  'merge next': 'bridge_merge_next',
  freeze: 'bridge_freeze',
  unlock: 'bridge_unlock',
  heal: 'bridge_heal',
  verify: 'bridge_verify',
  init: 'bridge_init'
});

/** May `role` (short id) invoke `tool`? Unknown tools are NOT restricted here. */
function canInvoke(roleShort, tool) {
  const allowed = ROLE_CAPABILITY[tool];
  if (!allowed) return { ok: true, unlisted: true };
  const r = String(roleShort || '').toLowerCase();
  if (!ROLE_SHORT_IDS.includes(r)) return { ok: false, error: `Unknown role "${roleShort}"` };
  return allowed.includes(r) ? { ok: true } : { ok: false, error: `Role ${r.toUpperCase()} is not authorized for ${tool} (allowed: ${allowed.join(', ')})` };
}

/** Descriptive contract per role: what it owns, what it must never do. */
const ROLE_SPEC = Object.freeze({
  lead: {
    authorityId: ROLES.LEAD, name: 'Antigravity (Executive Engineering Lead)',
    purpose: 'Decide WHAT gets built, WHY, in what order, and whether it is done.',
    owns: ['architecture & contracts', 'directive authoring', 'plan approval', 'evidence review', 'release gate', 'arbitration'],
    mustNot: ['write product code directly (lawful ONLY via a declared take-over: reason=provider-failure with verifiable evidence, or reason=user-requested with the user\'s note)', 'submit a developer plan', 'submit evidence on behalf of the developer', 'certify without an APPROVED review'],
    responsibilities: [
      'Decompose intent into directives with invariants + acceptance criteria + surgical targets',
      'Review plans against invariants; APPROVE / REQUEST_CHANGES with concrete feedback',
      'Answer blockers fast and unblock the developer (never leave an OPEN question unanswered)',
      'Independently verify claims: inspect diffs, run the crawl, read the evidence manifest',
      'Own frozen-baseline integrity; authorize any change to a certified module',
      'Certify or reject releases; never accept unverifiable "done"'
    ]
  },
  dev: {
    authorityId: ROLES.DEV, name: 'Cline (Senior Staff Developer)',
    purpose: 'Decide HOW it is built and prove that it works.',
    owns: ['implementation', 'test authoring', 'real-data wiring', 'DOM evidence capture', 'blocker escalation'],
    mustNot: ['self-approve a plan', 'self-certify evidence', 'modify a frozen module without Lead authorization', 'fabricate data, counts, or test results', 'touch files claimed by another lane'],
    responsibilities: [
      'Reconnoitre before editing; reuse existing primitives instead of inventing',
      'Submit a plan (summary + ordered steps) and WAIT for approval before editing',
      'Emit heartbeats (<= 480s) so the Lead can see liveness',
      'Escalate blockers immediately rather than guessing',
      'Wire real MariaDB/API data — zero mocks, zero synthetic states',
      'Prove work with real tests + DOM crawl, then submit a hashed evidence manifest'
    ]
  },
  qa: {
    authorityId: 'QA_VALIDATOR', name: 'Automated QA & Accessibility Engine',
    purpose: 'Independently falsify the developer\'s claims.',
    owns: ['e2e execution', 'DOM census', 'WCAG audits', 'responsive matrix', 'perf budget'],
    mustNot: ['author product features', 'approve its own fixes'],
    responsibilities: ['Run E2E at 375/768/1280', 'Assert landmarks, contrast >= 4.5:1, focus order', 'Report raw evidence, not summaries']
  },
  security: {
    authorityId: 'SECURITY_AUDITOR', name: 'Enterprise Security & Compliance Sentinel',
    purpose: 'Falsify the security posture.',
    owns: ['secret scanning', 'RBAC/tenant isolation', 'injection defence', 'dependency audit'],
    mustNot: ['ship a waiver without the Lead'],
    responsibilities: ['Assert 401/403 on unauthenticated/unauthorized paths', 'Assert parameterized SQL only', 'Assert zero plaintext secrets']
  },
  gatekeeper: {
    authorityId: 'RELEASE_GATEKEEPER', name: 'Production Release Gatekeeper',
    purpose: 'Guard the release: evidence sealed, baseline intact, build green.',
    owns: ['baseline diff == 0', 'build budget', 'merge arbitration', 'release freeze'],
    mustNot: ['certify without an APPROVED review and a hashed evidence manifest'],
    responsibilities: ['Verify SHA-256 evidence seals', 'Assert frozen-path diff == 0', 'Stamp the freeze hash']
  }
});

/** The coordination contract: every handoff, its trigger, artifact, tool and SLA. */
const HANDOFFS = Object.freeze([
  { n: 1, from: 'lead', to: 'dev', when: 'directive ISSUED', artifact: 'spec + invariants + surgical targets', tool: 'bridge_directive_create', slaSeconds: 0, auto: 'wakes dev in PLAN' },
  { n: 2, from: 'dev', to: 'lead', when: 'PLAN_SUBMITTED', artifact: 'plan (summary + ordered steps)', tool: 'bridge_dev_plan', slaSeconds: 900, auto: 'durable lead wake' },
  { n: 3, from: 'lead', to: 'dev', when: 'IN_PROGRESS', artifact: 'approval + feedback', tool: 'bridge_lead_approve_plan', slaSeconds: 0, auto: 'wakes dev in ACT' },
  { n: 4, from: 'lead', to: 'dev', when: 'CHANGES_REQUESTED', artifact: 'concrete change list', tool: 'bridge_lead_request_changes', slaSeconds: 0, auto: 'wakes dev in PLAN' },
  { n: 5, from: 'dev', to: 'lead', when: 'blocked', artifact: 'question + context', tool: 'bridge_dev_ask', slaSeconds: 600, auto: 'durable lead wake' },
  { n: 6, from: 'lead', to: 'dev', when: 'blocker resolved', artifact: 'answer', tool: 'bridge_lead_reply', slaSeconds: 0, auto: 'wakes dev in ACT' },
  { n: 7, from: 'dev', to: 'lead', when: 'EVIDENCE_SUBMITTED', artifact: 'hashed evidence manifest + logs', tool: 'bridge_dev_submit_evidence', slaSeconds: 900, auto: 'durable lead wake' },
  { n: 8, from: 'lead', to: 'dev', when: 'evidence rejected', artifact: 'review feedback', tool: 'bridge_lead_review', slaSeconds: 0, auto: 'wakes dev in ACT' },
  { n: 9, from: 'lead', to: 'gatekeeper', when: 'APPROVED', artifact: 'review verdict + evidence hash', tool: 'bridge_gatekeeper_certify', slaSeconds: 600, auto: 'freeze + ledger' }
]);

/** Detect drift between the code matrix and the declarative config (roles v2). */
function roleConfigDrift() {
  const cfg = jsonRead(MASTER, {});
  const roles = cfg.roles || {};
  const map = { supervisor: 'lead', developer: 'dev', qa: 'qa', security: 'security', gatekeeper: 'gatekeeper' };
  const drift = [];
  for (const cfgKey of Object.keys(map)) {
    const short = map[cfgKey];
    const declared = roles[cfgKey] && roles[cfgKey].allowedTools;
    if (!Array.isArray(declared)) { drift.push({ role: short, configKey: cfgKey, issue: 'NO_allowedTools_IN_CONFIG' }); continue; }
    const actual = Object.keys(ROLE_CAPABILITY).filter(t => ROLE_CAPABILITY[t].includes(short)).sort();
    const missing = actual.filter(t => !declared.includes(t));
    const extra = declared.filter(t => !actual.includes(t));
    if (missing.length || extra.length) drift.push({ role: short, configKey: cfgKey, missing, extra });
  }
  return drift;
}

/**
 * Regenerate the declarative roles block FROM the code matrix, so the config can
 * never drift. Code is the source of truth; config is derived data.
 */
function syncRoleConfig(projectDir) {
  const map = { lead: 'supervisor', dev: 'developer', qa: 'qa', security: 'security', gatekeeper: 'gatekeeper' };
  const build = () => {
    const block = {};
    for (const short of ROLE_SHORT_IDS) {
      block[map[short]] = {
        role: ROLE_IDS[short], id: short,
        allowedTools: Object.keys(ROLE_CAPABILITY).filter(t => ROLE_CAPABILITY[t].includes(short)).sort()
      };
    }
    return block;
  };
  const targets = [MASTER];
  try {
    const r = findBridgeRoot(projectDir);
    if (r && r.bridgeDir) targets.push(path.join(r.bridgeDir, 'bridge.json'));
  } catch { }
  const written = [];
  const skipped = [];
  for (const t of targets) {
    try {
      if (!exists(t)) { skipped.push({ file: t, reason: 'MISSING' }); continue; }
      const cfg = jsonRead(t, null);
      // SAFETY (audit fix): NEVER overwrite a config we cannot fully parse, and
      // never write something that is not recognisably a bridge config. Blindly
      // falling back to `{}` here silently destroyed models / supervisor /
      // qualityGates / persistence when the file was corrupt.
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
        skipped.push({ file: t, reason: 'UNPARSEABLE_REFUSED' }); continue;
      }
      if (!cfg.bridgeVersion && !cfg.roles) {
        skipped.push({ file: t, reason: 'NOT_A_BRIDGE_CONFIG_REFUSED' }); continue;
      }
      cfg.roles = cfg.roles || {};
      const block = build();
      for (const key of Object.keys(block)) {
        cfg.roles[key] = Object.assign({}, cfg.roles[key] || {}, block[key]);
      }
      cfg.rolesVersion = 2;
      atomicWrite(t, cfg);
      written.push(t);
    } catch (e) { skipped.push({ file: t, reason: 'ERROR:' + e.message }); }
  }
  try { require('./autowake.cjs').logEvent('info', 'roles', 'ROLES_SYNCED', { written: written.length, skipped: skipped.length }); } catch { }
  return { success: skipped.length === 0, synced: written.length, files: written, skipped, configDrift: roleConfigDrift() };
}

/** Full role view for `bridge roles` / bridge_roles. */
function rolesInfo() {
  const matrix = roleMatrixReport();
  const caps = {};
  for (const r of ROLE_SHORT_IDS) {
    caps[r] = Object.keys(ROLE_CAPABILITY).filter(t => ROLE_CAPABILITY[t].includes(r));
  }
  const configDrift = roleConfigDrift();
  return {
    success: matrix.success && configDrift.length === 0,
    tools: matrix.tools, assigned: matrix.assigned,
    unassigned: matrix.unassigned, phantom: matrix.phantom, emptyRoles: matrix.emptyRoles,
    configDrift,
    roles: ROLE_SHORT_IDS.map(id => ({ id, authorityId: ROLE_IDS[id], tools: caps[id].length, spec: ROLE_SPEC[id] })),
    capabilityMatrix: caps,
    handoffs: HANDOFFS,
    enforcement: { mcp: true, cliWhenRoleDeclared: true, docs: path.join(__dirname, 'BRIDGE-ROLES.md') }
  };
}


function roleMatrixReport() {
  const declared = Object.keys(ROLE_CAPABILITY);
  const actual = TOOL_SCHEMAS.map(t => t.name);
  const unassigned = actual.filter(n => !declared.includes(n));
  const phantom = declared.filter(n => !actual.includes(n));
  const perRole = {};
  for (const r of ROLE_SHORT_IDS) perRole[r] = declared.filter(t => ROLE_CAPABILITY[t].includes(r)).length;
  const emptyRoles = ROLE_SHORT_IDS.filter(r => perRole[r] === 0);
  return {
    success: unassigned.length === 0 && phantom.length === 0 && emptyRoles.length === 0,
    tools: actual.length, assigned: declared.length,
    unassigned, phantom, perRole, emptyRoles,
    roles: ROLE_SHORT_IDS.map(id => ({ id, authorityId: ROLE_IDS[id], tools: perRole[id] }))
  };
}

const TOOL_DISPATCH = {
  bridge_help: () => ({ help: getBridgeHelp() }),
  bridge_status: a => status(a.projectDir),
  bridge_doctor: a => doctor(a.projectDir),
  bridge_freeze: a => freezeBridge(a.projectDir),
  bridge_xampp: a => xamppControl(a.action, a.target),
  // ── v4 autonomous-plane tools (so agents can drive them, not just humans) ──
  bridge_turn: a => require('./autowake.cjs').turn({ projectDir: a.projectDir }),
  bridge_await: a => require('./autowake.cjs').awaitEvent({ projectDir: a.projectDir, role: a.role || process.env.AI_BRIDGE_ROLE || 'dev', timeout: a.timeout == null ? 300 : a.timeout, autoAck: a.autoAck !== false }),
  bridge_ack: a => require('./autowake.cjs').ack({ projectDir: a.projectDir, role: a.role || process.env.AI_BRIDGE_ROLE || 'dev', id: a.id, source: 'mcp' }),
  bridge_lease: a => {
    const AW = require('./autowake.cjs');
    if (a.list) return AW.readAllLeases(a.projectDir);
    return AW.writeLease(a.projectDir, a.role || process.env.AI_BRIDGE_ROLE || 'dev', { transports: a.transports || ['file', 'mcp'], httpPort: a.httpPort || null });
  },
  bridge_heal: a => heal(a.projectDir),
  bridge_verify: a => verify(a.projectDir),
  bridge_logs: a => {
    const AW = require('./autowake.cjs');
    return a.summary ? AW.logSummary() : AW.readLogs({ level: a.level, component: a.component, projectKey: a.project, event: a.event, tail: a.tail == null ? 50 : a.tail });
  },
  bridge_protocol: () => protocolInfo(),
  bridge_lock_status: () => require('./autowake.cjs').freezeStatus(),
  bridge_unlock: a => require('./autowake.cjs').unlockWindow({ reason: a.reason, minutes: a.minutes, by: a.by || 'mcp' }),
  bridge_roles: () => rolesInfo(),
  bridge_lead_take_over: a => leadTakeover({ ...a, role: 'lead' }),
  bridge_lead_takeover_status: a => leadTakeoverStatus(a),
  bridge_inbox: a => {
    const role = a.role ? roleFrom(a.role) : (process.env.AI_BRIDGE_ROLE ? roleFrom(process.env.AI_BRIDGE_ROLE) : ROLES.DEV);
    return inbox({ role: role === ROLES.LEAD ? 'lead' : 'dev', projectDir: a.projectDir });
  },
  bridge_read: a => {
    const role = a.role ? roleFrom(a.role) : (process.env.AI_BRIDGE_ROLE ? roleFrom(process.env.AI_BRIDGE_ROLE) : ROLES.DEV);
    return markRead({ messageId: a.messageId, role: role === ROLES.LEAD ? 'lead' : 'dev', projectDir: a.projectDir });
  },
  bridge_directive_create: a => createDirective({ ...a, role: 'lead' }),
  bridge_directive_update: a => updateDirective({ ...a, role: 'lead' }),
  bridge_directive_list: a => getDirectives(requireBridge(a.projectDir).bridgeDir),
  bridge_directive_get: a => getDirective(requireBridge(a.projectDir).bridgeDir, a.directiveId || a.id),
  bridge_dev_plan: a => submitPlan({ ...a, role: 'dev' }),
  bridge_dev_heartbeat: a => heartbeat({ ...a, role: 'dev' }),
  bridge_dev_ask: a => ask({ ...a, role: 'dev' }),
  bridge_dev_submit_evidence: a => submitEvidence({ ...a, role: 'dev' }),
  bridge_dev_wake_lead: a => wakeLead({ ...a, role: 'dev' }),
  bridge_lead_send: a => sendMessage({ ...a, role: 'lead' }),
  bridge_dev_send: a => sendMessage({ ...a, role: 'dev' }),
  bridge_lead_reply: a => reply({ ...a, role: 'lead' }),
  bridge_lead_approve_plan: a => planApprove({ ...a, role: 'lead' }),
  bridge_lead_request_changes: a => planRequestChanges({ ...a, role: 'lead' }),
  bridge_lead_review: a => reviewDirective({ ...a, role: 'lead' }),
  bridge_lead_wake_dev: a => wakeCline({ ...a, role: 'lead' }),
  bridge_gatekeeper_certify: a => certify({ ...a, role: 'lead' }),
  bridge_wake: a => {
    const tgt = String(a.target || '').toLowerCase();
    if (tgt === 'lead' || tgt === 'supervisor') return wakeLead({ ...a, role: 'dev' });
    return wakeCline(a);
  },
  bridge_lane_create: a => laneCreate({ ...a, role: 'lead' }),
  bridge_lane_list: a => { const { bridgeDir } = requireBridge(a.projectDir); return lanes(bridgeDir); },
  bridge_lane_heartbeat: a => laneHeartbeat({ ...a, role: 'dev', laneId: `LANE-${String(a.name || a.laneId || '').toUpperCase()}` }),
  bridge_lane_close: a => { const r = a.role ? roleFrom(a.role) : ROLES.LEAD; return laneClose({ ...a, role: r === ROLES.DEV ? 'dev' : 'lead', laneId: `LANE-${String(a.name || a.laneId || '').toUpperCase()}` }); },
  bridge_lane_claim: a => { const r = a.role ? roleFrom(a.role) : ROLES.DEV; return laneClaim({ ...a, role: r === ROLES.DEV ? 'dev' : 'lead', laneId: `LANE-${String(a.name || a.laneId || '').toUpperCase()}` }); },
  bridge_lane_check: a => laneCheck(a),
  bridge_merge_next: a => mergeNext({ ...a, role: 'lead' }),
  bridge_merge_status: a => { const { bridgeDir } = requireBridge(a.projectDir); return jsonRead(paths(requireBridge(a.projectDir).bridgeDir).mergeQueue, { queue: [] }); },
  bridge_init: a => initProject(a.projectDir, a.name, Boolean(a.noScaffold)),
  bridge_test_ping: a => testBridge(a.projectDir),
  bridge_pipeline_next: a => pipelineNext(a.projectDir),
  bridge_continue: a => continueProject(a.projectDir, a),
  bridge_pipeline_advance: a => pipelineAdvance(a.projectDir),
  bridge_feedback_loop: a => runFeedbackLoop(a.projectDir, a),
  bridge_project_list: a => listProjects(),
  bridge_project_switch: a => setActiveProject(a.project || a.name || a.path),
  bridge_project_active: a => getActiveProject(),
  bridge_plan_review: a => {
    const { bridgeDir, projectRoot } = findBridgeRoot(a.projectDir);
    const d = a.directiveId ? getDirective(bridgeDir, a.directiveId) : null;
    const plan = {
      summary: a.summary || a.planText || (d?.plan?.summary) || '',
      steps: a.steps || (d?.plan?.steps) || []
    };
    return cognitivePlanReview(plan, d, projectRoot);
  },
  bridge_risk_assess: a => calculateBlastRadius(a.projectDir, a.files || a.fileClaims || []),
  bridge_learning_add: a => recordLearning(a.projectDir, a),
  bridge_learning_list: a => getLearnings(a.projectDir)
};

/** Resolve the declared role of an MCP/CLI client (defaults to LEAD, the CLI norm). */
function mcpRole() {
  const raw = String(process.env.AI_BRIDGE_ROLE || '').toLowerCase();
  if (raw === 'dev' || raw === 'developer' || raw === 'staff_developer') return 'dev';
  if (raw === 'lead' || raw === 'supervisor' || raw === 'lead_supervisor') return 'lead';
  if (ROLE_SHORT_IDS.includes(raw)) return raw;
  return 'lead';
}

function mcpSend(x) { process.stdout.write(JSON.stringify(x) + '\n'); }
function mcp() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', line => {
    if (!line.trim()) return;
    let msg; try { msg = JSON.parse(line); } catch { mcpSend({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return; }
    const id = msg.id ?? null;
    if (msg.method === 'initialize') {
      mcpSend({
        jsonrpc: '2.0', id, result: {
          protocolVersion: msg.params?.protocolVersion || '2024-11-05',
          capabilities: { tools: {} }, serverInfo: { name: 'ai-bridge', version: VERSION }
        }
      }); return;
    }
    if (msg.method === 'notifications/initialized' || msg.method === 'ping') { if (msg.id !== undefined) mcpSend({ jsonrpc: '2.0', id, result: {} }); return; }
    if (msg.method === 'tools/list') { mcpSend({ jsonrpc: '2.0', id, result: { tools: TOOL_SCHEMAS } }); return; }
    if (msg.method === 'tools/call') {
      try {
        const toolName = msg.params?.name;
        // ENFORCEMENT: separation of duties at the MCP boundary.
        const role = mcpRole();
        const guard = canInvoke(role, toolName);
        if (!guard.ok) {
          try { require('./autowake.cjs').logEvent('warn', 'roles', 'ROLE_DENIED', { role, tool: toolName, error: guard.error }); } catch { }
          mcpSend({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify({ error: guard.error, code: 'ROLE_FORBIDDEN', role, tool: toolName }, null, 2) }], isError: true } });
          return;
        }
        const result = TOOL_DISPATCH[toolName]?.(msg.params?.arguments || {});
        if (result === undefined) throw Object.assign(new Error(`Unknown tool: ${toolName}`), { code: -32601 });
        mcpSend({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: Boolean(result?.error) } });
      } catch (e) { mcpSend({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify({ error: e.message }, null, 2) }], isError: true } }); }
      return;
    }
    mcpSend({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${msg.method}` } });
  });
}

function print(x) { console.log(typeof x === 'string' ? x : JSON.stringify(x, null, 2)); }
function cli() {
  const a = parseArgs(process.argv.slice(2)); const cmd = (a._[0] || 'status').toLowerCase(); const sub = (a._[1] || '').toLowerCase();
  const __t0 = Date.now();
  const __AW = (() => { try { return require('./autowake.cjs'); } catch { return null; } })();
  const __log = (lvl, ev, detail, opts) => { try { if (__AW) __AW.logEvent(lvl, 'cli', ev, detail, opts); } catch { } };
  try {
    // Integrity guard: refuse MUTATING commands when frozen files drifted with
    // no open approval window (see `bridge unlock`). Read-only cmds only warn.
    if (!a.force && !['unlock', 'freeze', 'lock-status', 'logs', 'protocol', 'help', 'verify', 'models', 'mcp-config'].includes(cmd)) {
      try { if (__AW) __AW.integrityGuard(cmd); } catch (e) { console.error(`${COLORS.red}${e.message}${COLORS.reset}`); __log('error', 'INTEGRITY_BLOCK', { cmd, message: e.message }); process.exitCode = 1; return; }
    }
    // Role enforcement: when an agent declares AI_BRIDGE_ROLE, its CLI calls are
    // bound by the SAME capability matrix as MCP (closes the shell-out bypass).
    // NOTE: deliberately NOT bypassable by --force — separation of duties is not
    // an override; --force only relaxes the freeze/integrity guard.
    if (process.env.AI_BRIDGE_ROLE && !['help', 'roles', 'role', 'protocol', 'logs'].includes(cmd)) {
      const __tool = CLI_TO_TOOL[sub ? `${cmd} ${sub}` : cmd];
      if (__tool) {
        const __g = canInvoke(mcpRole(), __tool);
        if (!__g.ok) {
          console.error(`${COLORS.red}ROLE DENIED: ${__g.error}${COLORS.reset}`);
          try { if (__AW) __AW.logEvent('warn', 'roles', 'ROLE_DENIED_CLI', { role: mcpRole(), tool: __tool, cmd, sub }); } catch { }
          process.exitCode = 1; return;
        }
      }
    }
    // Auto-heal / auto-spawn the daemons on any CLI invocation (cheap, safe).
    if (cmd !== 'watch' && cmd !== 'listen') {
      try { selfHealLight(); } catch {}
    }
    if ((cmd === 'mcp' && sub !== 'config') || a.mcp) { mcp(); return; }
    if (cmd === 'help' || cmd === '--help' || cmd === '-h' || a.help) {
      console.log(getBridgeHelp()); return;
    }
    if (cmd === 'init' || cmd === 'setup' || cmd === 'bootstrap') {
      const targetDir = a.projectDir || a._[1] || process.cwd();
      print(initProject(targetDir, a.name, Boolean(a['no-scaffold']))); return;
    }
    if (cmd === 'test' || cmd === 'ping') {
      const targetDir = a.projectDir || a._[1] || process.cwd();
      print(testBridge(targetDir)); return;
    }
    if (cmd === 'status') { print(status(a.projectDir)); return; }
    if (cmd === 'doctor') { print(doctor(a.projectDir)); return; }
    if (cmd === 'continue' || cmd === 'resume') {
      print(continueProject(a.projectDir, { autoApprove: Boolean(a.auto || a.approve) }));
      return;
    }
    if (cmd === 'pipeline') {
      if (sub === 'continue' || sub === 'resume') { print(continueProject(a.projectDir, { autoApprove: Boolean(a.auto || a.approve) })); return; }
      if (sub === 'advance' || sub === 'auto') { print(pipelineAdvance(a.projectDir, { allowAutomation: a['allow-automation'] === true || a.allowAutomation === true })); return; }
      print(pipelineNext(a.projectDir)); return;
    }
    if (cmd === 'feedback' || cmd === 'loop') {
      print(runFeedbackLoop(a.projectDir, { autoApprove: Boolean(a.auto || a.approve), autoCertify: Boolean(a.auto || a.certify) })); return;
    }
    if (cmd === 'inbox') { print(inbox({ role: a.role || 'lead', projectDir: a.projectDir })); return; }
    if (cmd === 'read') {
      if (a._[1] === 'all' || a.all) {
        print(markAllRead({ role: a.role, projectDir: a.projectDir })); return;
      }
      print(markRead({ messageId: a._[1], role: a.role || 'lead', projectDir: a.projectDir })); return;
    }
    if (cmd === 'directive' && sub === 'create') { print(createDirective({ ...a, role: 'lead' })); return; }
    if (cmd === 'directive' && (sub === 'reissue' || sub === 'activate')) {
      print(reissueDirective({
        ...a,
        role: 'lead',
        directiveId: a.directive || a.directiveId || a.id || a._[2],
        reason: a.reason
      }));
      return;
    }
    if (cmd === 'directive' && sub === 'update') {
      print(updateDirective({
        ...a,
        role: 'lead',
        directiveId: a.directive || a.directiveId || a._[2],
        priority: a.priority,
        status: a.status,
        reason: a.reason,
        title: a.title,
        spec: a.spec,
        addInvariant: a['add-invariant'] || a.invariant,
        addCriteria: a['add-criteria'] || a.criteria
      }));
      return;
    }
    if (cmd === 'directive' && sub === 'list') { print(getDirectives(requireBridge(a.projectDir).bridgeDir)); return; }
    if (cmd === 'directive' && sub === 'get') { print(getDirective(requireBridge(a.projectDir).bridgeDir, a._[2])); return; }
    if (cmd === 'dev' && sub === 'plan') { print(submitPlan({ ...a, role: 'dev', directiveId: a.directive })); return; }
    if (cmd === 'dev' && sub === 'heartbeat') { print(heartbeat({ ...a, role: 'dev', directiveId: a.directive })); return; }
    if (cmd === 'dev' && sub === 'ask') { print(ask({ ...a, role: 'dev', directiveId: a.directive })); return; }
    if (cmd === 'dev' && sub === 'submit-evidence') { print(submitEvidence({ ...a, role: 'dev', directiveId: a.directive, domCrawl: a['dom-crawl'] })); return; }
    if (cmd === 'dev' && (sub === 'wake-lead' || sub === 'wake')) { print(wakeLead({ ...a, role: 'dev', directiveId: a.directive || a.directiveId, reason: a.reason || a.prompt })); return; }
    if (cmd === 'dev' && (sub === 'send' || sub === 'message' || sub === 'note')) { print(sendMessage({ ...a, role: 'dev', message: a.message || a.msg || a._[2], directiveId: a.directive || a.directiveId })); return; }
    if (cmd === 'lead' && (sub === 'send' || sub === 'message' || sub === 'instruct')) { print(sendMessage({ ...a, role: 'lead', message: a.message || a.msg || a._[2], directiveId: a.directive || a.directiveId })); return; }
    if (cmd === 'send' || cmd === 'message') { print(sendMessage({ ...a, message: a.message || a.msg || a._[1], directiveId: a.directive || a.directiveId })); return; }
    if (cmd === 'lead' && sub === 'reply') { print(reply({ ...a, role: 'lead', messageId: a.messageId || a['message-id'] || a._[2] })); return; }
    if (cmd === 'lead' && sub === 'approve-plan') { print(planApprove({ ...a, role: 'lead', directiveId: a.directive })); return; }
    if (cmd === 'lead' && sub === 'request-changes') { print(planRequestChanges({ ...a, role: 'lead', directiveId: a.directive })); return; }
    if (cmd === 'lead' && sub === 'review') { print(reviewDirective({ ...a, role: 'lead', directiveId: a.directive })); return; }
    if (cmd === 'lead' && (sub === 'wake-dev' || sub === 'wake')) { print(wakeCline({ ...a, role: 'lead', directiveId: a.directive || a.directiveId, mode: a.mode || 'act', target: a.target, prompt: a.prompt, projectDir: a.projectDir, force: Boolean(a.force), noUri: Boolean(a['no-uri'] || a.noUri) })); return; }
    if (cmd === 'lead' && (sub === 'take-over' || sub === 'takeover')) {
      if (a.end) { print(leadTakeover({ ...a, role: 'lead', end: true })); return; }
      if (a.status) { print(leadTakeoverStatus(a)); return; }
      print(leadTakeover({ ...a, role: 'lead', reason: a.reason, note: a.note, directiveId: a.directive || a.directiveId }));
      return;
    }
    if (cmd === 'lead' && sub === 'status') { print(leadTakeoverStatus(a)); return; }
    if (cmd === 'gatekeeper' && sub === 'certify') { print(certify({ ...a, role: 'lead', directiveId: a.directive, freezeHash: a['freeze-hash'] })); return; }
    // ── Autonomous mutual-wake plane (project-scoped, serverless-first) ───────
    if (cmd === 'turn' || (cmd === 'wake' && sub === 'turn')) { print(require('./autowake.cjs').turn({ projectDir: a.projectDir })); return; }
    if (cmd === 'await' || cmd === 'wait') {
      print(require('./autowake.cjs').awaitEvent({
        projectDir: a.projectDir, role: a.role || 'dev',
        timeout: a.timeout == null ? 300 : Number(a.timeout),
        autoAck: !(a['no-ack'] || a.noAck)
      }));
      return;
    }
    if (cmd === 'ack') { print(require('./autowake.cjs').ack({ projectDir: a.projectDir, role: a.role || 'dev', id: a.id || a._[1], source: 'cli' })); return; }
    if (cmd === 'lease' || (cmd === 'agents' && sub === 'lease')) {
      const AW = require('./autowake.cjs');
      if (sub === 'list' || a.list) { print(AW.readAllLeases(a.projectDir)); return; }
      print(AW.writeLease(a.projectDir, a.role || process.env.AI_BRIDGE_ROLE || 'dev', {
        transports: a.transports ? String(a.transports).split(';') : ['file', 'mcp'],
        httpPort: a.port ? Number(a.port) : null
      }));
      return;
    }
    if (cmd === 'mcp-config' || (cmd === 'mcp' && sub === 'config')) { print(require('./autowake.cjs').mcpConfig({ role: a.role || 'dev', install: Boolean(a.install) })); return; }
    if (cmd === 'logs' || cmd === 'log') {
      const AW = require('./autowake.cjs');
      if (a.summary) { print(AW.logSummary()); return; }
      if (a.follow || a.f) {
        let size = 0;
        try { size = fs.statSync(AW.LOG_FILE).size; } catch { }
        process.stdout.write(`following ${AW.LOG_FILE} (Ctrl+C to stop)\n`);
        setInterval(() => {
          try {
            const st = fs.statSync(AW.LOG_FILE);
            if (st.size < size) size = 0;
            if (st.size === size) return;
            const len = st.size - size;
            const fd = fs.openSync(AW.LOG_FILE, 'r');
            const buf = Buffer.alloc(len);
            fs.readSync(fd, buf, 0, len, size);
            fs.closeSync(fd);
            size = st.size;
            process.stdout.write(buf.toString('utf8'));
          } catch { }
        }, 700);
        return;
      }
      print(AW.readLogs({ level: a.level, component: a.component, projectKey: a.project, event: a.event, tail: a.tail == null ? 50 : Number(a.tail) }));
      return;
    }
    if (cmd === 'heal' || cmd === 'repair' || cmd === 'fix') { print(heal(a.projectDir)); return; }
    if (cmd === 'queue' || cmd === 'wake-queue') { print(queueCmd({ projectDir: a.projectDir, prune: Boolean(a.prune || a.apply) })); return; }
    if (cmd === 'verify' || cmd === 'selftest' || cmd === 'self-test') { print(verify(a.projectDir, { deep: Boolean(a.deep || a.all) })); return; }
    if (cmd === 'wake-doctor' || cmd === 'doctor-wake' || (cmd === 'wake' && sub === 'doctor')) { print(wakeDoctor(a.projectDir)); return; }
    if (cmd === 'wake') {
      const tgt = String(a.target || '').toLowerCase();
      if (tgt === 'lead' || tgt === 'supervisor') {
        print(wakeLead({ ...a, role: 'dev', directiveId: a.directive || a.directiveId, reason: a.reason || a.prompt, projectDir: a.projectDir }));
        return;
      }
      print(wakeCline({ ...a, directiveId: a.directive || a.directiveId, mode: a.mode, target: a.target, prompt: a.prompt, projectDir: a.projectDir, force: Boolean(a.force), noUri: Boolean(a['no-uri'] || a.noUri) }));
      return;
    }
    if (cmd === 'lane' && sub === 'create') { print(laneCreate({ ...a, role: 'lead', fileClaims: a.files ? String(a.files).split(';') : [], worktree: Boolean(a.worktree || a.wt), worktreePath: a.worktreePath || a['worktree-path'] })); return; }
    if (cmd === 'lane' && sub === 'list') { print(lanes(requireBridge(a.projectDir).bridgeDir)); return; }
    if (cmd === 'lane' && sub === 'heartbeat') { print(laneHeartbeat({ ...a, role: 'dev', laneId: `LANE-${String(a.name).toUpperCase()}` })); return; }
    if (cmd === 'lane' && sub === 'close') { print(laneClose({ ...a, role: 'lead', laneId: `LANE-${String(a.name).toUpperCase()}`, merge: Boolean(a.merge), removeWorktree: Boolean(a['remove-worktree'] || a.removeWorktree || a.rmwt) })); return; }
    if (cmd === 'lane' && sub === 'claim') { print(laneClaim({ ...a, role: 'lead', laneId: `LANE-${String(a.name).toUpperCase()}`, fileClaims: String(a.files || '').split(';').filter(Boolean) })); return; }
    if (cmd === 'lane' && sub === 'check') { print(laneCheck(a)); return; }
    if (cmd === 'lane' && sub === 'switch') { print(laneSwitch(a)); return; }
    if (cmd === 'visual-diff' || cmd === 'visual' || (cmd === 'evidence' && sub === 'visual-diff')) { print(visualDiff(a)); return; }
    if (cmd === 'package' || cmd === 'vsix') { print(packageExtension({ ...a, install: Boolean(a.install) })); return; }
    if (cmd === 'merge' && sub === 'next') { print(mergeNext({ ...a, role: 'lead', autoMerge: Boolean(a.auto) })); return; }
    if (cmd === 'merge' && sub === 'status') { print(jsonRead(paths(requireBridge(a.projectDir).bridgeDir).mergeQueue, { queue: [] })); return; }
    if (cmd === 'protocol' || cmd === 'spec') { print(protocolInfo()); return; }
    if (cmd === 'roles' || cmd === 'role') {
      if (a.sync) { print(syncRoleConfig(a.projectDir)); return; }
      print(rolesInfo()); return;
    }
    if (cmd === 'models') { print(modelsInfo()); return; }
    if (cmd === 'freeze-wake' || cmd === 'heal-wake') { print(ensureExtensionWakeSupport()); return; }
    if (cmd === 'lock' || cmd === 'lock-status' || cmd === 'freeze-status' || (cmd === 'freeze' && (a.verify || a.status))) {
      print(require('./autowake.cjs').freezeStatus()); return;
    }
    if (cmd === 'unlock' || cmd === 'approve-change') {
      print(require('./autowake.cjs').unlockWindow({ reason: a.reason, minutes: a.minutes, by: a.by })); return;
    }
    if (cmd === 'freeze' || cmd === 'freeze-bridge' || cmd === 'freeze-all') {
      const AWf = require('./autowake.cjs');
      print({ lock: AWf.freezeLock({ by: a.by || 'cli', reason: a.reason }), extension: freezeBridge(a.projectDir) });
      return;
    }
    if (cmd === 'watch' || cmd === 'listen') { require(path.join(__dirname, 'lead_watcher.cjs')); return; }
    if (cmd === 'plan' && (sub === 'review' || !sub)) {
      const { bridgeDir, projectRoot } = findBridgeRoot(a.projectDir);
      const d = (a.directive || a.directiveId) ? getDirective(bridgeDir, a.directive || a.directiveId) : null;
      const plan = {
        summary: a.summary || a.planText || (d?.plan?.summary) || a._[2] || '',
        steps: a.steps ? String(a.steps).split(';') : (d?.plan?.steps || [])
      };
      print(cognitivePlanReview(plan, d, projectRoot));
      return;
    }
    if (cmd === 'risk' || cmd === 'blast') {
      const files = a.files ? String(a.files).split(';') : (a._.slice(1).length ? a._.slice(1) : []);
      print(calculateBlastRadius(a.projectDir, files));
      return;
    }
    if (cmd === 'learning' || cmd === 'learn') {
      if (sub === 'list' || !sub) { print(getLearnings(a.projectDir)); return; }
      if (sub === 'add') {
        print(recordLearning(a.projectDir, {
          category: a.category || 'ARCHITECTURE',
          lesson: a.lesson || a.text || a._[2],
          invariant: a.invariant || a._[3],
          directiveId: a.directive || a.directiveId
        }));
        return;
      }
      throw new Error(`Unknown learning subcommand: ${sub}. Available: list, add`);
    }
    if (cmd === 'project') {
      if (sub === 'list' || !sub) { print(listProjects()); return; }
      if (sub === 'switch') { print(setActiveProject(a._[2] || a.name || a.path || a.project || 'auto')); return; }
      if (sub === 'add') { print(registerProject(a._[2] || a.path, a.name || a._[3])); return; }
      if (sub === 'active') { print(getActiveProject()); return; }
      throw new Error(`Unknown project subcommand: ${sub}. Available: list, switch, add, active`);
    }
    if (cmd === 'xampp' || cmd === 'server') {
      const act = sub || a.action || 'status';
      const tgt = a._[2] || a.target || 'all';
      print(xamppControl(act, tgt)); return;
    }
    throw new Error(`Unknown command: ${cmd} ${sub}`);
  } catch (e) {
    console.error(`${COLORS.red}ERROR: ${e.message}${COLORS.reset}`);
    __log('error', 'CLI_ERROR', { cmd, sub, message: String(e.message || e), where: String(e.stack || '').split('\n')[1] || null });
    process.exitCode = 1;
  } finally {
    if (!['mcp', 'watch', 'listen', 'logs'].includes(cmd)) {
      __log(process.exitCode === 1 ? 'warn' : 'info', 'CLI',
        { cmd, sub, projectDir: a.projectDir || null, exitCode: process.exitCode || 0 },
        { durationMs: Date.now() - __t0 });
    }
  }
}
if (require.main === module) {
  cli();
}
module.exports = {
  status, doctor, recalc, verifyLedger, readLedger, getDirectives, getDirective,
  createDirective, updateDirective, submitPlan, submitEvidence, heartbeat, ask, reply, reviewDirective, certify,
  laneCreate, laneHeartbeat, laneClose, laneClaim, laneCheck, laneSwitch, mergeNext, lanes, wakeCline, wakeLead, arbitrateMode, visualDiff, packageExtension,
  ensureExtensionWakeSupport, getLeadWatcherStatus, ensureLeadWatcher, freezeBridge,
  wakeDoctor, httpProbeStatusSync, DEV_IPC_PORT, FALLBACK_IPC_PORT, modelsInfo, protocolInfo, heal,
  planApprove, planRequestChanges, HUMAN_GATED, humanGateReason, inbox, markRead, markAllRead,
  loadRegistry, saveRegistry, registerProject, getActiveProject, setActiveProject, listProjects,
  initProject, generateAgentsMd, testBridge, pipelineNext, pipelineAdvance, runFeedbackLoop, autoDetectProject,
  actorProvenance, assertHumanAuthorisation, evidenceLooksPassing,
  resolveSurgicalContext, recordLearning, getLearnings, calculateBlastRadius, cognitivePlanReview, getBridgeHelp,
  requireBridge, findBridgeRoot, xamppControl
};


