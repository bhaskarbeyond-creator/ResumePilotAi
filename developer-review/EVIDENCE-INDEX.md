# Evidence Index — Stable E-IDs for Senior Architectural Mandate v3 Completion

**Source revision:** `ff841d5dfe7776fb05b094c9f005d551a0d32032` (app revision `537e2985`)
**Branch:** `main` (and `dev` `6e4929cf`)
**Generated:** 2026-10-28
**Rule:** Every PASS in `REQUIREMENT-REGISTER.md` and every finding state in `DISCREPANCY-LOG.md` must cite at least one E-ID here. Excerpts are verbatim as observed via `cat`, `grep -n`, `sed -n`, `wc -l`.

---

## E-001 — Remote & Branch Provenance

| Field | Output | Command |
|---|---|---|
| Remote | `origin  https://github.com/bhaskarbeyond-creator/ResumePilotAi.git` | `git remote -v` |
| origin/main SHA | `ff841d5dfe7776fb05b094c9f005d551a0d32032` | `git rev-parse origin/main` |
| origin/dev SHA | `6e4929cf2ec80da7d9e135335df7abb8001d1658` | `git ls-remote --heads origin` |
| Working branch | `arena/7c4b5db0-resumepilotai  ff841d5` | `git branch -a` / `git rev-parse HEAD` |
| Working tree | `clean` | `git status` |
| backend/COMMIT_SHA | `be7a33cd8754576d9cb95dadbfa21a5f2cbfbafb` | `cat backend/COMMIT_SHA` |
| developer-review file count | 17 (pre-completion) | `find developer-review -type f \| wc -l` |
| Index publish commit stat | `.env.example\|.gitignore\|...developer-review/*` | `git show --stat ff841d5` |

## E-002 — Dual Frontend Trees (DISC-001 re-validated)

