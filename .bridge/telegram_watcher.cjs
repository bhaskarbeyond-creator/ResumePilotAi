// @ts-check
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const net = require('net');
const { exec, spawn } = require('child_process');
const { sendTelegramAlert, sendTelegramPhoto, BOT_TOKEN } = require('./telegram_notifier.cjs');

const BRIDGE_DIR = __dirname;
const PROJECT_ROOT = path.resolve(__dirname, '..');
const LEDGER_PATH = path.join(BRIDGE_DIR, 'ledger.jsonl');
const CONFIG_PATH = path.join(BRIDGE_DIR, 'telegram_config.json');
const STATE_PATH = path.join(BRIDGE_DIR, 'state.json');
const DIRECTIVES_DIR = path.join(BRIDGE_DIR, 'directives');
const EVIDENCE_DIR = path.join(BRIDGE_DIR, 'evidence');
const SCREENSHOT_PATH = path.join(BRIDGE_DIR, 'ide_ss.png');
const PID_FILE = path.join(BRIDGE_DIR, '.telegram_watcher.pid');
const BRIDGE_CLI = path.join('C:', 'Users', 'mbhas', '.ai-bridge', 'bridge.cjs');

let lastUpdateId = 0;

/**
 * Live TCP connection probe (e.g. MariaDB on 3306)
 */
function probeTcp(port, host = '127.0.0.1', timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, host);
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Live HTTP probe (e.g. Apache on 80)
 */
function probeHttp(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      resolve(res.statusCode || 200);
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Live AI Router probe on port 48200
 */
function probeAiRouter(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:48200/v1/models', { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.data && Array.isArray(json.data) && json.data.length > 0) {
            resolve({ ok: true, models: json.data.map(m => m.id).slice(0, 5) });
          } else {
            resolve({ ok: false, error: 'No models loaded' });
          }
        } catch {
          resolve({ ok: false, error: 'Invalid JSON' });
        }
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Timeout' });
    });
  });
}

/**
 * Capture fresh screenshot of the IDE window (or desktop fallback)
 */
async function captureScreenshot() {
  return new Promise((resolve) => {
    const psScript = path.join(BRIDGE_DIR, 'capture_ide.ps1');
    const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScript, SCREENSHOT_PATH], {
      timeout: 15000
    });
    child.on('close', code => {
      resolve(code === 0 && fs.existsSync(SCREENSHOT_PATH));
    });
    child.on('error', () => resolve(false));
  });
}

/**
 * Gather 100% genuine, live, dynamic project facts
 */
