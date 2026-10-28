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

**What would prove it:** Locate `authenticateServiceApiKey` (grep
`authenticateServiceApiKey` across `backend/enterprise/`), confirm that
`requestedTenantId`/`requestedWorkspaceId` are used only in an equality/subset check
against the tenant/workspace resolved from the API key record itself (e.g.
`if (requestedTenantId && requestedTenantId !== resolvedTenantId) throw ...`), and never
used as the primary lookup key for data access.

**What would disprove/promote it:** If `requestedTenantId` is ever used to construct a
database query predicate *before* or *independent of* the API-key-derived tenant, that
would be a confirmed tenant-isolation defect (P0, per mandate §6.2) and should be
escalated immediately to `DISCREPANCY-LOG.md` as DISC-008 in a follow-up session.

**Severity if confirmed:** P0 (cross-tenant data access).

**Verification status:** UNVERIFIED — DEFERRED pending a follow-up read of the tenant
service module.

**Recommended next step for implementing developer:** Before any other work on the
enterprise module, trace this single function end-to-end and either close UVS-001 as
refuted (promote the note to `REFUTED-CANDIDATES.md`) or escalate it.

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

**Recommended next step:** Treat as the top priority item in
`appendix/PARITY-MATRIX.md`'s "needs follow-up" column; this is the single most
user-journey-critical file (resume CRUD + publish) in the entire inventoried route set and
deserves the first full line-by-line diff in any follow-up audit session.

---

## UVS-003 — AI-provider failover/fallback ordering and timeout behavior not traced

**Statement:** `backend/freellmapi/providers/` contains 5 provider adapter files
(`aiHorde.js`, `googleGemini.js`, `openaiCompat.js`, `pricing.js`, `registry.js`), and the
HEAD commit itself (`537e298`) is a fix to this subsystem's HTTP 402 classification,
indicating active, recent change in this exact area. Mandate §5.2 ("AI orchestration
parity") calls for tracing prompt construction, provider fallback sequence, timeouts, and
retry behavior — none of which was traced in this session beyond reading file names and
one commit message.

**What would prove/disprove a defect:** Read `backend/freellmapi/agent/` and
`backend/freellmapi/services/` (directories enumerated but not opened) for the actual
fallback/timeout/retry implementation, and cross-reference against
`backend/services/aiRuntime.js` (imported at `backend/index.js#L16`:
`generateWithProviders, getSharedAiRouter`).

**Severity if confirmed:** Could range from P2 (missing timeout causing hung requests) to
P1 (silent provider fallback masking a billing/quota contradiction — notably, the HEAD
commit's own subject, "classify HTTP 402 as PAYMENT_REQUIRED ... to resolve
code-status contradiction," indicates at least one such contradiction *was* found and
fixed by the project itself very recently, which raises the prior probability that
*similar* adjacent contradictions may still exist elsewhere in this subsystem).

**Verification status:** UNVERIFIED / DEFERRED — not opened in this session.

**Recommended next step:** This is the single most recently-and-actively-changed backend
subsystem in the entire inspected commit window; it should be the second priority (after
UVS-001) for a follow-up audit session, specifically re-reading
`backend/freellmapi/agent/`, `backend/freellmapi/services/`, and
`backend/services/aiRuntime.js` end-to-end, plus the full test suite names under
`backend/test/` that reference `freellmapi` or `ai-routing`.

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

**Recommended next step:** Dedicate a full follow-up session exclusively to this
dimension; it was the single largest unstarted area in this engagement given the time
budget.

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

**Recommended next step:** Prioritize `backend/repositories/` for the next audit pass,
cross-referenced against the route inventory in
`appendix/INVENTORIES/routes.md`.
