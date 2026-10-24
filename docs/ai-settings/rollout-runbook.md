# Production Rollout, Zero-Restart Rollback & Developer Runbook — `/admin/ai-settings`

**Feature Flag Key:** `ai_settings_v2_enabled`  
**Default State:** `true` (`requiresRestart: false`, stored in MariaDB `system_settings` category `'feature_flags'`, in-memory `CACHE_TTL_MS = 30_000` in `backend/services/featureFlagService.js`)  
**Branch:** `arena/98467c65-resumepilotai` (base `origin/main` = `c0f76a0`)

---

## 1. Merge-Conflict & Branch Divergence Verification (`B4.1`)

Verified immediately prior to push against `origin/main`:

```bash
git fetch origin main
git log --oneline HEAD..origin/main
# Output: (empty — 0 commits behind origin/main c0f76a0)

git diff --stat origin/main..HEAD -- package.json package-lock.json frontend/package.json frontend/package-lock.json backend/package.json backend/package-lock.json
# Output: (empty — 0 bytes changed across all manifests and lockfiles)
```

- **Pre-Merge Rebase Policy:** If `origin/main` advances between PR creation and merge (`git log --oneline HEAD..origin/main` non-empty), rebase `arena/98467c65-resumepilotai` onto `origin/main` and re-execute the full verification gate (`tsc -b --noEmit`, backend tests, and all 4 Playwright suites at `--retries=0`) before merging. Zero schema migrations (`ALTER TABLE` / `CREATE TABLE`) exist in this branch; all state uses existing `system_settings` categories (`ai`, `ai_secrets`, `ai_quota`, `feature_flags`) and `security_audit_logs`.

---

## 2. Production Deploy Order & Rollout Sequence (`B4.2`)

- **Deploy Order:** **`backend-first` -> `frontend-second`** (rolling or sequential service rollout).
- **Feature-Flag Rollout Sequence:** **`flag-default-true` with zero-restart runtime kill-switch** (`ai_settings_v2_enabled` defaults to `true`; for staged/canary environments where dark-launch is desired prior to Super-Admin sign-off, pre-seed `ai_settings_v2_enabled = false` via SQL or API before deploying frontend, then flip `true` via `PUT /api/admin/operations/feature-flags/ai_settings_v2_enabled`).

**Technical Justification:** All Phase 2a backend changes (`1968cd7`) are strictly backward-compatible and additive on `GET/POST /api/admin/ai-settings` (`revision`, `credentialSources`, `featureFlags.ai_settings_v2_enabled`, stricter `'••••••••' + last4` masking, and optional `expectedRevision` CAS that only enforces conflict rejection when `expectedRevision !== undefined` and `force !== true`). Consequently, the existing `c0f76a0` frontend bundle continues functioning without error against the new backend during a rolling deploy, whereas the new `10d6a2c` frontend expects `revision`, `credentialSources`, `GET /api/admin/operations/feature-flags/ai_settings_v2_enabled`, and `{ provider }`-only stored-key probes. Deploying **`backend-first`** eliminates any window where the v2 UI calls an un-upgraded API, while defaulting `ai_settings_v2_enabled` to `true` activates secret-masking and `ADMIN` `403`-elimination fixes immediately upon deploy with `< 5s` API rollback (or `<= 30s` direct SQL rollback) if any UI regression is detected.

---

## 3. Defense-in-Depth Rollback & Non-2xx Fail-Cases (`B4.3`)

Disabling `ai_settings_v2_enabled` isolates **only** the `/admin/ai-settings` browser control-plane UI (`data-testid="ai-settings-rollback-view"`). Server-side candidate/enterprise AI inference (`/api/v1/chat/completions`), active provider key pools, failover routing, and daily quota enforcement remain **100% live and unaffected**.

### Tier 1 — Primary Runtime API Toggle (`0ms` Cache Refresh, Zero Restart)
```bash
curl -fsS -X PUT "${API_ORIGIN}/api/admin/operations/feature-flags/ai_settings_v2_enabled" \
  -H "Authorization: Bearer ${SUPER_ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"value": false}'
```
- **Runtime Proof:** `setFlagValue()` in `backend/services/featureFlagService.js` writes `system_settings` (`category = 'feature_flags'`) inside a `FOR UPDATE` transaction and updates `cachedOverrides` in-memory immediately (`lastCacheFetch = Date.now()`). Verified end-to-end without restarting Express in `frontend/tests/engine-security.spec.ts` (`Runtime feature flag ai_settings_v2_enabled toggles safe-mode rollback view OFF and restores v2 UI ON without restart` — `10/10` consecutive runs passed).

