# SUBSYSTEM_INVENTORY

Coverage accounting for the audit. Disposition key: `OK` verified sound · `REPAIRED` defect corrected in this change set · `BLOCKED` cannot be verified in this environment · `OUT OF SCOPE` excluded by directive · `RETAINED` deliberately unchanged with a recorded reason.

| # | Subsystem | Path(s) | Files | Disposition | Evidence / note |
| --- | --- | --- | --- | --- | --- |
| 1 | Authoritative frontend app | `frontend/src/{app,pages,components,lib,providers}` | 163 | REPAIRED | Build passes; native dialogs removed; toast/alert-dialog primitives added; revision contract adopted |
| 2 | Frontend routing | `frontend/src/app/router.tsx` | 1 | OK | 371 lines, lazy routes, `RequireAuth` role gates, `RouteErrorBoundary`, legacy path aliases redirect |
| 3 | Auth guards | `frontend/src/components/guards/*` | 3 | OK | `require-auth`, `require-export-access`, `route-error-boundary` present and wired |
| 4 | API client layer | `frontend/src/lib/api-client.ts` + 35 sibling modules | 36 | REPAIRED | `normalizeError` exists and is used; revision coercion removed from CAS write paths |
| 5 | Design system | `frontend/src/index.css`, `components/ui/*` | 13→15 | REPAIRED | Token scale (`brand/error/success/warning/info/ink/surface`) verified; 2 missing primitives added |
| 6 | Legacy React 18 tree | `src/**` (root) | 651 | RETAINED | 192,769 LOC; not published by `npm run build`; guarded by 115 test files; out of the corrective scope to avoid an unauthorised rewrite |
| 7 | Express app + routes | `backend/index.js`, `backend/routes/*` | 21 | OK | 20 route modules; Helmet, rate limiting, `errorResponder` present |
| 8 | Optimistic concurrency / CAS | `backend/services/resilientMutations.js`, `profileSanitizer.js`, `revision.js` | 3 | REPAIRED | DEF-001 root cause; 17 coercion sites normalized; new authoritative module |
| 9 | Interview session domain | `backend/services/liveInterviewSession.js` | 1 | REPAIRED | Duplicate revision bounds consolidated onto the shared contract |
| 10 | Enterprise/admin AI governance | `backend/services/aiAdmin.js`, `adminAiEntitlement.js`, `featureFlagService.js` | 3 | OK | Revision usage inspected; `|| 0` sites here read counters, not CAS guards |
| 11 | Database schema & migrations | `backend/database/migrations/*`, `migrationRunner.js`, `mysql.js` | 9+ | BLOCKED | Schema read statically (`revision INT NOT NULL DEFAULT 1` confirmed); no server available to execute |
| 12 | Payments | `backend/services/invoiceService.js`, `paymentActivation.js`, Stripe/Paytm deps | 4+ | BLOCKED | Requires DB + live keys; no destructive/chargeable action attempted |
| 13 | Document generation (DOCX/PDF) | `backend` docx/export services, `template-lab/` | many | BLOCKED | Playwright browsers absent; `docx-parity`/`export-pipeline` suites need them |
| 14 | Resume templates | `src/cv-templates`, `frontend/src/cv-templates` | many | OK | `test:templates` static suites pass in `test:product` |
| 15 | Portfolio | `backend/routes/portfolios.js`, portfolio tests | — | OK | `portfolio-sanitization/data/isolation/templates` pass |
| 16 | Notifications & messaging | `backend/routes/notificationsData.js`, `frontend/src/components/{notifications,messages}` | — | OK | Decoupling gate `dir072` passes |
| 17 | Public discovery / SEO | `backend/routes/publicDiscovery.js`, `scripts/generate-public-discovery.mjs` | — | OK | `--check` gate passes |
| 18 | Security headers / CSP | `scripts/generate-security-headers.mjs`, `.htaccess` | — | OK | Gate passes 71/71 at baseline, 77/77 after |
| 19 | CI/CD | `.github/workflows/{quality-gate,production-release,ai-engine-validation}.yml` | 3 | REPAIRED | `audit:production` extended to the shipped frontend |
| 20 | Browser extension | `extension/` | — | RETAINED | Independent artefact, not in the corrective path |
| 21 | Archives / backups / evidence | `archive/`, `backups/`, `dist-legacy-backup/`, `candidate_screenshots/`, `crawl-artifacts/`, `artifacts/` | 900+ | RETAINED | Historical/generated material; classified, not modified |
| 22 | Bridge | `.bridge/**` | 842 | **OUT OF SCOPE** | Excluded by directive §2.4. Untouched; **0 files in the patch** (verified by diff scan) |
| 23 | Roo/agent directives | `roo-directives/`, `.roomodes`, `.agents/`, `.claude/`, `prompt-00*.md`, `AGENTS.md`, `CLAUDE.md` | — | RETAINED | Governing instructions read; `AGENTS.md` §8.1 used as frontend-authority evidence |
| 24 | Vendored/generated deps | `node_modules/**`, `dist/**`, `frontend/dist/**`, lockfiles | — | RETAINED | Excluded from the patch; lockfiles unchanged (no dependency added or removed) |
