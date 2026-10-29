# Evidence Index — Stable E-IDs for Senior Architectural Mandate v3 Completion


> **V5 note (`cccd35a5`):** backend-suite figures quoted in this document are from the V4 run, which
> left the repo's MariaDB gate off. The canonical run (`cd backend && npm test`) executes those tests:
> **1,315 discovered / 1,315 executed / 1,269 pass / 46 fail / 0 skipped, exit 1**, all 46 fails DB-caused
> (`Evidence/logs/v5/backend-canonical-suite.triage.md`). Historical numbers are retained, not overwritten.

> **M8 note (`a2ecb96`):** rows **E-365 … E-372** were raised by Mandate 8 at
> `a2ecb96d2b194df25d5cd8ce2ece23ef65068fd9`. E-365 **falsifies** a provenance claim made by M7 and recorded in
> E-356 … E-364's own section: `a7d08a2` is not byte-identical to `8a6e03bb` (264 files differ; 0 outside
> `developer-review/`) and the promised preservation ref does not exist. Earlier rows are retained verbatim.

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

---

## Re-audit evidence (2026-10-29) — E-325 … E-332

Generated by three reproducible scripts under `developer-review/tools/`. All counts below were measured
at revision `415335b`; none is carried over from an earlier report.

| ID | Evidence | Artifact / command | Result |
|---|---|---|---|
| **E-325** | Complete legacy/modern inventory with per-file ledger | `node developer-review/tools/legacy-modern-inventory.cjs` → `Evidence/artifacts/legacy-modern-inventory.json`, `legacy-file-inventory.tsv`, `Evidence/logs/legacy-modern-inventory.log` | legacy **650 files / 519 `.jsx` / 193,310 lines / 153 endpoints**; modern **206 / 151 `.tsx` / 68,812 lines / 161 endpoints**; 69 shared, 84 legacy-only, 92 modern-only. **Corrects E-002's "144 files/dirs" and "main.jsx 37k lines"** (actual: 645 lines) |
| **E-326** | Backend operation coverage vs both frontends | `node developer-review/tools/backend-ui-coverage.cjs` → `Evidence/artifacts/backend-ui-coverage.json`, `Evidence/logs/backend-ui-coverage.log` | 498 declarations → **384** unique `METHOD+path`; 192 consumed by modern; **192 (50 %) unreachable from the modern UI**; **58 referenced by neither frontend**; 0 unresolved mounts |
| **E-327** | Capability parity register (machine-checkable) | `node developer-review/tools/parity-matrix.cjs` → `FEATURE-PARITY-MATRIX.md`, `Evidence/artifacts/feature-parity.json`, `Evidence/logs/parity-matrix.log` | **109 capabilities**: 25 FULL, 6 REPLACED, 35 PARTIAL, **30 MISSING**, **9 MOCK/FABRICATED**, 4 UNVERIFIED, 0 STATIC STUB / LOCAL-ONLY / INTENTIONAL RETIREMENT. Legacy attribution **650/650**. *Superseded by E-350 (112 rows, 12 FULL). This row is kept as the V2 evidence record.* |
| **E-328** | Fabricated-state audit of admin surfaces | `AdminSecurityTab.tsx` (928 L, 0 API refs, 4 seed arrays), `AdminContentMarketingTab.tsx` (456 L, 0 API refs, 16 records), `AdminAttentionTab.tsx` (169 L, 0 API refs), `AdminModerationTab.tsx` (seeded reads, `.catch(() => {})` writes) | 9 capability rows classified `MOCK / FABRICATED STATE`; every corresponding backend endpoint confirmed present |
| **E-329** | Voice-interview removal measure | `wc -l` on 4 legacy files + project-wide grep for media APIs | **2,432 legacy lines** (`LiveInterviewSession` 1,691, `LiveVoiceEngine` 233, `LiveAudioWaveform` 254, `useInterviewMedia` 254) → **0** matches for `speechSynthesis|SpeechRecognition|getUserMedia|MediaRecorder|AudioContext` in `frontend/src` |
| **E-330** | Portfolio edit dead-end trace | `pages/portfolio/builder.tsx:347,477,490-533`, `lib/portfolio-document.ts:412-420` | `editable=false` for every legacy document; message "Built with the earlier page editor"; no migration path in repo |
| **E-331** | Internationalisation / analytics / SEO / PWA removal measure | project-wide greps (both trees) | i18n **16 locales / 1,011 `t()` keys / 131 consumers → 0**; GA4 **14 → 0**; `RouteSeo` **2 → 0**; service worker **3 → 0**; JSON-LD **1 → 0**; consent banner **2 → 0** |
| **E-332** | Template-count refutation | `lib/template-catalog.ts`, `lib/template-layouts.ts`, `app/router.tsx` | **104 catalogue entries**, 24 layout families, 9 archetypes (26 modern-split, 21 minimal-ats, 20 executive-banner, 20 tech-grid, 13 compact-euro, 4 cover) vs 51 legacy `cv*` dirs → the "51 → 8" allegation is refuted |