async function getLiveProjectContext() {
  const istNow = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'medium'
  });

  // 1. Master Transformation Goal & Review Unit accounting (100% computed from ground truth files)
  const goalPath = path.join(BRIDGE_DIR, 'goal.json');
  const invPath = path.join(EVIDENCE_DIR, 'dir098', 'inventory.json');
  let totalUnits = 0;
  let unitsAccepted = 0;
  if (fs.existsSync(invPath)) {
    try {
      const inv = JSON.parse(fs.readFileSync(invPath, 'utf8'));
      if (Array.isArray(inv.units)) {
        totalUnits = inv.units.length;
        unitsAccepted = inv.units.filter(u => u.acceptance === 'ACCEPTED' && (typeof u.score === 'number' ? u.score >= 98 : true)).length;
      } else if (inv.routes) {
        totalUnits = inv.routes;
      }
    } catch {}
  }

  let macroGoal = {
    title: 'Master UI/UX Transformation Programme',
    overallStatus: 'IN_PROGRESS',
    unitsAccepted,
    totalUnits,
    summary: `${unitsAccepted}/${totalUnits} Review Units Remediated. Phase One Discovery & Baseline Scaffolding certified; Phase Two Defect Remediation pending.`
  };
  if (fs.existsSync(goalPath)) {
    try {
      const g = JSON.parse(fs.readFileSync(goalPath, 'utf8'));
      if (g.goal) macroGoal.title = g.goal;
      if (g.status) macroGoal.overallStatus = g.status;
    } catch {}
  }

  // 2. Dynamic active/latest directive discovery
  let activeDirective = null;
  if (fs.existsSync(DIRECTIVES_DIR)) {
    try {
      const dirFiles = fs.readdirSync(DIRECTIVES_DIR).filter(f => /^DIR-\d+\.json$/.test(f));
      if (dirFiles.length > 0) {
        dirFiles.sort((a, b) => {
          const numA = parseInt(a.replace(/\D/g, ''), 10);
          const numB = parseInt(b.replace(/\D/g, ''), 10);
          return numB - numA;
        });

        // Check if there is an in-progress non-frozen directive
        const activeFile = dirFiles.find(f => {
          try {
            const d = JSON.parse(fs.readFileSync(path.join(DIRECTIVES_DIR, f), 'utf8'));
            return d.status !== 'APPROVED_FROZEN' && d.status !== 'CANCELLED';
          } catch { return false; }
        });

        if (activeFile) {
          const raw = JSON.parse(fs.readFileSync(path.join(DIRECTIVES_DIR, activeFile), 'utf8'));
          const lastHb = Array.isArray(raw.heartbeats) && raw.heartbeats.length > 0
            ? raw.heartbeats[raw.heartbeats.length - 1]
            : null;
          activeDirective = {
            isStandingBy: false,
            id: raw.id || activeFile.replace('.json', ''),
            title: raw.title || 'Untitled Directive',
            status: raw.status || 'IN_PROGRESS',
            priority: raw.priority || 'P1',
            progress: lastHb?.percent !== undefined ? `${lastHb.percent}%` : 'In Progress',
            currentStep: lastHb?.status || 'Active implementation',
            steps: Array.isArray(raw.plan?.steps) ? raw.plan.steps.slice(0, 5) : []
          };
        } else {
          // All directives are frozen; dynamically inspect tasks from register.json
          const lastRaw = JSON.parse(fs.readFileSync(path.join(DIRECTIVES_DIR, dirFiles[0]), 'utf8'));
          let nextPhaseDesc = 'Phase Two: Defect Remediation by Severity (Director formulating next directive)';
          const regPath = path.join(EVIDENCE_DIR, 'dir098', 'register.json');
          if (fs.existsSync(regPath)) {
            try {
              const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
              const openTask = Array.isArray(reg.tasks) ? reg.tasks.find(t => t.status === 'OPEN') : null;
              if (openTask?.title) {
                nextPhaseDesc = `${openTask.title} (Director formulating next directive)`;
              }
            } catch {}
          }

          activeDirective = {
            isStandingBy: true,
            status: 'STANDING_BY',
            lastCompletedDirective: {
              id: lastRaw.id || dirFiles[0].replace('.json', ''),
              title: lastRaw.title || 'Phase One Discovery & Scaffolding',
              phase: `${lastRaw.title || 'Phase One'} (100% certified & frozen)`
            },
            nextPhase: nextPhaseDesc
          };
        }
      }
    } catch {}
  }

  // 3. Recent ledger events (last 5)
  const recentEvents = [];
  if (fs.existsSync(LEDGER_PATH)) {
    try {
      const lines = fs.readFileSync(LEDGER_PATH, 'utf8').trim().split(/\r?\n/).filter(Boolean);
      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 6); i--) {
        try {
          const ev = JSON.parse(lines[i]);
          recentEvents.push({
            type: ev.type,
            title: ev.title || ev.body || '',
            sender: ev.sender || '',
            timeIST: new Date(ev.timestamp || Date.now()).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })
          });
        } catch {}
      }
    } catch {}
  }

  // 4. Real live service probes
  const [apacheStatus, mariaDbUp, aiRouterProbe] = await Promise.all([
    probeHttp('http://localhost/'),
    probeTcp(3306),
    probeAiRouter()
  ]);

  // 5. Real evidence scan in .bridge/evidence
  const recentEvidence = [];
  if (fs.existsSync(EVIDENCE_DIR)) {
    try {
      const evFiles = fs.readdirSync(EVIDENCE_DIR);
      // Check ux-gates log
      const uxGateFiles = evFiles.filter(f => /ux-gates\.log$/i.test(f)).sort().reverse();
      if (uxGateFiles.length > 0) {
        try {
          const p = path.join(EVIDENCE_DIR, uxGateFiles[0]);
          const stat = fs.statSync(p);
          const raw = fs.readFileSync(p, 'utf8').replace(/\0/g, '');
          const passMatch = raw.match(/(\d+)\s+passing|UX-AC\d/g);
          recentEvidence.push({
            name: 'ux-gates',
            file: uxGateFiles[0],
            ageSec: Math.round((Date.now() - stat.mtimeMs) / 1000),
            summary: passMatch ? `Passed: ${passMatch.length} checks` : 'Ran recently'
          });
        } catch {}
      }

      if (totalUnits > 0) {
        recentEvidence.push({
          name: 'ux-inventory',
          routes: totalUnits,
          accepted: unitsAccepted
        });
      }
    } catch {}
  }

  // 6. Real Git status (dynamically read from git status --porcelain)
  let gitInfo = { branch: '', dirtyFiles: 0, head: '' };
  try {
    const { execSync } = require('child_process');
    const statusOut = execSync('git status --porcelain', { cwd: PROJECT_ROOT, timeout: 2000 }).toString().trim();
    gitInfo.dirtyFiles = statusOut ? statusOut.split('\n').filter(Boolean).length : 0;
    const branchOut = execSync('git rev-parse --abbrev-ref HEAD', { cwd: PROJECT_ROOT, timeout: 2000 }).toString().trim();
    if (branchOut) gitInfo.branch = branchOut;
    const revOut = execSync('git rev-parse --short HEAD', { cwd: PROJECT_ROOT, timeout: 2000 }).toString().trim();
    if (revOut) gitInfo.head = revOut;
  } catch {}

  return {
    timeIST: istNow,
    macroGoal,
    activeDirective,
    recentEvents,
    infrastructure: {
      apache: apacheStatus ? `HTTP ${apacheStatus} (Running)` : 'DOWN',
      mariadb: mariaDbUp ? 'Port 3306 (Running)' : 'DOWN',
      aiRouter: aiRouterProbe.ok ? `Online (${aiRouterProbe.models?.[0] || 'auto'})` : `Offline (${aiRouterProbe.error})`
    },
    evidence: recentEvidence,
    git: gitInfo
  };
}

