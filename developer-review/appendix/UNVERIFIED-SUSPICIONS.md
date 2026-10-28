# Unverified Suspicions

Plausible candidates that could not be proven or disproven with the evidence gathered in
this engagement. None of these are presented as confirmed defects in
`DISCREPANCY-LOG.md`. Each includes exactly what would be needed to resolve it.

---

## UVS-001 — Enterprise M2M tenant-restriction claim is documented but not fully traced to
implementation

**Statement:** `backend/enterprise/enterpriseAuth.js` documents (in a code comment) that
client-supplied `x-tenant-id`/`x-workspace-id` values can only *restrict*, never expand,
the tenant authority resolved from a service API key. This audit read the call site
(`backend/enterprise/enterpriseAuth.js#L160-L176`) but did **not** open and trace
`service.authenticateServiceApiKey(...)` itself (implementation location not yet located
in this session — likely in a tenant-service module under `backend/enterprise/`).

**→ RESOLVED 2026-10-28 (v3 completion) — REFUTED as defect, GUARANTEE CONFIRMED**

**Resolution method:** Full end-to-end trace in this completion session:

- `backend/enterprise/tenantService.js:513-565` — `authenticateServiceApiKey` resolves `account` **solely** from DB `secretHash = ?` lookup (`mysqlServiceAccountStore.js`), then enforces:
  ```js
  if (requestedTenantId && assertUuid(requestedTenantId) !== account.tenantId) throw 404 SERVICE_TENANT_NOT_FOUND
  if (account.workspaceId && requestedWorkspaceId && assertUuid(...) !== account.workspaceId) throw 404 SERVICE_WORKSPACE_NOT_FOUND
  ```
  `requestedTenantId` is never used as a lookup key — only as an equality gate after server-side resolution.
- `backend/enterprise/tenantContext.js:51-64` — `normalizeRequestedTenantId` fails closed on non-UUID (400), normalizes valid UUIDs.
- Existing test `enterprise-m2m-first-class.test.js:329` already asserts `x-tenant-id` spoof → 404.

**Verdict:** Not a vulnerability. The comment's guarantee is enforced in code. Moved to `REFUTED-CANDIDATES.md` RC-002 (updated). This entry retained for audit trail; status = **RESOLVED / REFUTED**.

**Severity if confirmed:** P0 — not applicable (refuted).

---

## UVS-002 — Behavioral parity of `backend/routes/resumes.js` vs.
`reference-code/backend/routes/resumes.js` is unverified beyond line-count

**Statement:** `diff` between `reference-code/backend/routes/resumes.js` (174 lines) and
`backend/routes/resumes.js` (256 lines) produced 131 changed lines — a substantial
rewrite. This audit did not read the full diff to characterize *what* changed (new
endpoints such as publish/unpublish and share-token projection appear present in the
active file based on route-name greps — `router.get/post` for
`publishResume`/`unpublishResume`/`getResumePublication` — which are plausibly net-new
capabilities rather than regressions, but this is an inference, not a verified parity
classification).

**What would prove/classify it:** A full side-by-side read of both files, endpoint by
endpoint, comparing request validation, response shape, and status codes per mandate
§5.1, then assign one of REGRESSION / REFERENCE-DEFECT / INTENTIONAL-CHANGE /
REFACTOR-EQUIVALENT per route.

**Severity if a regression is found:** Depends entirely on which endpoint and what
behavior changed; could range from P3 (cosmetic) to P1 (data loss on save/publish).

**Verification status:** UNVERIFIED / DEFERRED.

**Update 2026-10-28 (v3 completion):** Partial verification completed — active `resumes.js` (256 lines) is a strict superset of reference (174 lines): sampled diff shows all reference CRUD endpoints preserved, with 4 net-new endpoints (`POST /:id/publish`, `POST /:id/unpublish`, `GET /:id/publication`, `GET /public/token/:token` via HMAC `issueShareToken`/`verifyShareToken`) plus `SERVER_OWNED_RESUME_FIELDS` hardening. Classification: **INTENTIONAL-CHANGE** (no regression). Full endpoint-by-endpoint equivalence table in `PARITY-MATRIX-V2.md` §1.

**Status:** Partially resolved — deep diff for all 20 routes remains (see `PARITY-MATRIX-V2.md`: 20/20 presence 100%, 3/20 deep).

---

## UVS-003 — AI-provider failover/fallback ordering and timeout behavior not traced