### V4 corrections and additions (2026-10-29, revision `0adad00`)

**E-332 is corrected here, not edited away.** Its row states "104 catalogue entries, 24 layout families,
9 archetypes (26 modern-split, 21 minimal-ats, 20 executive-banner, 20 tech-grid, 13 compact-euro, 4
cover)". Re-measured with a string-aware bracket scan of the `TEMPLATES` array: **100 entries**
(`Cv1`…`Cv100`), **5** archetypes with distribution 26 / 21 / 20 / 20 / 13, and no `cover` archetype in
that array (0 matches). The "104" is what `grep -c "id: '"` returns on the file, because the filter-chip
list above the array also uses `id:`. Recorded as E-334.

| ID | Evidence | Artifact / command | Result |
|---|---|---|---|
| **E-333** | Reference-revision verification | `git rev-parse HEAD`, `git ls-remote`, `git fetch origin dev:refs/remotes/origin/dev`, `git diff <tree>` | HEAD = `origin/main` = `0adad00d0975…`; `origin/dev` = `ea7b7416…`; merge-base `0adad00`; trees byte-identical; ahead/behind `0/1456` |
| **E-334** | Template catalogue recount | string-aware scan of `frontend/src/lib/template-catalog.ts` | **100 entries**, 5 archetypes (26 modern-split / 21 minimal-ats / 20 executive-banner / 20 tech-grid / 13 compact-euro), 6 categories; supersedes the "104 / 9 archetypes / 24 families" figure |
| **E-335** | Seven-class operation register | `tools/backend-reachability.cjs` → `Evidence/artifacts/backend-reachability.json`, `backend-operations.tsv`, `Evidence/logs/backend-reachability.log` | 498 registrations → 384 unique METHOD+path (114 collapsed); UI 126 / INDIRECT 6 / EXTERNAL 27 / SERVER-ONLY 11 / INTENTIONALLY-UNEXPOSED 9 / UNREACHABLE 201 / UNVERIFIED 4 |
| **E-336** | Backend syntax sweep | `node --check` across all backend `.js` | **364 files, 0 syntax failures** (`Evidence/logs/v4/backend-syntax.log`) |
| **E-337** | Frontend type-check | `tsc --noEmit -p tsconfig.app.json` in `frontend/` | **exit 0, 0 errors** over 206 source files (`Evidence/logs/v4/frontend-typecheck.log`, 0 bytes) |
| **E-338** | Full backend suite | `node --test` (single concurrency) | **1,315 tests / 1,271 pass / 14 fail / 30 skip**, 69,414 ms, exit 1; all 14 failures traced to the missing MariaDB (`Evidence/logs/v4/backend-full-suite.log`) |
| **E-339** | Enterprise suite | `node --test --test-concurrency=1 --test-force-exit enterprise-test/*.test.js` | **187/187 pass, 0 fail, 0 skip**, exit 0 (`Evidence/logs/v4/enterprise-suite.log`) |
| **E-340** | Browser-availability probe | `ls ~/.cache/ms-playwright`, `command -v chromium`, suite log | cache absent; no browser binary; suite logs `browserType.launch: Executable doesn't exist at …chromium_headless_shell-1234…` 11×; `playwright test --list` = 3,675 tests in 21 files / 42 projects over **7** spec files |
| **E-341** | Rejection-feedback persistence trace | `resilientMutations.js:321-328`, `MySQLRepository.js:1600-1637`, `001_baseline.sql:180-204` | `employerNotes` and `revision` are not in the adapter's 13-column map; `notes` is re-written from the pre-update record; 0 tests reference `employerNotes` (DISC-020) |
| **E-342** | OAuth registration/configuration trace | `backend/index.js:7273-7460`, `security/oauth.js`, `database/oauthStore.js` | state = 32 random bytes stored only as SHA-256 + TTL; cookie binding `timingSafeEqual`; single-use `SELECT … FOR UPDATE`; S256 PKCE; verified-email-only; conflict/link guards; `oauth_not_configured` fail-closed at `index.js:7280` |