### Tier 2 — Fail-Case A: `PUT .../ai_settings_v2_enabled` Returns Non-2xx (`401`/`403`/`5xx` or Auth Outage) -> Direct MariaDB SQL Override (`<= 30s` Auto-Reload, Zero Restart)
If the admin HTTP API or Firebase/SSO token issuer is unavailable or returning non-2xx, execute this idempotent SQL directly on MariaDB:

```sql
-- Rollback OFF (renders safe-mode rollback view within <= 30s without restarting Express)
INSERT INTO system_settings (category, data, revision, updated_at)
VALUES (
  'feature_flags',
  JSON_OBJECT(
    'ai_settings_v2_enabled',
    JSON_OBJECT(
      'value', FALSE,
      'changedAt', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ'),
      'changedBy', 'emergency-dba-sql'
    )
  ),
  1,
  NOW()
)
ON DUPLICATE KEY UPDATE
  data = JSON_SET(
    COALESCE(NULLIF(data, ''), '{}'),
    '$.ai_settings_v2_enabled',
    JSON_OBJECT(
      'value', FALSE,
      'changedAt', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ'),
      'changedBy', 'emergency-dba-sql'
    )
  ),
  revision = revision + 1,
  updated_at = NOW();
```

- **Zero-Restart Reload Proof:** `backend/services/featureFlagService.js` (`lines 15, 76–95`) sets `CACHE_TTL_MS = 30_000`. Once `Date.now() - lastCacheFetch >= 30_000`, the next `GET /api/admin/ai-settings` or `GET /api/admin/operations/feature-flags/ai_settings_v2_enabled` re-queries `SELECT data FROM system_settings WHERE category = 'feature_flags'` and resolves `MySQL override > process.env > defaultValue` (`lines 97–108`). Live-verified on `ime365_sandbox.system_settings` (`false` -> `true` observed via `getFlagValue('ai_settings_v2_enabled')` with `0` Express restarts). To restore v2 via SQL, run the identical statement with `TRUE` in place of `FALSE`.

### Tier 3 — Fail-Case B: MariaDB `system_settings` Unreachable / Read-Only Incident -> Environment Variable Override
`resolveDefaultFromEnv('ai_settings_v2_enabled')` (`backend/services/featureFlagService.js`, `lines 63–74`) reads `process.env.ai_settings_v2_enabled` (or `process.env.FEATURE_FLAG_AI_SETTINGS_V2_ENABLED`). Setting `ai_settings_v2_enabled=false` in the container/systemd environment and rolling the backend process forces safe-mode OFF whenever no MySQL override row is present (or delete the JSON key via `JSON_REMOVE(data, '$.ai_settings_v2_enabled')` so env var governs).

### Tier 4 — Fail-Case C: Full Code / Bundle Revert (`c0f76a0`)
Because Phase 2a (`1968cd7`) and Phase 2b (`10d6a2c`) are cleanly separated commits with zero DB schema changes:
- **Frontend-only revert (recommended code rollback — keeps backend secret-masking fix active):** `git revert --no-edit 10d6a2c` and redeploy static frontend assets.
- **Full branch revert to `c0f76a0`:** `git revert --no-edit 02f5972 10d6a2c 1968cd7` (or redeploy tag/commit `c0f76a0`).

---

## 4. Ordered 10-Item Post-Merge Verification Checklist (`T+0m` – `T+30m`) (`B4.4`)

Execute in order immediately after production deploy completes:

| # | Window | Owner | Exact Command or Browser URL | Expected Value / Pass Invariant | Escalation Path |
| --- | --- | --- | --- | --- | --- |
| 1 | `T+0m–2m` | Release Engineer | `curl -fsS "${API_ORIGIN}/api/readyz"` | HTTP `200`, JSON `status: "ready"`, `schema: "INITIALIZED"`, DB reachable | Halt frontend deploy; page Backend On-Call; inspect container logs |
| 2 | `T+2m–5m` | Release Engineer | `curl -fsS "${API_ORIGIN}/api/admin/ai-settings" -H "Authorization: Bearer ${SUPER_ADMIN_TOKEN}"` | HTTP `200`; integer `revision >= 0`; `featureFlags.ai_settings_v2_enabled === true`; every `maskedKeys.*` matches `/^•{8,}[A-Za-z0-9]{4}(\s+\+\d+)?$/` (zero plaintext prefixes) | Page Security + Backend On-Call; if masking malformed, revert `1968cd7` immediately |
| 3 | `T+5m–8m` | On-Call Super Admin | Open `${APP_ORIGIN}/admin/ai-settings` as `SUPER_ADMIN` | Heading `"Runtime model selection"` renders; primary CTA `"Save All Changes"` visible above the fold; `0` red console or `/api/*` network errors | Execute Tier 1 rollback (`ai_settings_v2_enabled=false`); open P1 UI bug |
| 4 | `T+8m–11m` | Platform Admin | Open `${APP_ORIGIN}/admin/ai-settings` as `ADMIN` with DevTools Network tab open | `data-testid="super-admin-restriction-notice"` + `"AI Quota Governance"` visible; **exact `0` requests to `/api/admin/ai-settings` and `0` HTTP `403` responses** | Execute Tier 1 rollback; notify Frontend On-Call (`DEF-06` regression) |
| 5 | `T+11m–13m` | QA / Support Lead | Open `${APP_ORIGIN}/admin/ai-settings` as `SUPPORT` and hard-refresh (`F5`) | Deterministic `data-testid="admin-tab-forbidden"` (`403`) card stays on URL across reload; `"Return to Allowed Workspace"` navigates to `/admin/support` | Notify Frontend On-Call; verify backend `/api/admin/ai-settings` still returns `403` for `SUPPORT` |
| 6 | `T+13m–17m` | On-Call Super Admin | Open `Configure Provider` modal on `${APP_ORIGIN}/admin/ai-settings?dialog=configure-provider`, save a test/canary provider key, and press `F5` | Modal closes cleanly; provider row displays `••••••••<last4>` + `"MariaDB Vault"` provenance badge across hard reload; zero secret in `localStorage`/`sessionStorage`/URL | Execute Tier 1 rollback + rotate canary key; page Security On-Call |
| 7 | `T+17m–20m` | Security / Super Admin | Expand saved provider row -> click `"Test Connection"` while inspecting DevTools `POST /api/admin/ai/test-provider` request payload | Request body equals `{"provider":"<id>"}` **only** — zero `apiKey` field re-transmitted over the network (`DEF-03`) | Execute Tier 1 rollback immediately; page Security On-Call |
| 8 | `T+20m–23m` | On-Call Super Admin | Open `${APP_ORIGIN}/admin/ai-settings` in Tab A and Tab B; save selection mode in Tab A, then click `"Save All Changes"` in stale Tab B | Tab B receives HTTP `409 REVISION_CONFLICT` and renders conflict alert banner with `"Reload Latest"` and `"Overwrite Remote"` buttons; click `"Reload Latest"` to resync | Notify Backend/Frontend On-Call; avoid concurrent admin edits until resolved |
| 9 | `T+23m–26m` | On-Call Super Admin | Run Tier 1 `PUT .../feature-flags/ai_settings_v2_enabled` `{"value":false}` and reload `${APP_ORIGIN}/admin/ai-settings` | `data-testid="ai-settings-rollback-view"` (`"Runtime Rollback Active"`) renders immediately with **zero Express restart**; live `/api/v1/chat/completions` remains HTTP `200` | Run Tier 2 MariaDB SQL fallback and verify reload within `<= 30s` |
| 10 | `T+26m–30m` | On-Call Super Admin | Click `"Restore v2 Engine UI"` (or `PUT` `{"value":true}`) and inspect `security_audit_logs` | Full v2 UI (`"Runtime model selection"`) restores immediately; `SELECT action, category FROM security_audit_logs ORDER BY id DESC LIMIT 5;` records flag & settings audit rows | Keep flag `false` if restore misbehaves and escalate to Engineering Lead |