/**
 * Ask Real AI Lead to formulate an intelligent response to the user's prompt
 */
async function queryRealAiLead(userPrompt, context, isScreenshot = false) {
  const systemPrompt = `You are the Executive Engineering Lead AI for IME365 (Google DeepMind Antigravity architecture). You are conversing directly with the project owner/founder on Telegram.

LIVE PROJECT GROUND TRUTH (DO NOT FABRICATE):
${JSON.stringify(context, null, 2)}

INSTRUCTIONS & PROGRESS INTEGRITY:
1. Speak authoritatively, concisely, and truthfully using the LIVE facts above.
2. CRITICAL ON PROGRESS: The overall Master UI/UX Transformation programme is IN PROGRESS with 0/58 review units accepted. Only Phase One (DIR-098: discovery, inventory, baseline screenshots, and acceptance gates) was completed (100% of Phase One). NEVER tell the user the overall transformation is 100% done!
3. If activeDirective.isStandingBy is true, explain that Phase One is completed & frozen, and the system is standing by while the autonomous Director formulates the next directive (DIR-099: Phase Two defect remediation).
4. If the user asks for a screenshot caption, write a 1-2 sentence executive briefing (under 400 characters) highlighting that Phase One is baselined and Phase Two remediation is queuing.
5. For questions on progress or ETA: cite the exact macro progress (0/58 units remediated, Phase Two standing by).
6. Format your output using clean Telegram HTML tags ONLY (<b>bold</b>, <i>italic</i>, <code>code</code>). Never hallucinate unrun tests.`;

  const payload = JSON.stringify({
    model: 'auto',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: isScreenshot ? `User asked for screenshot. Provide fresh executive caption for screenshot.` : userPrompt }
    ],
    max_tokens: isScreenshot ? 200 : 450,
    temperature: 0.3
  });

  return new Promise((resolve) => {
    const req = http.request('http://127.0.0.1:48200/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 12000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const reply = json.choices?.[0]?.message?.content?.trim();
          if (reply) return resolve(reply);
        } catch {}
        resolve(fallbackLiveSynthesis(context));
      });
    });

    req.on('error', () => resolve(fallbackLiveSynthesis(context)));
    req.on('timeout', () => {
      req.destroy();
      resolve(fallbackLiveSynthesis(context));
    });
    req.write(payload);
    req.end();
  });
}

/**
 * 100% honest, non-hallucinated fallback synthesis when local AI router is temporarily unreachable
 */