| **E-343** | Client call → served operation sweep | `tools/client-call-existence.cjs` → `Evidence/artifacts/client-call-existence.json` | **229 call sites** over 205 files: 188 exact, 11 dynamic-pattern matches, **30 sites / 23 distinct paths served by no operation**, 0 verb mismatches. Basis of DISC-025 |
| **E-344** | Reachability cross-check | `tools/reachability-crosscheck.cjs` | independent parser agrees on **385/385** operations, **0 disagreements**, 356 raw route literals counted pre-expansion |
| **E-345** | FULL PARITY challenge | `tools/parity-endpoint-audit.cjs` → `Evidence/artifacts/parity-endpoint-audit.json` | 19 surviving FULL rows, **19/19 SUPPORTED**; 8 rows downgraded first (6 partial, 2 missing) with the endpoint evidence in `DISCREPANCY-LOG.md` DISC-025 |
| **E-346** | Canonical backend suite | `cd backend && npm test` → `Evidence/logs/v5/backend-canonical-suite.log` | **1,315 discovered / 1,315 executed / 1,269 pass / 46 fail / 0 skip**, 70.8 s, exit 1 |
| **E-347** | Suite failure causation | `Evidence/logs/v5/backend-canonical-suite.triage.md` | **46/46** failures mapped: 40 `ECONNREFUSED 127.0.0.1:3306`, 4 explicit 503 `APPLICATION_DATABASE_UNAVAILABLE`, 2 handler-level (audit-logs 503; webhook replay `getPool()` → 500) | 

| **E-348** | V6 subfeature traceability register | `FEATURE-DEPTH-EVIDENCE-REGISTER.md` | 56 subfeature rows across 10 capability rows (the 8 alleged + `FP-F02` + `FP-F06`), each with legacy anchor, modern anchor, backend op, persistence and test level; §2 dispositions; §4 fixture table (10 components); §5 dead-path table (19 paths / 30 sites); §6 detector adjudication |
| **E-349** | V6 ten-check detector | `tools/parity-depth-checks.cjs` → `Evidence/artifacts/parity-depth-checks.json` | 10 checks: **4 PASS / 6 LEAD / 0 FAIL**; leads 17 swallow-success, 17 seeded baseline, 3 storage, 4 subfeature, 30 dead client sites, 10 export-disposition; 18 of 57 leads adjudicated as false positives with reasons |
| **E-350** | V6 parity re-measurement | `tools/parity-matrix.cjs` (16 rows edited), `tools/parity-endpoint-audit.cjs` | **112 rows: 12 FULL / 47 PARTIAL / 32 MISSING / 12 MOCK / 6 REPLACED / 3 UNVERIFIED**; 12/12 FULL endpoint-supported; 7 V5-FULL rows downgraded, 2 PARTIAL rows reclassified MOCK |
| **E-351** | V6 dead-call-site adjudication | `parity-depth-checks.json` check 9 + `grep -rn` over `backend/` | 30 call sites / 19 distinct paths; **17 defective paths / 27 sites** after excluding 2 benign fallbacks; 3 paths have a same-shape counterpart under a different prefix, 1 renamed, 13 with no counterpart at all |
| **E-352** | V6 template-structure census | parse of `template-catalog.ts`, `wc -l` over `src/cv-templates` and `frontend/src/lib|components/resume` | 51 + 4 legacy template dirs, 55 SCSS, 13,041 JSX / 19,655 SCSS vs 100 ids / 5 archetypes / 19 families / 6 special specs / 3,254 modern lines |
| **E-353** | V6 audio-API census | `grep -rn "SpeechRecognition|MediaRecorder|getUserMedia|speechSynthesis|AudioContext" frontend/src` | **0 hits** in the modern tree; 4 legacy files totalling 2,432 lines |
| **E-354** | V6 email surface census | `backend/routes/email.js` route map × `backend-reachability.json` | 12 email admin operations registered; **4 reachable** from `AdminEmailSmtpTab.tsx`, 8 SERVER-ONLY |
| **E-355** | V6 verifier repair record | `scripts/verify-v4-reconciliation.py` diff | the pinned `assert full == 19` was replaced by a derived assertion (count read from the register, no magic number) so a classification change cannot silently satisfy the check; 16/16 still pass |

