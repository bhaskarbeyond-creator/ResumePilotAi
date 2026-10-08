# DIR-053 — EVIDENCE SUMMARY (Self-Healing Backend API Server, XAMPP Orchestration)

**Directive:** DIR-053 (P0) · **Mode:** ACT · **Host:** D:\xampp\htdocs\IME365 (win32, XAMPP D:\xampp)
**Executed:** 2026-10-08 (local 12:47–13:05 / UTC 07:17–07:35)

## 1. Scope delivered (approved S1–S5 plan)

| Step | Deliverable | Status | Proof |
|---|---|---|---|
| S1 | 3-tier `bridge xampp` lifecycle (Apache 80/443 + MySQL 3306 + managed Backend API :8080, `backend_api.pid`, `/readyz` verify, graceful drain) | ✅ verified live | `bridge xampp status` → `backendApi {running:true, healthy:true, ready:true}`; `start all` output adopted PID; BATs pin `bridge xampp start/stop all` |
| S2 | `lead_watcher_daemon.cjs` :8080 self-healing (1 s cadence, 3-fail confirm, zombie tree-kill, port-release poll, respawn, backoff 5 s→60 s, spawn lock) | ✅ verified live | daemon PID 28408 (started 12:53:48 **after** the S2 file mtime 12:52:51); heal telemetry below |
| S3 | VirtualHost alignment: localhost + ime365.local (80 & 443) → docroot `IME365/dist`, native `ProxyPass /api http://127.0.0.1:8080/api` | ✅ verified live | `httpd -t` Syntax OK; both hosts answer 200 through proxy (T2 + browser crawl) |
| S4 | Honest frontend connectivity state: `getResumes` additive `apiError`/`errorStatus`; hero banner "✦ Connecting to API Server..." + 4 s auto-retry; real Job Applications count; never a fake 0 | ✅ shipped to dist | src mtimes 12:53:26/27 → rebuilt 12:58:42; marker `Connecting to API Server` present in `dist/assets/CubaCandidateShell-CwO9Hzat.js` |
| S5 | E2E resilience & data-population battery + policy guard | ✅ 6/6 + 4/4 | see §2 |

## 2. Verification evidence (fresh runs)

### 2.1 S5 battery — `tests/test_api_server_e2e_resilience.cjs` (new, 260 lines)
Command: `node tests/test_api_server_e2e_resilience.cjs` · Log: `.bridge/evidence/dir053-api-resilience.log`
**RESULT: 6/6 pass, 0 fail (7.9 s)**

| Test | Assertion | Result |
|---|---|---|
| prereq | daemon PID file alive + backend `/healthz` 200 before drill | ✅ |
| T1 | `:8080` `/healthz` 200; `/api/service-availability` 200 `success:true` `ai.available:true` | ✅ |
| T2 | Apache proxy 200 on `http://localhost/api/service-availability` **and** `https://ime365.local/api/service-availability` | ✅ |
| T3 | anon `/api/resumes` → **401**; rptest-authenticated uid `OhZdiSIFL7ePA1TMkfu9bnR935D3` → 200 with **exactly 15 resumes** | ✅ |
| T4 | taskkill `/F` on :8080 owner (PID 19084, verified `node`) → daemon auto-heals → **CRASH_RECOVERY_MS=3972** (< 6000 budget), healed PID **38164** ≠ killed PID | ✅ |
| T5 | post-heal: `/readyz` 200 `"ready"`; `backend_api.pid` (38164) == live listener; **Apache proxy → API → MariaDB returns the 15 resumes again** | ✅ |

Daemon-side telemetry (`.bridge/evidence/dir053-daemon-heal.log`):
```
[07:30:10.641Z] Backend API (PID 19084) frozen or unresponsive to HTTP /healthz after 3 consecutive failed probes. Force-recovering...
[07:30:10.937Z] Spawned backend/index.js (PID 38164) on :8080
[07:30:13.291Z] [Telemetry] BACKEND_CRASH_RECOVERY_MS=2649 event=frozen-unresponsive newPid=38164 healthy=true nextBackoff=5000ms
```

### 2.2 XAMPP policy guard — `npm run test:xampp-policy`
Log: `.bridge/evidence/dir053-xampp-policy.log` · **RESULT: 4/4 pass** — zero forbidden spawn vectors repo-wide (incl. the new battery), START/STOP BATs pinned to `bridge xampp`, live ownership: :80/:443 = httpd.exe, :3306 = mysqld.exe.

### 2.3 Auth/data pre-flight (`.bridge/tmp/dir053-auth-probe.cjs`)
`testVerifierEnabled: true`; anon 401; authed **15 resumes** direct AND through the Apache proxy.

### 2.4 Build — `npm run build`
Log: `.bridge/evidence/dir053-build.log` — vite **built in 2.89 s** (< 4.0 s budget). dist rebuilt 12:58:42 after the S4 src edits.

### 2.5 Real-browser DOM crawl (Playwright) — `.bridge/evidence/dir053-browser-crawl.log`
| Host | HTTP | App root | Console errors | In-page `/api/service-availability` |
|---|---|---|---|---|
| http://localhost | 200 | rendered | **0** | 200 · success:true · **aiAvailable:true** · degraded:false |
| https://ime365.local | 200 | rendered | 1 (external `POST https://m.stripe.com/6` ERR_CONNECTION_RESET — third-party telemetry on the public page, blocked by the network; unrelated to the stack) | 200 · success:true · **aiAvailable:true** |

`ai.available:true` is the honest data source of the header "✦ AI Engine Ready" beacon (`src/components/cuba/aiStatus.js` contract).

## 3. Acceptance criteria

- **AC-1** ✅ :8080 managed via `bridge xampp` (adopt-or-spawn + pidfile + `/readyz`), protected by the daemon (T5 pidfile==listener).
- **AC-2** ✅ both hosts return 200 on `/api/service-availability` with `success:true` (T2; browser crawl).
- **AC-3** ✅ candidate data path verified live: 15 real resumes via authenticated API direct + proxy (T3/T5); dashboard bundle carries the honest reconnect banner; AI flag true.
- **AC-4** ✅ kill → auto-recover in **3972 ms** (< 6000 ms, T4; daemon telemetry 2649 ms).
- **AC-5** ✅ zero fake 0-data: `apiError` marker + Cuba reconnect badge + 4 s retry loop shipped in dist; anon access 401 — outages can no longer masquerade as an empty account.

## 4. Artifacts
- `.bridge/evidence/dir053-api-resilience.log` (S5 battery, 6/6)
- `.bridge/evidence/dir053-xampp-policy.log` (policy guard, 4/4)
- `.bridge/evidence/dir053-daemon-heal.log` (daemon heal telemetry)
- `.bridge/evidence/dir053-build.log` (vite 2.89 s)
- `.bridge/evidence/dir053-browser-crawl.log` (Playwright DOM crawl)
- `tests/test_api_server_e2e_resilience.cjs` + `npm run test:api-resilience`

## 5. Notes / limitations
- T4 is destructive by design and must not be re-run within 15 s (daemon spawn-grace window defers respawns on purpose).
- The battery is win32-gated (XAMPP host only), consistent with `xampp-policy-guard`.
- External Stripe telemetry reset on ime365.local is third-party network noise, not a stack defect.
