import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * DIR-051 XAMPP SERVER POLICY GUARD
 *
 * WHY THIS EXISTS: The operational invariant (AGENTS.md section 56) requires that ALL
 * web / API / reverse-proxy / database servers are initiated and hosted strictly via
 * XAMPP (Apache on ports 80/443, MariaDB on port 3306). Spawning detached or rogue
 * background server processes (`start /min node index.js`, background nodemon, background
 * vite, `Start-Process node ...`, Node `spawn(..., { detached: true })`) is strictly
 * prohibited because it causes port and daemon conflicts with XAMPP.
 *
 * The historical offender that motivated this guard was
 * scripts/START_RESUMEPILOT_SERVICES.bat, which ran:
 *   start /min "ResumePilot Backend" cmd /c "cd /d ... && node index.js"
 *   start /min "AI Bridge Watcher" cmd /c "node ...lead_watcher_daemon.cjs --loop"
 * The first line could never even boot (no root index.js exists) and both lines escaped
 * any managed lifecycle. This suite pins the remediation with (a) a static repo-wide
 * scan plus efficacy canary for every forbidden spawn vector, (b) live port-ownership
 * proof that 80/443 belong to httpd.exe and 3306 to mysqld.exe, and (c) positive pins
 * that the START/STOP service scripts route lifecycle through `bridge xampp start/stop all`.
 *
 * NOTE ON SCOPE: standalone `npm run test:xampp-policy` suite, intentionally NOT folded
 * into the frozen `test:security:static` baseline. Live assertions are win32-gated
 * because XAMPP (D:\xampp) only exists on the developer host; elsewhere they skip with
 * an explicit reason instead of going red.
 */

const root = path.resolve(import.meta.dirname, '..');

// This guard file itself documents the forbidden patterns (prose + canary fixtures), so it
// must never be scanned by itself - the canary test proves the patterns still have teeth.
const SELF_TEST_FILE = path.resolve(import.meta.dirname, 'xampp-policy-guard.test.mjs');

// Generated artifacts, third-party code, and bridge state - never executable repo tooling.
// `dashboardTemplate` is vendored third-party template source whose minified vendor bundles
// (jarallax/echarts) trip the JS vectors coincidentally; nothing there spawns our servers.
const SKIP_DIRS = new Set([
    'node_modules', '.git', '.bridge', 'dist', 'dist-base', 'dist-scoped',
    'artifacts', 'backups', 'crawl-artifacts', 'test-results', 'playwright-report',
    'coverage', '.vscode', '.github', '.agents', '.arena', 'extension', 'dashboardTemplate',
]);

const SHELL_EXTS = ['.bat', '.cmd', '.ps1', '.vbs'];
const JS_EXTS = ['.js', '.mjs', '.cjs'];

const SPAWN_VECTORS = [
    {
        id: 'V1-cmd-start-detached-runtime',
        exts: SHELL_EXTS,
        pattern: /^[ \t]*start(?:\s+\/[a-z]+)*[^\r\n]*\b(?:node|nodemon|vite|npm|npx)\b/imu,
        why: 'cmd `start` detaches the child - use `bridge xampp start all` instead of spawning node/vite/nodemon.',
    },
    {
        id: 'V2-powershell-start-process-runtime',
        exts: SHELL_EXTS,
        pattern: /\bStart-Process\b[^\r\n]*\b(?:node|nodemon|vite)\b/iu,
        why: 'PowerShell Start-Process launching a JS runtime creates an unmanaged background server.',
    },
    {
        id: 'V3-js-detached-child-process',
        exts: JS_EXTS,
        pattern: /\bdetached\s*:\s*true\b/u,
        why: 'child_process with detached:true survives the parent task as a rogue background server.',
    },
    {
        id: 'V4-js-shell-start-detach',
        exts: JS_EXTS,
        pattern: /(?:spawn|exec\w*)\s*\([^\r\n]{0,160}\/c[^\r\n]{0,80}['"`]start['"`][^\r\n]{0,80}\b(?:node|vite|nodemon)\b/u,
        why: 'Node spawning `cmd /c start ... node|vite` replicates the detached cmd vector from JS.',
    },
    {
        id: 'V5-script-host-vbs-launcher',
        exts: SHELL_EXTS,
        pattern: /\b(?:wscript|cscript)(?:\.exe)?\b[^\r\n]*\.vbs/iu,
        why: 'VBS script-host launchers hide detached node processes; server lifecycle must stay under XAMPP.',
    },
];

function walk(dir, exts, out = []) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(item.name)) continue;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) walk(full, exts, out);
        else if (exts.includes(path.extname(item.name).toLowerCase())) out.push(full);
    }
    return out;
}