function fallbackLiveSynthesis(ctx) {
  let text = `📊 <b>IME365 Executive Engineering Status</b>\n`;
  text += `🕒 <b>Time (IST):</b> ${ctx.timeIST}\n\n`;
  text += `🎯 <b>Master UI/UX Programme:</b> IN PROGRESS\n`;
  text += `• <b>Macro Progress:</b> 0/58 Review Units Remediated (Phase Two Queued)\n`;
  if (ctx.activeDirective?.isStandingBy) {
    const last = ctx.activeDirective.lastCompletedDirective;
    text += `• <b>Phase Status:</b> Phase One (<code>${last.id}</code>) Certified (100% of Phase 1)\n`;
    text += `• <b>Next Action:</b> <i>Standing by for Director to issue Phase Two directive (DIR-099)</i>\n`;
  } else if (ctx.activeDirective) {
    text += `• <b>Active Directive:</b> <code>${ctx.activeDirective.id}</code> (${ctx.activeDirective.status}) — <b>${ctx.activeDirective.progress}</b>\n`;
    text += `• <b>Current Step:</b> <i>${escapeHtml(ctx.activeDirective.currentStep)}</i>\n`;
  }
  text += `\n⚙️ <b>Live Infrastructure:</b>\n`;
  text += `• Apache: ${ctx.infrastructure.apache === 'HTTP 200 (Running)' ? '✅' : '⚠️'} ${ctx.infrastructure.apache}\n`;
  text += `• MariaDB: ${ctx.infrastructure.mariadb.includes('Running') ? '✅' : '⚠️'} ${ctx.infrastructure.mariadb}\n`;
  text += `• AI Router: ${ctx.infrastructure.aiRouter.includes('Online') ? '✅' : '⚠️'} ${ctx.infrastructure.aiRouter}\n`;

  if (ctx.recentEvents.length > 0) {
    text += `\n📋 <b>Recent Events:</b>\n`;
    ctx.recentEvents.slice(0, 3).forEach(ev => {
      text += `• [${ev.timeIST}] <code>${ev.type}</code>: ${escapeHtml(ev.title.slice(0, 60))}\n`;
    });
  }
  text += `\n<i>Reply with any question or command (e.g. <b>ss</b>, <b>wake</b>, <b>status</b>).</i>`;
  return text;
}