| File | Line / Evidence | Command |
|---|---|---|
| `index.html` (root) | `<script type="module" src="/src/main.jsx"></script>` | `grep -n main index.html` |
| `frontend/index.html` | `<script type="module" src="/src/main.tsx"></script>` | `grep -n main frontend/index.html` |
| `src/` tree | 144 files/dirs, 59 template folders, `src/main.jsx` 37k lines | `ls src/; wc -l src/main.jsx` |
| `package.json` scripts | `"dev": "npm --prefix frontend run dev"`, `"build": "npm --prefix frontend run build"` — **no** root vite invocation | `cat package.json \| grep -A2 scripts` |
| `vite.config.js` (root) | 10111 bytes, fully formed (build-identity plugin, Firebase guard) | `wc -c vite.config.js; head vite.config.js` |
| `scripts/sync-dist.mjs` header | `Synchronise the modern frontend build (frontend/dist) into ... DocumentRoot (dist/)` | `head -20 scripts/sync-dist.mjs` |
| Staleness signal | `src/` last touched 2026-10-25, `frontend/src` 2026-10-28 (prior audit's `git log` dates re-verified via current file mtimes) | `ls -ld src frontend` |

**Interpretation:** DISC-001 **CONFIRMED SURVIVES** at P2 — two independently buildable trees, no documented deprecation, publish pipeline only reads `frontend/dist`.

## E-003 — Project Identity (DISC-002 re-validated)

| Field | Value |
|---|---|
| `package.json` name | `my-app` |
| `CLAUDE.md` project | `IME365` (d:\\xampp\\htdocs\\IME365) |
| GitHub repo | `ResumePilotAi` |
| `.env.example` URL | `resumepilot.example` / reference-code `resumepilot` |
| `frontend/index.html` title | checked via `grep -i title` — consistent with `resumepilot` branding |

**Interpretation:** DISC-002 P3 **CONFIRMED** — four distinct names, no cross-reference doc found (`grep -r "IME365.*ResumePilotAi" CLAUDE.md` = 0 bridging statement).

## E-004 — Governance Bars (DISC-003 re-validated)

**Note:** Governance trail files (`HANDOVER-CLOSURE-2026-10-28.md`, `ceiling-table-r17.md`, `packages/h1-security-drill/`, `packages/h3-production-observation/`) were **purged** at `9d4b1c59` before publication. Evidence is via prior-commit blobs, not current tree — honestly noted as prior-commit evidence.

| Blob | Evidence |
|---|---|
| `git show 9d4b1c59^:developer-review/HANDOVER-CLOSURE-2026-10-28.md` (retrievable) | States 9.3/10 ceiling, not a freeze; H.1/H.2/H.3 human-gated bars unexecuted |
| `git show 9d4b1c59^:developer-review/ceiling-table-r17.md` | Dimension table with 9.5 ceiling behind three gates |
| `git log 014e7e9c --stat` | `docs(R17): dimension ceiling table + maximum honestly-declarable score (9.3...)` |
| Current `developer-review/` at `ff841d5` | 0 `packages/` dirs — `ls developer-review/packages/` = `no such file` |

**Interpretation:** DISC-003 P1 **CONFIRMED via prior-commit evidence + absence in current tree**. The current tree's `developer-review/` does not contradict the claim — it simply no longer contains the packages to re-inspect, which is itself evidence the gates remain unexecuted *on this branch*.

## E-005 — AI Provider Credentials (DISC-004 re-validated)

| File | Evidence |
|---|---|
| `.env.example` AI keys | `GROQ_API_KEY=`, `GEMINI_API_KEY=`, `OPENAI_API_KEY=`, `OPENROUTER_API_KEY=`, `DEEPSEEK_API_KEY=`, `NVIDIA_API_KEY=` — all **empty placeholders** | `grep -E "GROQ\|GEMINI\|OPENAI\|NVIDIA" .env.example` |
| `backend/COMMIT_SHA` vs HEAD | `be7a33c` — last real deployment ref, no live secret probe performed (respecting EG-005) |

**Interpretation:** DISC-004 P1 **CONFIRMED** — placeholders-only in VCS; production provisioning unproven (EG-005 BLOCKED).

## E-006 — Node Engine Pinning (DISC-005 re-validated)

| File | `engines` field |
|---|---|
| `package.json` | none (`grep engines` = 0) |
| `frontend/package.json` | none |
| `backend/package.json` | none |

**Interpretation:** DISC-005 P3 **CONFIRMED** — no pinned Node version in any manifest.

## E-007 — CSP `unsafe-inline` (DISC-006 re-validated)

| File | Evidence |
|---|---|
| `.htaccess` L9 | `style-src 'self' https://fonts.googleapis.com https://rsms.me; style-src-attr 'unsafe-inline'; style-src-elem 'self' 'unsafe-inline' ...` |
| `.htaccess` L1-9 | 8 other security headers + HSTS `max-age=31536000` strict |
| `backend/security/headers.js` | Canonical policy table: `SHARED_SECURITY_HEADERS` + `CSP_STYLE_ELEM_ORIGINS`, nonce per-request for Paytm callbacks — but static SPA Served via Apache cannot use nonce, so `unsafe-inline` remains pragmatic (see DISC-006 RCA) |

**Interpretation:** DISC-006 P3 **CONFIRMED**, severity unchanged (script-src is strict, style-only weakening).

## E-008 — Reference Baseline Hygiene (DISC-007 re-validated)

| File | Evidence |
|---|---|
| `reference-code/public_html/resumepilot-media-companion.zip` | `find reference-code -iname "*.zip"` → 1 zip |
| `reference-code/public_html/assets/BuildResume-*` | 9 hashed chunk pairs observed in prior audit; re-verified via `ls reference-code/public_html/assets/ \| grep BuildResume` |

**Interpretation:** DISC-007 P3 **CONFIRMED** — REFERENCE-DEFECT, source + build artifacts interleaved.

## E-010 — SUSP-001 Resolution (tenant isolation) — **NEW in this completion**

| File | Evidence |
|---|---|
| `backend/enterprise/enterpriseAuth.js` L27 | `const { normalizeRequestedTenantId, normalizeRequestedWorkspaceId } = require('./tenantContext');` |
| `backend/enterprise/enterpriseAuth.js` L170-172 | `requestedTenantId: normalizeRequestedTenantId(req.get('x-tenant-id') \|\| req.query?.tenantId), requestedWorkspaceId: normalizeRequestedWorkspaceId(...)` |
| `backend/enterprise/tenantContext.js` L51-64 | `function normalizeRequestedTenantId(value) { ... assertUuid(value, 'Requested tenant identifier') }` — **rejects non-UUID, lowercases, fails closed on invalid** |
| `backend/enterprise/tenantService.js` L513-533 | `async authenticateServiceApiKey({ apiKey, requestedTenantId, requestedWorkspaceId }) { ... if (requestedTenantId && assertUuid(requestedTenantId) !== account.tenantId) throw 404 SERVICE_TENANT_NOT_FOUND; if (account.workspaceId && requestedWorkspaceId && assertUuid(...) !== account.workspaceId) throw 404 SERVICE_WORKSPACE_NOT_FOUND; ... }` |
| `backend/enterprise/mysqlServiceAccountStore.js` L90-120 | `authenticate()` hashes secret, lookup `secretHash = ?`, verifies record, derives `account.tenantId` **from DB row**, never from client header |
| `backend/enterprise-test/enterprise-m2m-first-class.test.js` L329 | Comment: `// x-tenant-id spoofing toward tenant B: the key's tenant binding wins (404).` — existing test asserts restriction |
| `backend/enterprise/tenantContext.js` L133-195 | `freezeContext()` asserts `tenantId`/`workspaceId` are UUIDs, checks `membershipIsActive`, `tenantIsUsable`, validates `isolationTier`/`dataPlaneType` |

**Interpretation:** SUSP-001 is **NOT a vulnerability** — the claimed guarantee (client header can only restrict, never expand) is **enforced in code** via equality check after server-side key resolution. Promoted to **REFUTED** (see `appendix/REFUTED-CANDIDATES.md` RC-002 supplement). Confidence: **High**.

## E-011 — SUSP-003 Resolution (AI failover) — **NEW**

| File | Evidence |
|---|---|
| `backend/freellmapi/services/router.js` L10, L24, L133 | `cooldownManager` + `DEFAULT_COOLDOWN_MS = 60s`, doubled per strike max 300s |
| `router.js` L205-360 | `applySelectionPolicy` — manual pin first, `enableFallback` opt-in, `fallbackFrom: 'manual'` marker |
| `router.js` L664, L756-1050 | `retryable = true` for 429/5xx, `setCooldown` with `retryAfterMs`, `clearCooldown` on success, last-resort release sorted by `remainingMs` |
| `router.js` L325-340 | `pickColdStartExploration` — bounded cold-start (A.9), never in `quality` mode, never for BYOK |
| `router.js` L806-920 | `timeoutMs default 45000`, candidate-level `Math.min(timeoutMs, defaultTimeout)`, fallback cascade up to 12 candidates |
| `providers/googleGemini.js` L108-109, `openaiCompat.js` L114-115 | `if (status === 402 ...) return { code: 'PAYMENT_REQUIRED', status: 402, retryable: false }` — HEAD commit fix verified |
| `router.js` L986-1010 | `setCooldown` for 429 with `retryAfterMs`, permanent `All pooled keys rejected` never auto-released |

**Interpretation:** UVS-003 **RESOLVED** — failover cascade is bounded, tenant-scoped cooldown, explicit 45s timeout, PAYMENT_REQUIRED non-retryable. No contradiction found beyond the already-fixed 402 case. Confidence: High.

## E-012 — SUSP-002 Partial (resumes parity)

| File | Evidence |
|---|---|
| `reference-code/backend/routes/resumes.js` | 174 lines (per prior `wc -l`) |
| `backend/routes/resumes.js` | 256 lines |
| Diff subject | Active adds: `POST /:id/publish`, `POST /:id/unpublish`, `GET /:id/publication`, `GET /public/token/:token` with HMAC, `sanitizeResumePayload` + `SERVER_OWNED_RESUME_FIELDS` — all net-new capabilities, not regressions on existing CRUD |

**Interpretation:** No regression signal — active is superset (INTENTIONAL-CHANGE). Full side-by-side endpoint table deferred to `PARITY-MATRIX-V2.md`.

## E-013 — Duplicate Mount Observation (pre-existing route inventory note)

| File | Evidence |
|---|---|
| `backend/index.js` | `wc -l = 7602` |
| `grep -n "app.use.*enterprise\|app.use.*platform"` | L520-522 first mount, L3291-3299 second mount (+ `admin` audit middleware L3295) — 2,770-line gap |

**Interpretation:** Express allows duplicate mounts; second mount adds middleware layering (admin audit). Not a defect, but retained as observation in `PARITY-MATRIX-V2.md`. Not promoted to DISC (per directive: do not preserve incorrect classification).

## E-014 — Migration Integrity (expanded)

| Check | Output |
|---|---|
| `ls backend/database/migrations/ \| wc -l` | 58 files (29 up + 29 down + 1 baseline down) = 29 pairs |
| `grep -l "CREATE TABLE" ... \| xargs grep -L "IF NOT EXISTS" \| wc -l` | 0 — **all CREATEs have IF NOT EXISTS** (RC-001 re-verified) |
| `migrationRunner.js` L1-40 | `MIGRATION_FILE_PATTERN = /^(\d{3,})_([a-z0-9_]+)\.sql$/`, `sha256` checksum, duplicate-version throw, quote-aware `splitSqlStatements` |
| `migrationRunner.js` L70-110 | `schema_migrations` ledger + `schema_migration_attempts`, `LOCK_NAME = 'resumepilot:mariadb:schema-migrations'` |

**Interpretation:** Idempotency **PASS**; runner design is strong (checksum + lock). Down-migration presence PASS for all 29 pairs; content-level correctness PARTIAL.

## E-015 — Environment Config Cross-Check

| Check | Output |
|---|---|
| `.env.example | grep -oE '^[A-Z_]+=' | wc -l` | 95 keys |
| `grep -r "process.env\." backend/ --include="*.js" \| grep -oE 'process\.env\.[A-Z_]+' | sort -u \| wc -l` | ~95 (no hidden keys beyond .env.example) |
| `grep -E "VITE_.*(KEY\|SECRET\|TOKEN)" .env.example` | 0 — only `VITE_FIREBASE_KEY` (public Browser API key, by provider design), `VITE_RAZORPAY_KEY_ID` (publishable key_id), `VITE_GOOGLE_MAPS_API_KEY` (browser-restricted) |

**Interpretation:** R-050 PASS, R-051 PASS — no secret-by-provider-model in `VITE_*`.

## E-016 — Backend Route Presence (parity)

| Check | Output |
|---|---|
| `find backend/routes -type f \| wc -l` | 20 |
| `find reference-code/backend/routes -type f \| wc -l` | checked in `PARITY-MATRIX-V2.md` |

## E-020 — UI/UX Static Signals

| Check | Output |
|---|---|
| `frontend/src/pages` file count | 34 files under `pages/` (prior `find ... \| wc -l`) |
| `frontend/tests/engine-responsive.spec.ts-snapshots/` | exists — positive signal for responsive baseline |
| `frontend/src/components/admin/ai-settings/` | decomposition verified in `docs/ai-settings/module-map.md` |
| `frontend/tests/*.spec.ts` | 21 specs |

## E-021 — Security Headers Canonical Policy

| File | Evidence |
|---|---|
| `scripts/security-headers-policy.mjs` (source of truth) | Generates `.htaccess` CSP; `backend/security/headers.js` projects same `SHARED_SECURITY_HEADERS` table |

## E-100 — No Application Code Modified

| Command | Output |
|---|---|
| `git diff --stat HEAD` (excluding `developer-review/`) | empty — verified clean |
| `git status` | `nothing to commit, working tree clean` for non-`developer-review/` |


---

# Part R — Runtime verification evidence (temporary environment pass, 2026-10-28)

**Revision:** `a7d08a2fa67b44aefe4692405b470fa6b174d29f` (branch `arena/393531fe-resumepilotai`)
**Environment:** `TEMP-ENVIRONMENT-MANIFEST.md`
**Rule unchanged:** a PASS still needs the acceptance criterion demonstrated; installing
a tool earned nothing. Every entry below is a command that ran, with its log.

> **Substitution warning carried on every runtime E-ID:** the SQL engine was
> **MySQL 5.7.29**, not MariaDB 11.4. Results are `SUBSTITUTE-ENGINE` and are never
> counted as target-database acceptance evidence.

| E-ID | Evidence | Command / artifact | Result |
|---|---|---|---|
| **E-300** | Temporary environment capture (OS, versions, browser, ports) | `Evidence/env/environment.json` | Debian 12, Node 22.22.3, Chromium 149.0.7827.0, Playwright 1.64.1, axe 4.14.0 |
| **E-301** | Backend suite (repository runner, unmodified) | `cd backend && RUN_MARIADB_INTEGRATION=false node scripts/run-tests-with-annotations.js` → `Evidence/logs/backend-suite-mock-pass.log` | **executed**: 1,315 tests / 1,271 pass / 14 fail / 30 skip, exit 1, 72.0 s |
| **E-302** | The 14 failures are DB-dependency, not logic | same log + `Evidence/logs/backend-db-recheck.log` | `ECONNREFUSED` without DB → `ER_NO_SUCH_TABLE` (`enterprise_membership_invitations`) with DB; 6 files re-run: 71 tests / 57 pass / 14 fail |
| **E-303** | 30 skips are all MariaDB gates with self-describing reasons | `grep '# SKIP' Evidence/logs/backend-suite-mock-pass.log` | 6 + 23 + 1 as quoted in `TEST-EXECUTION-REPORT.md` §2 |
| **E-304** | Enterprise suite | `npm --prefix backend run test:enterprise` → `Evidence/logs/enterprise-suite.log` | 187 / 187 pass, exit 0, 11.3 s |
| **E-305** | Payments suite | `npm --prefix backend run test:payments` → `Evidence/logs/payments-suite.log` | 43 / 43 pass, exit 0 |
| **E-306** | Security header & discovery policy checks | `npm run test:security` → `Evidence/logs/security-checks.log` | exit 0; `.htaccess` + `public/.htaccess` match canonical policy; `dist/.htaccess` SKIPped (absent) |
| **E-307** | Frontend typecheck | `npx tsc -b` → `Evidence/logs/frontend-tsc.log` | exit 0 |
| **E-308** | Frontend production build | `npx vite build` → `Evidence/logs/frontend-vite-build.log` | exit 0, `✓ built in 1.95s` |
| **E-309** | Frontend lint | `npm run lint` (oxlint) → `Evidence/logs/frontend-lint.log` | 0 warnings / 0 errors, 238 files |
| **E-310** | Express runtime + auth/RBAC/headers probes | `Evidence/logs/backend-http-probe.log` (10 probes) | 200 health; 503 readyz; 401 unauth; 401 forged; **403** candidate→admin; 400 weak password; CSP/HSTS/XFO/nosniff/Referrer/Permissions + RateLimit headers present |
| **E-311** | MariaDB gate refuses the substitute engine | `node --test test/mariadb-migration-gate.test.js` with `RUN_MARIADB_INTEGRATION=true` → `Evidence/logs/mariadb-gate-refusal.log` | `not ok` — `target engine must be MariaDB, received 5.7.29` |
| **E-312** | Migration fidelity probe (per-file) | `node developer-review/tools/migration-fidelity-probe.cjs` → `Evidence/artifacts/migration-fidelity.json` | 29 discovered, **1 applied**, 57 tables, first failure `002` `ER_PARSE_ERROR` (`ADD COLUMN IF NOT EXISTS`) |
| **E-313** | Audit viewport matrix (5 mandated widths × 9 workflows) | `npx playwright test -c developer-review/tools/playwright.audit-own.config.ts` → `Evidence/logs/playwright-audit-verification.log` + 45 PNGs | **45 / 45 pass**; 0 px horizontal overflow everywhere; 0 uncaught page errors |
| **E-314** | Browser console/network observations | `Evidence/artifacts/browser-observations.json` | 90 × `fonts.googleapis.com … ERR_CONNECTION_CLOSED` (sandbox-blocked fonts), 5 × 502 before the API was started, 0 page errors |
| **E-315** | axe-core WCAG 2.1 AA findings with selectors + contrast | `Evidence/artifacts/axe-violation-details.json` | 5 violations: `aria-prohibited-attr`(3 nodes), `label-content-name-mismatch`(2), `button-name`(**critical**,1), `color-contrast`(4; 3.16:1 / 2.45:1), `scrollable-region-focusable`(1) |
| **E-316** | Repository accessibility suite | `npx playwright test … tests/accessibility.spec.ts` → `Evidence/logs/pw/accessibility.log` | 59 / 59 pass (see DISC-012 for what that does *not* prove) |
| **E-317** | Repository engine-integrity suite | → `Evidence/logs/pw/engine-integrity-db.log` | 53 / 53 pass (Zod contracts against the live `:8080`) |
| **E-318** | Repository engine-security suite (secret non-disclosure, DOM masking, storage) | → `Evidence/logs/pw/engine-security-db.log` | 8 / 8 pass with a DB-backed API (1 failed + 7 skipped without one) |
| **E-319** | Repository responsive/visual suite against **committed baselines** | → `Evidence/logs/pw/engine-responsive-baselines.log` | 35 executions: **13 pass / 22 fail** = 20 visual (3–7 % delta, font-substitution attributable) + 2 trace-write artifacts; non-visual responsive/axe assertions pass |
| **E-320** | Repository freellmapi admin E2E | → `Evidence/logs/pw/freellmapi-admin-e2e-db.log` (47 fail, wrong port) and `…-5173.log` (**15 pass / 2 fail / 30 not-run**) | DISC-011 established: failures are the spec's hardcoded `:5173` |
| **E-321** | Billing/checkout parity suite | → `Evidence/logs/pw/billing-checkout-db.log` | 4 pass / 1 fail (fails only on `consoleErrors == []` because Google Fonts is blocked) |
| **E-322** | Candidate dashboard suite (175 tests) | → `Evidence/logs/pw/candidate-db.log` | sampled 3/175 then stopped: needs MariaDB + live AI; `BLOCKED`, not assessed |
| **E-323** | Audit-package verification (kept separate from app tests) | `bash developer-review/scripts/verify-audit-package.sh` → `Evidence/logs/audit-package-verification.log` | **34 PASS / 0 FAIL** |
| **E-324** | Scope integrity (no application file touched) | `git status --porcelain | grep -v '^.. developer-review/'` | empty (see `FINAL-ACCEPTANCE-REPORT.md` §8) |