describe('DIR-051 XAMPP server policy guard', () => {
    it('repo contains zero forbidden detached/background server spawn vectors', () => {
        const files = walk(root, [...SHELL_EXTS, ...JS_EXTS])
            .filter(f => path.resolve(f) !== SELF_TEST_FILE);
        const offenders = [];
        for (const vector of SPAWN_VECTORS) {
            for (const file of files.filter(f => vector.exts.includes(path.extname(f).toLowerCase()))) {
                const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
                lines.forEach((line, idx) => {
                    if (vector.pattern.test(line)) {
                        const rel = path.relative(root, file).replace(/\\/g, '/');
                        offenders.push(`${rel}:${idx + 1} [${vector.id}] ${line.trim().slice(0, 140)}`);
                    }
                });
            }
        }
        assert.deepEqual(
            offenders,
            [],
            `Forbidden server spawn vectors detected - DIR-051 requires all servers under XAMPP:\n${offenders.join('\n')}`
        );
    });

    it('spawn-vector patterns catch the historical offenders (guard efficacy canary)', () => {
        const HISTORICAL = [
            ['V1-cmd-start-detached-runtime', 'start /min "ResumePilot Backend" cmd /c "cd /d D:\\xampp\\htdocs\\IME365 && node index.js"'],
            ['V1-cmd-start-detached-runtime', 'start /min "AI Bridge Watcher" cmd /c "node \\"C:\\Users\\mbhas\\.ai-bridge\\lead_watcher_daemon.cjs\\" --loop"'],
            ['V2-powershell-start-process-runtime', 'Start-Process -FilePath "node" -ArgumentList "server.js" -WindowStyle Hidden'],
            ['V3-js-detached-child-process', "const child = spawn('node', ['index.js'], { detached: true, stdio: 'ignore' });"],
            ['V4-js-shell-start-detach', "spawn('cmd', ['/c', 'start', '', 'node', 'index.js']);"],
            ['V5-script-host-vbs-launcher', 'wscript "C:\\Users\\mbhas\\.ai-bridge\\lead_watcher_silent.vbs"'],
        ];
        for (const [vectorId, sample] of HISTORICAL) {
            const vector = SPAWN_VECTORS.find(v => v.id === vectorId);
            assert.ok(vector, `vector ${vectorId} must exist`);
            assert.ok(vector.pattern.test(sample), `guard must detect historical offender via ${vectorId}: ${sample}`);
        }
    });

    it('START/STOP service scripts + package.json route server lifecycle through bridge xampp', () => {
        const startBat = fs.readFileSync(path.join(root, 'scripts/START_RESUMEPILOT_SERVICES.bat'), 'utf8');
        const stopBat = fs.readFileSync(path.join(root, 'scripts/STOP_RESUMEPILOT_SERVICES.bat'), 'utf8');
        assert.match(startBat, /bridge xampp start all/, 'START script must start servers exclusively via `bridge xampp start all`');
        assert.match(stopBat, /bridge xampp stop all/, 'STOP script must stop servers exclusively via `bridge xampp stop all`');
        assert.doesNotMatch(startBat, /^[ \t]*start\b[^\r\n]*\b(?:node|nodemon|vite)\b/im, 'START script must not detach node/vite servers');

        const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        assert.equal(pkg.scripts['test:xampp-policy'], 'node --test tests/xampp-policy-guard.test.mjs');
    });

    it('live: ports 80/443 are owned by XAMPP httpd.exe and 3306 by mysqld.exe', { skip: process.platform !== 'win32' ? 'XAMPP live ownership check requires a win32 host' : false }, () => {
        const ownerOf = (port) => {
            const script = `$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($null -eq $c) { '' } else { $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; if ($null -eq $p) { 'unknown' } else { $p.ProcessName.ToLower() } }`;
            const r = spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true });
            return r.status === 0 ? (r.stdout || '').trim().toLowerCase() : '';
        };
        assert.equal(ownerOf(80), 'httpd', 'port 80 must be owned by XAMPP httpd.exe (start servers with `bridge xampp start all`)');
        assert.equal(ownerOf(443), 'httpd', 'port 443 must be owned by XAMPP httpd.exe (start servers with `bridge xampp start all`)');
        assert.equal(ownerOf(3306), 'mysqld', 'port 3306 must be owned by XAMPP mysqld.exe (start servers with `bridge xampp start all`)');
    });
});