| **E-356** | V7 capability subfeature audit | `tools/capability-subfeature-audit.cjs` → `CAPABILITY-SUBFEATURE-REGISTER.md`, `Evidence/artifacts/capability-subfeatures.json` | 112 capability rows / 487 subfeature rows; **40 ADJUDICATED, 21 SIGNAL_CLEAN, 10 DEEP_READ_M6, 41 EQUIVALENCE_LEAD**; 62 rows with zero residual leads, 10 rows / 20 items explicitly open; attribution rule = a legacy action counts as a lead only if it appears in ≤2 rows' legacy corpora (315 actions re-attributed across rows) |
| **E-357** | V7 hand adjudications | `Evidence/adjudications-m7.json` | 40 row-level dispositions (24 `NO_CHANGE`, 9 `SUBFEATURE_LOSS`, 5 `CONFIRMED_MISSING`, 1 `PARTIAL_EQUIVALENT`, 1 `RECLASSIFY_PARTIAL`), each with the summary, the file:line that settled it; plus 18 contract-gap adjudications separating wrong-URL from absent-capability |
| **E-358** | V7 client↔backend contract audit | `tools/client-contract-audit.cjs` → `CLIENT-BACKEND-CONTRACT-REGISTER.md`, `Evidence/artifacts/client-contract-audit.json` | 212 client call sites vs 413 parsed registrations (391 distinct): **190 `REGISTERED_AND_MATCHED` / 8 `REGISTERED_WITH_CONTRACT_MISMATCH` / 14 `NO_REGISTERED_OPERATION`**; 15 distinct gap paths / 22 sites; **12 swallow-then-assert-success sites**; register agreement 385 shared, `onlyInRegister` = 0 |
| **E-359** | V7 register re-derivation (DISC-041) | `tools/backend-reachability.cjs` after receiver resolution | 397 registrations / **393 unique operations** (was 499 / 385); 8 `routes/support.js` operations recovered; classes **156 / 10 / 27 / 11 / 2 / 176 / 11**; mount prefixes now de-duplicated |
| **E-360** | V7 register cross-check repair | `tools/reachability-crosscheck.cjs` | leading-slash anchored path regex + all matching lines per endpoint: **393/393 agreements, 0 disagreements** (was 3 disagreements on `/support/tickets*`, caused by attributing `:588` to the dead admin hook at `:433`) |
| **E-361** | V7 detector sweep | `tools/parity-depth-checks.cjs` → `Evidence/artifacts/parity-depth-checks.json` | 10 checks: **4 PASS / 6 LEAD / 0 FAIL**; leads 17 swallow-success, 17 seeded baseline, 3 storage, 4 FULL-row subfeature, 21 dead client sites, 9 export disposition. Check 1 now excludes adjudication prose lines (a generated register quoting a classification is not a contradictory claim) |
| **E-362** | V7 parity re-measurement | `tools/parity-matrix.cjs`, `tools/parity-endpoint-audit.cjs` | **112 rows: 12 FULL / 49 PARTIAL / 30 MISSING / 12 MOCK / 6 REPLACED / 3 UNVERIFIED**; 12/12 FULL endpoint-supported (12 `SUPPORTED`, 0 other); 650/650 legacy and 206/206 modern files attributed |
| **E-363** | V7 runtime harness specification | `RUNTIME-TEST-HARNESS-M7.md` | R-01 … R-10 with preconditions, DB fixtures, expected status codes, negative cases and the per-run evidence contract (revision stamp, HAR, DB snapshot). **0 specs executed** — stated as a spec, not a result |
| **E-364** | V7 verifier de-pinning | `scripts/verify-v4-reconciliation.py`, `scripts/verify-parity.py` | the operation count is now derived from the TSV (floor 385) instead of pinned at 385 — the pin is what allowed DISC-041 to survive three passes; the coverage total is recomputed from the registers; merge stubs are excluded from the finding count. 16/16 and 61/61 pass |

