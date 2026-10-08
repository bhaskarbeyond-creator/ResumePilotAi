# DIR-051 EVIDENCE SUMMARY — Strict XAMPP Server Initiation & Prohibition of Background Server Spawns

- **Directive:** DIR-051 (P0) — Strict XAMPP Server Initiation
- **Project:** IME365 (`D:\xampp\htdocs\IME365`)
- **Developer:** STAFF_DEVELOPER (Cline)
- **Captured:** 2026-10-08 (local +05:30)
- **Workspace verified before modification:** `D:\xampp\htdocs\IME365` ✓

---

## 1. Acceptance Criteria — Verification Matrix

| AC | Requirement | Evidence | Verdict |
|----|-------------|----------|---------|
| AC-1 | All servers run strictly under XAMPP (Apache 80/443, MySQL 3306) | Live ownership: `80: httpd`, `443: httpd`, `3306: mysqld`; `bridge xampp status` all green; `http://ime365.local/ → 200`, `https://ime365.local/ → 200` | ✅ PASS |
| AC-2 | Zero unmanaged background server processes | Repo-wide static scan: **zero** forbidden spawn vectors; rogue ports 8080/5173/3000/5000/8000 all FREE; only managed processes listening (48200 = AI-Bridge daemon, 1234 = LM Studio — DIR-052 scope, census transparency) | ✅ PASS |
| AC-3 | Bridge CLI first-class `bridge xampp status/start/stop` | Verified live: `bridge xampp status` returns strict-policy JSON. Generator (`C:\Users\mbhas\.ai-bridge\bridge.cjs`) implements `xamppControl()` (L2866), CLI dispatch `bridge xampp|server` (L3533), MCP tool `bridge_xampp` (L3285) | ✅ PASS |
| AC-4 | Developer prompt + AGENTS.md §56 enforce zero background server policy | `bridge.cjs` dev-prompt rule 14 (L517–522); `.clinerules` MANDATORY WORKFLOW INVARIANT #9; `.agents/AGENTS.md` §56 (L2345–2370); `.bridge/learnings.jsonl` invariant `lrn_muz56985_ef650a7adefd` | ✅ PASS |

---

## 2. Deliverables

| # | Artifact | Change |
|---|----------|--------|
| D1 | `scripts/START_RESUMEPILOT_SERVICES.bat` | Removed detached `start /min "ResumePilot Backend" cmd /c "... node index.js"` (broken — no root index.js) and detached `start /min "AI Bridge Watcher" node lead_watcher_daemon.cjs`; now routes life-cycle via `bridge xampp start all`. Scheduled-task watchdog toggles preserved (DIR-052 scope) |
| D2 | `scripts/STOP_RESUMEPILOT_SERVICES.bat` | Added step `[3/4] bridge xampp stop all` for Apache/MySQL shutdown; managed AI-bridge daemon termination retained |
| D3 | `tests/xampp-policy-guard.test.mjs` (new) | Guard with 5 spawn vectors: V1 cmd `start` detached runtime, V2 `Start-Process` node/vite, V3 JS `detached:true`, V4 JS `cmd /c start`, V5 `wscript/cscript *.vbs` launcher. Includes efficacy canary against the historical offenders + positive pins on START/STOP scripts + live win32-gated ownership assertions |
| D4 | `package.json` | Added standalone `"test:xampp-policy": "node --test tests/xampp-policy-guard.test.mjs"` — intentionally NOT folded into frozen `test:security:static` baseline |
| D5 | `.clinerules` | New MANDATORY WORKFLOW INVARIANT #9 (STRICT XAMPP SERVER INITIATION — ZERO BACKGROUND SERVER SPAWNS, P0) |
| D6 | `.agents/AGENTS.md` | Section 56: MANDATORY XAMPP SERVER INITIATION & ZERO-BACKGROUND-SERVER INVARIANT (core mandate, authorized runtimes, prohibited actions, bridge command standards) |
| D7 | Bridge tooling (`C:\Users\mbhas\.ai-bridge\bridge.cjs`) | `bridge xampp status/start/stop`, `bridge server` alias, MCP `bridge_xampp`, dev-prompt rule 14 |

---

## 3. Verification Battery (all logs in `.bridge/evidence/`)

| Check | Command | Result | Log |
|-------|---------|--------|-----|
| XAMPP policy guard | `node --test tests/xampp-policy-guard.test.mjs` | **4/4 pass, 0 fail** (incl. live httpd/mysqld ownership) | `dir051-policy-guard.log`, `dir051-policy-guard-run.log` |
| Lint | `npm run lint` | **0 errors**, 253 pre-existing warnings, exit 0 | `dir051-lint.log` |
| Frozen security baseline | `npm run test:security:static` | **67/67 pass, 0 fail** — baseline untouched | `dir051-security-static.log` |
| Production build | `npm run build` | **exit 0**, vite `built in 6.07s` (DIR-051 touches no bundle inputs) | `dir051-build.log` |
| Live XAMPP status | `bridge xampp status` | Apache running (80/443), MySQL running (3306), `STRICT_XAMPP_ENFORCED` | `dir051-xampp-status.json` |
| Port ownership + census | `Get-NetTCPConnection` sweep | 80/443 → httpd, 3306 → mysqld; 8080/5173/3000/5000/8000 FREE | `dir051-census.txt` |
| HTTP probes | `curl` | `http://ime365.local/ → 200`, `https://ime365.local/ → 200`, `http://localhost/ → 302` (XAMPP dashboard) | `dir051-census.txt` |
| Diff review | `git diff --stat` | Only intended files: `.clinerules`, `.agents/AGENTS.md`, `package.json`, 2 service scripts, bridge state files | session log |

### Explicit non-claims (zero fabrication)
- Port `48200` (auto_ai_router.cjs) and `1234` (LM Studio) are AI-bridge managed services outside this directive; they appear in the census only for transparency and are the scope of DIR-052.
- Build wall time measured at 6.07s (vite) / 7.86s (npm-inclusive). DIR-051 introduces no build-input changes; this is a pre-existing characteristic and is reported as-is.

---

## 4. Remediation Proof — Historical Offender

Before (committed HEAD):
```
start /min "ResumePilot Backend" cmd /c "cd /d D:\xampp\htdocs\IME365 && node index.js"
start /min "AI Bridge Watcher" cmd /c "node \"C:\Users\mbhas\.ai-bridge\lead_watcher_daemon.cjs\" --loop"
```
After (working tree): both lines removed; lifecycle exclusively `bridge xampp start all` / `bridge xampp stop all`. The guard canary test proves the scan still detects these exact historical strings.

---

## 5. Submission Statement

All 4 acceptance criteria verified with live evidence on the running XAMPP host. The frozen security baseline (67/67) and build remain intact; repo contains zero forbidden detached/background spawn vectors. Submitted for Gatekeeper certification (`APPROVED_FROZEN`).