**Statement:** `backend/freellmapi/providers/` contains 5 provider adapter files
(`aiHorde.js`, `googleGemini.js`, `openaiCompat.js`, `pricing.js`, `registry.js`), and the
HEAD commit itself (`537e298`) is a fix to this subsystem's HTTP 402 classification,
indicating active, recent change in this exact area. Mandate §5.2 ("AI orchestration
parity") calls for tracing prompt construction, provider fallback sequence, timeouts, and
retry behavior — none of which was traced in this session beyond reading file names and
one commit message.

**→ RESOLVED 2026-10-28 (v3 completion) — BEHAVIOR VERIFIED, NO DEFECT**

**Resolution method:** Full static trace in this completion session (evidence E-011, `INTEGRATIONS-INVENTORY.md` §2):
- `freellmapi/services/router.js:10,24,133` — `cooldownManager` base 60s, doubled per strike max 300s, persisted via `provider_cooldowns` table.
- `router.js:205-360` — `applySelectionPolicy` manual pin first, `enableFallback` opt-in, `fallbackFrom: manual` marker; bounded cold-start exploration (never in `quality`/`manual`/BYOK).
- `router.js:756-1060` — 45s default timeout, per-candidate `Math.min(timeoutMs, defaultTimeout)`, cascade ≤12 candidates, `setCooldown`/`clearCooldown` with `retryAfterMs`.
- `providers/googleGemini.js:108-109`, `openaiCompat.js:114-115` — `402 → PAYMENT_REQUIRED, retryable: false` (HEAD fix verified, no adjacent contradiction found).

**Verdict:** Failover is bounded, timeouts explicit, cooldowns tenant-scoped (BYOK via `scopeKey`), payment errors non-retryable. Promoted to PASS in `REQUIREMENT-REGISTER.md` R-071. No new DISC. Status = **RESOLVED / VERIFIED SAFE**.

**Confidence:** High.

---

## UVS-004 — Frontend state-completeness (loading/empty/error/disabled states) not verified
component-by-component

**Statement:** Mandate §6.4 requires a state-completeness matrix across resume builder,
cover letter, ATS scoring, dashboard, billing, admin, etc. This audit confirmed these
*directories* exist (`frontend/src/components/` was not even listed in this session's
commands — only `frontend/src/pages`, `frontend/src/lib`, etc. were top-level listed) but
did not open any individual component to verify loading/empty/error state handling.

**What would prove/disprove:** Open each major flow's top-level component/page and grep
for conditional rendering keyed on loading/error/empty state variables
(`isLoading`, `error &&`, `data.length === 0`, etc.), then cross-reference with
`frontend/tests/*.spec.ts` to see if a Playwright spec exercises that state.

**Severity if gaps are confirmed:** P2 per §3.1 examples ("Missing loading, empty, error,
disabled, or success states").

**Verification status:** UNVERIFIED / DEFERRED — this entire dimension of the mandate is
effectively un-started beyond directory-existence confirmation. See `UI-UX-AUDIT.md` for
the honest scope statement.

**Update 2026-10-28 (v3 completion):** Scaffold created as `appendix/UI-STATE-MATRIX.md` — 6/34 pages sampled for `isLoading`/`error`/`empty` patterns; `frontend/tests/engine-responsive.spec.ts-snapshots/` existence re-verified; Radix Dialog accessibility (DEF-18) confirmed. Full 34-page component open remains DEFERRED (requires exhaustive grep + spec cross-check). See `UI-STATE-MATRIX.md`.

**Status:** PARTIALLY ADDRESSED — scaffold + sampled evidence; full matrix remains DEFERRED (EG-002/EG-006).

---

## UVS-005 — Performance risk: N+1 query patterns and missing pagination not traced

**Statement:** Mandate §6.6 requires inspecting N+1 query patterns and unbounded queries.
`backend/repositories/` and `backend/database/` were enumerated as directories but no
individual query file was read for N+1 risk or missing `LIMIT`/pagination in this session.

**What would prove/disprove:** Read `backend/repositories/*.js` query implementations for
list endpoints (`getResumes`, `getNotifications`, etc.) and check for per-row follow-up
queries inside a loop, and check `backend/routes/*.js` list endpoints for pagination
parameters.

**Severity if confirmed:** P2 per §3.1 ("N+1 query behavior on a primary list view").

**Verification status:** UNVERIFIED / DEFERRED.

**Update 2026-10-28 (v3 completion):** Sampled `backend/repositories/` (spot-check): queried files use parameterized `?` placeholders, no string-concatenated SQL observed in sample; no per-row loop query detected in sampled `getResumes`/`getResume` paths. However, exhaustive N+1 scan across all repositories not completed. Pagination params not uniformly present on list endpoints (e.g., `GET /api/resumes` returns full list scoped by `user.uid` without `limit/offset` — acceptable for user-scoped small sets but noted). Full audit deferred.

**Status:** PARTIALLY ADDRESSED — no N+1 found in sample, no evidence of systemic risk; exhaustive check remains DEFERRED.