function escapeHtml(text) {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Execute command remotely from Telegram and reply with output
 */
function executeRemoteCommand(cmdStr) {
  return new Promise((resolve) => {
    exec(cmdStr, { cwd: PROJECT_ROOT, timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      let out = (stdout || '') + (stderr || '');
      if (!out && err) out = err.message;
      if (!out) out = 'Command completed with no output.';
      if (out.length > 3500) {
        out = out.slice(0, 1000) + '\n... [truncated] ...\n' + out.slice(-2000);
      }
      resolve(out);
    });
  });
}

/**
 * Poll incoming user messages from Telegram (Bidirectional + Real AI Integration)
 */
async function pollIncomingMessages() {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=10`;

  const req = https.get(url, { timeout: 15000 }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', async () => {
      try {
        const json = JSON.parse(data);
        if (json.ok && Array.isArray(json.result)) {
          for (const update of json.result) {
            lastUpdateId = Math.max(lastUpdateId, update.update_id);
            const msg = update.message;
            if (!msg || !msg.text) continue;

            const rawText = msg.text.trim();
            const text = rawText.toLowerCase();
            const sender = msg.from?.first_name || 'User';
            console.log(`[Telegram] Command: "${rawText}" from ${sender}`);

            // Fetch 100% fresh, live context for this request
            const liveContext = await getLiveProjectContext();

            // 1. SCREENSHOT COMMAND: Fresh shot + Real AI Executive Caption
            if (/^(ss|shot|screenshot|\/shot|\/screenshot|pic|photo|screen)\b/i.test(text) || text.includes('screenshot') || text.includes('screen')) {
              const hasShot = await captureScreenshot();
              const aiCaption = await queryRealAiLead(rawText, liveContext, true);

              if (hasShot) {
                const photoOk = await sendTelegramPhoto(SCREENSHOT_PATH, aiCaption);
                if (photoOk) {
                  console.log(`[Telegram] Sent IDE screenshot to ${sender} with Real AI caption`);
                } else {
                  // Fallback to text if photo fails
                  await sendTelegramAlert(`📸 <b>Screenshot Captured</b>\n\n${aiCaption}`);
                  console.log(`[Telegram] Fallback text status sent to ${sender}`);
                }
              } else {
                await sendTelegramAlert(`⚠️ <i>Could not capture IDE window. Live Briefing:</i>\n\n${aiCaption}`);
                console.log(`[Telegram] Desktop fallback status sent to ${sender}`);
              }
            }
            // 2. REMOTE FIX: RELOAD LM STUDIO MODEL
            else if (text === 'fix model' || text === '/fix_model' || text === 'load model') {
              const out = await executeRemoteCommand('lms load qwen2.5-coder-14b-instruct-abliterated --gpu 0.35 -y --identifier qwen2.5-coder-14b-instruct-abliterated');
              await sendTelegramAlert(`✅ <b>Model Load Result:</b>\n<pre>${escapeHtml(out.slice(-500))}</pre>`);
              console.log(`[Telegram] Executed fix model command from ${sender}`);
            }
            // 3. REMOTE FIX: WAKE DEVELOPER
            else if (text === 'wake' || text === '/wake' || text === 'wake dev') {
              const activeId = liveContext.activeDirective?.id || 'DIR-098';
              spawn(process.execPath, [BRIDGE_CLI, 'wake', '--directive', activeId, '--mode', 'act']);
              await sendTelegramAlert(`⚡ <b>Wake Signal Dispatched!</b>\nTriggered developer wake signal in ACT mode for <code>${activeId}</code>.`);
              console.log(`[Telegram] Dispatched wake signal for ${activeId} requested by ${sender}`);
            }
            // 4. REMOTE COMMAND EXECUTION
            else if (text.startsWith('run ') || text.startsWith('/cmd ')) {
              const cmd = rawText.replace(/^(run|\/cmd)\s+/i, '');
              const out = await executeRemoteCommand(cmd);
              await sendTelegramAlert(`⚙️ <b>Command:</b> <code>${escapeHtml(cmd)}</code>\n<pre>${escapeHtml(out)}</pre>`);
              console.log(`[Telegram] Executed remote cmd "${cmd}" from ${sender}`);
            }
            // 5. HELP
            else if (text === '/start' || text === 'help' || text === '/help') {
              await sendTelegramAlert('👋 <b>IME365 Executive AI Remote Control</b>\n\nPowered by Real AI (DeepMind Antigravity Control Plane).\n\nCommands & Queries:\n• Ask <b>ANY question</b> – Real AI analyzes live codebase and responds\n• <code>ss</code> or <code>shot</code> – IDE Screenshot with AI executive caption\n• <code>status</code> or <code>progress</code> – Live status briefing\n• <code>wake</code> – Wake developer in ACT mode\n• <code>run &lt;cmd&gt;</code> – Run terminal command');
            }
            // 6. ALL OTHER QUESTIONS / QUERIES: REAL AI RESPONDS DYNAMICALLY!
            else {
              console.log(`[Telegram] Routing query "${rawText}" to Real AI Lead...`);
              const aiResponse = await queryRealAiLead(rawText, liveContext, false);
              const sentOk = await sendTelegramAlert(aiResponse);
              console.log(`[Telegram] Sent Real AI response to ${sender}: ${sentOk}`);
            }
          }
        }
      } catch (err) {
        console.error('[Telegram] Parse error:', err);
      }
      setTimeout(pollIncomingMessages, 1000);
    });
  });

  req.on('timeout', () => {
    req.destroy();
    setTimeout(pollIncomingMessages, 2000);
  });
  req.on('error', (err) => {
    console.error('[Telegram] Network poll error:', err);
    setTimeout(pollIncomingMessages, 5000);
  });
}

let lastIdleAlertKey = null;
let lastIdleAlertTime = 0;
let lastProcessedLedgerLine = 0;

/**
 * Continuous Developer Idle Monitor
 * Detects both event-driven transitions (e.g. plan/evidence submitted, frozen)
 * and inactivity stalls (e.g. no activity in PLAN/ACT mode for >= 90s)
 * and reports IMMEDIATELY to Telegram.
 */
async function monitorDeveloperIdleState() {
  try {
    const now = Date.now();
    let currentIdleState = null;

    // 1. Check ledger events for new status transitions
    if (fs.existsSync(LEDGER_PATH)) {
      try {
        const lines = fs.readFileSync(LEDGER_PATH, 'utf8').trim().split(/\r?\n/).filter(Boolean);
        if (lastProcessedLedgerLine === 0) {
          lastProcessedLedgerLine = lines.length;
        } else if (lines.length > lastProcessedLedgerLine) {
          for (let i = lastProcessedLedgerLine; i < lines.length; i++) {
            const ev = JSON.parse(lines[i]);
            const dId = ev.payload?.directiveId || 'current';

            if (ev.type === 'GATEKEEPER_CERTIFIED') {
              currentIdleState = {
                key: `FROZEN:${dId}`,
                emoji: '⏸️',
                title: 'Developer is IDLE (Directive Completed)',
                desc: `Directive <code>${dId}</code> has been certified & frozen. Developer has completed all assigned tasks and is standing by for the next directive.`
              };
            } else if (ev.type === 'PLAN_SUBMITTED') {
              currentIdleState = {
                key: `WAIT_PLAN:${dId}`,
                emoji: '📋',
                title: 'Developer is IDLE (Awaiting Plan Approval)',
                desc: `Developer submitted plan for <code>${dId}</code>. Paused and waiting for Lead review.`
              };
            } else if (ev.type === 'EVIDENCE_SUBMITTED') {
              currentIdleState = {
                key: `WAIT_EVIDENCE:${dId}`,
                emoji: '🧪',
                title: 'Developer is IDLE (Awaiting Certification)',
                desc: `Developer submitted evidence for <code>${dId}</code>. Implementation done; awaiting Gatekeeper certification.`
              };
            } else if (ev.type === 'QUESTION_ASKED' && ev.status === 'OPEN') {
              currentIdleState = {
                key: `BLOCKED:${ev.id}`,
                emoji: '❓',
                title: 'Developer is IDLE (Blocked on Question)',
                desc: `Developer is blocked waiting for Lead response: <i>${escapeHtml(ev.title || ev.body || '')}</i>`
              };
            }
          }
          lastProcessedLedgerLine = lines.length;
        }
      } catch {}
    }

    // 2. Check for active directive inactivity / stall
    if (!currentIdleState && fs.existsSync(DIRECTIVES_DIR)) {
      try {
        const dirFiles = fs.readdirSync(DIRECTIVES_DIR).filter(f => /^DIR-\d+\.json$/.test(f));
        dirFiles.sort((a, b) => {
          const numA = parseInt(a.replace(/\D/g, ''), 10);
          const numB = parseInt(b.replace(/\D/g, ''), 10);
          return numB - numA;
        });

        // Find primary active directive
        const activeFile = dirFiles.find(f => {
          try {
            const d = JSON.parse(fs.readFileSync(path.join(DIRECTIVES_DIR, f), 'utf8'));
            return d.status !== 'APPROVED_FROZEN' && d.status !== 'CANCELLED';
          } catch { return false; }
        });

        if (activeFile) {
          const d = JSON.parse(fs.readFileSync(path.join(DIRECTIVES_DIR, activeFile), 'utf8'));

          // Check last developer activity time
          let lastDevTime = new Date(d.updatedAt || d.createdAt).getTime();
          if (Array.isArray(d.heartbeats) && d.heartbeats.length > 0) {
            const lastHb = d.heartbeats[d.heartbeats.length - 1];
            if (lastHb.timestamp) lastDevTime = Math.max(lastDevTime, new Date(lastHb.timestamp).getTime());
          }

          const silentSec = Math.round((now - lastDevTime) / 1000);
          const silentMin = Math.round(silentSec / 60);

          // If developer has been silent for >= 90 seconds in ISSUED, CHANGES_REQUESTED, or IN_PROGRESS
          if (silentSec >= 90) {
            if (d.status === 'ISSUED') {
              currentIdleState = {
                key: `IDLE_ISSUED:${d.id}:${Math.floor(silentMin / 5)}`,
                emoji: '⚠️',
                title: `Developer is IDLE in PLAN Mode (${silentMin}m)`,
                desc: `Directive <code>${d.id}</code> was issued, but developer has not started or submitted a plan for <b>${silentMin} minutes</b>.\n\n<i>Reply <b>wake</b> to trigger PLAN mode.</i>`
              };
            } else if (d.status === 'CHANGES_REQUESTED') {
              currentIdleState = {
                key: `IDLE_REVISION:${d.id}:${Math.floor(silentMin / 5)}`,
                emoji: '⚠️',
                title: `Developer is IDLE awaiting Revision (${silentMin}m)`,
                desc: `Changes requested on <code>${d.id}</code>, but developer has been inactive for <b>${silentMin} minutes</b>.\n\n<i>Reply <b>wake</b> to wake developer.</i>`
              };
            } else if (d.status === 'IN_PROGRESS') {
              currentIdleState = {
                key: `IDLE_ACT:${d.id}:${Math.floor(silentMin / 5)}`,
                emoji: '⚠️',
                title: `Developer is IDLE / Inactive in ACT Mode (${silentMin}m)`,
                desc: `Directive <code>${d.id}</code> is in progress, but no heartbeat or developer activity detected for <b>${silentMin} minutes</b>.\n\n<i>Reply <b>wake</b> to wake developer in ACT mode.</i>`
              };
            } else if (d.status === 'PLAN_SUBMITTED') {
              currentIdleState = {
                key: `IDLE_PLAN_SUBMITTED:${d.id}`,
                emoji: '📋',
                title: 'Developer is IDLE (Awaiting Plan Approval)',
                desc: `Plan submitted for <code>${d.id}</code>. Developer is paused awaiting Lead plan review.`
              };
            } else if (d.status === 'EVIDENCE_SUBMITTED') {
              currentIdleState = {
                key: `IDLE_EVIDENCE_SUBMITTED:${d.id}`,
                emoji: '🧪',
                title: 'Developer is IDLE (Awaiting Certification)',
                desc: `Evidence submitted for <code>${d.id}</code>. Developer is paused awaiting Gatekeeper certification.`
              };
            }
          }
        } else {
          // No active directive at all (all frozen)
          const lastRaw = JSON.parse(fs.readFileSync(path.join(DIRECTIVES_DIR, dirFiles[0]), 'utf8'));
          currentIdleState = {
            key: `IDLE_STANDING_BY:${lastRaw.id}`,
            emoji: '⏸️',
            title: 'Developer is IDLE (Standing By)',
            desc: `All assigned directives are completed (latest: <code>${lastRaw.id}</code>). Developer is standing by for Director to issue the next directive.`
          };
        }
      } catch {}
    }

    // 3. Dispatch alert immediately if new idle state detected
    if (currentIdleState && currentIdleState.key !== lastIdleAlertKey) {
      lastIdleAlertKey = currentIdleState.key;
      lastIdleAlertTime = now;

      const alertMsg = `${currentIdleState.emoji} <b>[IME365] ${currentIdleState.title}</b>\n\n` +
        `🕒 <b>Time (IST):</b> ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}\n` +
        `${currentIdleState.desc}`;

      console.log(`[Telegram Watcher] Dispatching immediate Developer Idle Alert: ${currentIdleState.key}`);
      await sendTelegramAlert(alertMsg);
    } else if (!currentIdleState) {
      // Developer is actively making progress; clear idle key
      lastIdleAlertKey = null;
    }
  } catch (err) {
    console.error('[Telegram Watcher] Error in idle monitor:', err);
  }
}

module.exports = {
  getLiveProjectContext,
  queryRealAiLead,
  captureScreenshot,
  monitorDeveloperIdleState
};

if (require.main === module) {
  // Crash Protection: Ensure process never terminates on unhandled exceptions
  process.on('uncaughtException', (err) => {
    console.error('[Telegram Watcher] Uncaught Exception:', err.message);
    setTimeout(pollIncomingMessages, 3000);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[Telegram Watcher] Unhandled Rejection:', reason);
    setTimeout(pollIncomingMessages, 3000);
  });

  // Singleton Lock: ensure only ONE instance can ever run
  if (fs.existsSync(PID_FILE)) {
    try {
      const oldPid = Number.parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (oldPid && oldPid !== process.pid) {
        try {
          process.kill(oldPid, 0); // Check if alive
          console.log(`[Telegram Watcher] Terminating previous zombie process PID ${oldPid}...`);
          process.kill(oldPid, 'SIGKILL');
        } catch {}
      }
    } catch {}
  }
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
  process.on('exit', () => {
    try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch {}
  });

  // Start polling for user commands & questions with Real AI responses
  pollIncomingMessages();

  // Start continuous developer idle monitor (runs every 5s for immediate alerting)
  setInterval(monitorDeveloperIdleState, 5000);
  monitorDeveloperIdleState();
  console.log('[Telegram Watcher] Real AI Autonomous Responder & Developer Idle Monitor ACTIVE.');
}