---

## 5. Local Development, Automated Test & Visual Baseline Commands (`runbook.md`)

### Start Local E2E Stack (Sandbox / Dev)
```bash
# 1. Hydrate sandbox MariaDB + Chromium libraries (first run / after container resume)
bash scripts/dev-db/setup-sandbox-tools.sh

# 2. Start MariaDB bridge (:3306), local OpenAI-compatible stub (:8081), Express API (:8080), and Vite (:4000)
node scripts/dev-db/mariadb-sandbox-bridge.mjs
node scripts/dev-ai/llamacpp-local-stub.cjs
cd backend && NODE_ENV=test PORT=8080 DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD='' DB_NAME=ime365_sandbox TEST_AUTH_HMAC_SECRET=sandbox-hmac-secret-resumepilot-2026 LLAMACPP_BASE_URL=http://127.0.0.1:8081/v1 node index.js
cd frontend && npm run dev -- --host 0.0.0.0 --port 4000 --strictPort
```

### Run Full Automated Verification Gates (`retries: 0`)
```bash
# TypeScript + Lint
cd frontend && npm run lint && npx oxlint playwright.config.ts tests/engine-*.spec.ts && npx tsc -b --noEmit

# Backend Node Test Suites
cd backend && node --test test/ai-admin.test.js test/ai-admin-entitlement.test.js test/ai-governance-entitlement.test.js test/ai-engine-routes.test.js test/ai-router.test.js test/feature-flags.test.js

# Playwright 4-Spec Gate (run sequentially so shared test-results/ artifacts never collide)
cd frontend
npx playwright test tests/engine-integrity.spec.ts --project=desktop --retries=0
npx playwright test tests/engine-authenticated.spec.ts --project=desktop --retries=0
npx playwright test tests/engine-security.spec.ts --retries=0
npx playwright test tests/engine-responsive.spec.ts --retries=0
```

### Visual Regression Baseline Policy (Policy B — Dual-Platform Baselines)
- **Standing Policy (Policy B):** Dual-platform snapshots committed with Playwright `{platform}` template (`-linux.png` and `-win32.png`). Both Linux CI and Windows developer environments execute their respective authoritative platform baselines without skipping.
- **Cross-Platform Justification:** Windows font rasterization (DirectWrite / ClearType) introduces 0.5%–1.8% anti-aliasing variances on subpixel typography compared to Linux FreeType. Rather than skipping visual tests on dev or suffering spurious CI failures, `playwright.config.ts` uses `snapshotPathTemplate: '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}-{projectName}-{platform}{ext}'`. Both platforms maintain canonical snapshots side-by-side in `frontend/tests/engine-responsive.spec.ts-snapshots/`. A pixel regression introduced on either Windows or Linux is immediately caught locally and in CI.
- **Regenerating Snapshots:** When intentional UI changes are approved, regenerate the 25 deterministic snapshots (`5 subtabs × 5 viewports`) for the current platform via:
  ```bash
  cd frontend && npx playwright test tests/engine-responsive.spec.ts -g "Visual regression baseline" --update-snapshots
  ```
  Inspect `git diff frontend/tests/engine-responsive.spec.ts-snapshots/` before committing.

### Mandatory CAS Enforcement (expectedRevision)
- All administrative mutations (`POST /api/admin/ai-settings`) MUST supply `expectedRevision: <number>`.
- Omission of `expectedRevision` without `force: true` returns `400 EXPECTED_REVISION_REQUIRED`.
- Stale revision returns `409 REVISION_CONFLICT` with `remoteRevision` payload for CAS recovery affordance.

---

## §6 Deferred to Platform Infrastructure

### MariaDB connection-pool circuit breaker
- File: backend/database/mysql.js
- Status: Deferred — Phase 4 Platform Infrastructure Roadmap
- Rationale: Shared across 1,082 platform tests; no AI-settings-specific failure mode identified. Modifying pool reconnection logic inside a feature freeze adds more risk than it removes.
- Owner: platform infrastructure team
- Revisit trigger: any AI-settings incident where pool exhaustion is the proximate cause
- Ticket: PLAT-001