| **E-365** | M8 provenance audit (DISC-049) | `git rev-parse HEAD`, `git show-ref \| grep -i audit`, `git diff --stat a7d08a2 8a6e03bb`, `git ls-tree -r --name-only a7d08a2 \| wc -l` | audited revision `a2ecb96d2b194df25d5cd8ce2ece23ef65068fd9` (parent `c292159`, 12 commits past `a7d08a2`/`8a6e03bb`); **264 files differ** between `a7d08a2` and `8a6e03bb`, **0** outside `developer-review/`; `a7d08a2` tracks **3,553** files (not 3,806); `refs/audit-preserved/base-a7d08a2` **absent**; M7's byte-identity sentence **falsified** and recorded, not rewritten |
| **E-366** | M8 registration-count reconciliation (gate B) | `tools/m8-registration-reconciliation.cjs` → `M8-REGISTRATION-COUNT-RECONCILIATION.md`, `Evidence/artifacts/m8-registration-reconciliation.json` | old rules **replayed**: 413 literals reproduce; repaired parser **405 instances = 399 distinct keys**; instance level **413 = 405 + 6 + 2** and **405 = 397 + 8**; key level **405 − 6 duplicates = 399 = 393 + 6 only-B**; the 6 same-line alias literals are `index.js:2867/3067/3136/3226/6537/6748`; 2 false positives at `:7419`; **0** in-scope disagreements; path-shape collisions over the 393 operations = **0** (the withdrawn "70" figure); the 6 duplicate registrations include four literal double-declarations in `routes/platform.js` → **DISC-055** |
| **E-367** | M8 subfeature closure (gates C, D) | `M8-SUBFEATURE-CLOSURE.md` + `Evidence/adjudications-m8.json` + `tools/capability-subfeature-audit.cjs` | 10 rows / 20 M7 open items → **21 lead judgements**, 0 open: MISSING 14 / EQUIVALENT_REPLACEMENT 4 / PRESERVED 2 / MIXED 1; **0 row classifications changed** in this section; one "preserved" lead refuted by tracing past the route into the registry and schema (**DISC-054**) |
| **E-368** | M8 parity revalidation (gate E) | `tools/m8-parity-revalidation.cjs` → `M8-PARITY-REVALIDATION.md`, `Evidence/artifacts/m8-parity-revalidation.json` | **13 FULL / 51 PARTIAL / 28 MISSING / 0 STUB / 12 MOCK / 5 REPLACED / 3 UNVERIFIED = 112**; 18 at parity (17 strict) / 40 missing-or-fabricated; three rows moved with prior verdicts preserved (`FP-D07`, `FP-A12` → PARTIAL, `FP-C06` → FULL); 13/13 FULL endpoint-SUPPORTED |
| **E-369** | M8 contract revalidation (gates E, F) | `tools/m8-contract-gap-revalidation.cjs` → `M8-INDEPENDENT-ACCEPTANCE-REPORT.md` §6, `Evidence/artifacts/m8-contract-gap-revalidation.json` | 212 client sites → **190 matched / 8 contract-mismatch / 14 no-registered-operation** (22 unresolved); 15 gap shapes re-resolved structurally (ANOTHER_CONTRACT 5 / AMBIGUOUS 5 / NO_OPERATION 5) **then adjudicated in source** → **WRONG_URL 11 / MISSING_BACKEND 4**; two shapes explicitly refused an equivalent (410 retirement stub; no email operation); **false success 12 sites over 11 paths** (4 matched, 2 mismatch, 6 no-operation) **plus 1 undetectable surface** (the contact form, which issues no request at all) |
| **E-370** | M8 runtime execution (gate G) | `Evidence/logs/m8-{runtime-probe,http-probe,http-probe-authenticated,scenarios,backend-suite,frontend-typecheck}.log` | backend **started** (`IN_MEMORY_REPOSITORY=1`, local HMAC, port 5061, node v22.22.3): 18 unauthenticated + 25 authenticated probes; **R-05 120 KB → 200, ~400 KB → 413 `PAYLOAD_TOO_LARGE`**; `GET /api/jobs` 404 vs `/api/jobs-data` 200; client-only paths 404 while real paths answer domain errors; suite **1,315 / 1,269 pass / 46 fail** (exit 1); `tsc -b` exit 0 (0-byte log); **R-03/R-05/R-08/R-09 PASS, R-01/R-02/R-04/R-10 PARTIAL, R-06/R-07 BLOCKED** (DB- and provider-backed) |
| **E-371** | M8 verifier quality review (gate H) | `M8-VERIFIER-QUALITY-REVIEW.md`; `scripts/verify-audit-package.sh`, `verify-v4-reconciliation.py`, `verify-parity.py` | **61/61**, **20/20**, exit 0 — but what they prove is *presence and arithmetic*: no re-derivation in the shell suite, floor thresholds, a literal `"176"` pin, vacuous `SUPPORTED` for endpoint-less FULL rows, a `[30,45]` band on `rowsWithNoDeclaredEndpoint`, one shared helper-verb assumption. Published as PASS **with weaknesses**, not PASS clean |
| **E-372** | M8 independent acceptance report (gate K) | `M8-INDEPENDENT-ACCEPTANCE-REPORT.md` | gates **A PARTIAL / B PASS / C PASS (static) / D PASS (static) / E PASS / F FAIL (product) — PASS (identification) / G BLOCKED / H PASS with weaknesses / I PASS / J PASS / K PASS** → verdict **`PARTIAL — BLOCKED`**; production readiness **NOT ESTABLISHED**; six dimensions kept separate; §9 proves **0 changes outside `developer-review/`** |

**Note on E-002 (kept for the record, not edited):** its legacy-tree figures are superseded by E-325.
The original row is preserved so the correction is auditable rather than invisible (see DISC-018).
