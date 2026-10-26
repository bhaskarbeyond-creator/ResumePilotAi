# 02 — Scope, Method and Confidence

---

## 1. Systems analysed

### 1.1 Identity of each tree (verified, not assumed)

| Tree | Byte-level evidence of role |
|---|---|
| `reference-code/` | `reference-code/README.md` declares the directory a read-only snapshot of `ime365.com` taken 2026-10-25 from `in-mum-web1641.main-hosting.eu`, with live deployed SHA `24ada353ad96a48ea4a2d46320e7c757d5671695` recorded in `reference-code/backend/COMMIT_SHA`. **Immutability policy is explicit**; this review did not modify a single byte. |
| `src/` | The SPA source for the same product: `src/main.jsx:577` mounts `/admin/*` → `src/components/admin/Admin.jsx`; `reference-code/public_html/assets/Admin-*.js` are its compiled chunks. Treated as **legacy frontend reference**. |
| `frontend/` | New UI: `frontend/package.json` name `frontend`, Vite 8.3, React 19.2, React Router 7.18, Radix primitives, TanStack Query/Table. Admin surfaces: `frontend/src/pages/admin/console.tsx` + `frontend/src/components/admin/**` (8,252 lines). |
| `backend/` | New service: `backend/index.js` (7,573 lines) + `backend/routes/**` + `backend/security/**` + `backend/services/**` (64,856 lines excluding tests). `backend/COMMIT_SHA` = `be7a33cd…`. |

### 1.2 Why `src/` and `frontend/` are both in scope for "legacy vs new"

The engagement defines the legacy reference as a source of *business intent*. For the admin plane, intent lives in `src/` (screens, permission tables, hidden affordances), while *deployed behaviour* lives in `reference-code/`. Both were read; where they disagree, `reference-code/` wins as the behavioural record and the discrepancy is stated. Concretely: `src/components/admin/Admin.jsx` gates tabs with a permission table; the compiled bundle in `reference-code/public_html/assets/Admin-*.js` is the artefact that shipped. No behavioural disagreement was found between them in the admin plane.

### 1.3 The finding that reframes the whole review (DIFF-01 … DIFF-09, Appendix A.4)

| File pair (`reference-code/backend/` → `backend/`) | Diff size | Interpretation |
|---|---|---|
| `routes/adminUsers.js` | **0 lines** | Identical |
| `routes/adminAudit.js` | **0 lines** | Identical |
| `security/adminAudit.js` | **0 lines** | Identical |
| `routes/platform.js` | 22 lines | Trivial/incidental |
| `services/featureFlagService.js` | 13 lines | One flag removed (F-24) |
| `security/policy.js` | 46 lines | DIR-022, DIR-106 additions |
| `security/auth.js` | 108 lines | `optionalAuth`/`bearerTokenFrom` extraction only (DIR-071) |
| `routes/adminPlatformOperations.js` | 392 lines | Feature-flag CRUD + tenant operations added |
| `src/components/admin/**` → `frontend/src/components/admin/**` | rewrite | Legacy 29,777 lines replaced by 8,252 lines |

**Therefore:** the "new backend" is a *hardened continuation* of the legacy backend; the "new frontend" is a *rewrite*. Two consequences govern the entire document:

1. Any legacy backend defect that was not explicitly patched **is a defect of the new system** and must be reviewed as such — the fact that legacy shipped it is not a defence.
2. Any legacy frontend behaviour that was *correct* and did not survive the rewrite is a **regression introduced by the new system**, and the new system carries the burden of justification.

This is the reverse of the usual "did the rewrite preserve the legacy?" question, and it changes several verdicts: e.g. the missing `system.config.read` grant (RCA-007) is a **carried-forward legacy defect**, whereas the fixture-backed console (RCA-001) is a **new regression**.

---

## 2. How the legacy reference was used — and how it was not

### 2.1 Permitted uses (all exercised)

| Permitted use | Where exercised |
|---|---|
| Discover capabilities the business depends on | §03 CAP-001…CAP-059 derived from `src/components/admin/Admin.jsx:840-960` (24 concrete tab routes) and `src/components/admin/sidebar/sidebar.jsx:68-111` (31 settings screens), cross-checked against `reference-code/backend/routes/*` for the API each screen calls. |
| Understand domain rules and workflow | User lifecycle (create → assign tenant → membership), employer verification, ticket SLA states, tenant lifecycle (`backend/enterprise/constants.js:3-16`). |
| Identify configuration points and permission patterns | Legacy `PATH_PERMS` (`sidebar.jsx:18-43`), `RequireTabPerm` table (`Admin.jsx:840-960`), `superAdminOnly` settings flags (`sidebar.jsx:68-111`). |
| Recognise legacy defects so they are *not* treated as requirements | Recorded as intent class **Legacy defect** in §03 and detailed in §07. Examples: permission checks existing only in the browser; 14 inert module toggles; the `SUPPORT` role granted 11 tabs with no matching backend policy. |

### 2.2 Prohibited uses (explicitly avoided)

* **No parity demand on quirks.** Example: legacy `PlatformQueues.jsx` displays a hard-coded `deadLetterCount || 1` fallback (`AdminQueuesTab.tsx:237` carries it forward); the review does not require reproducing it — it is registered as RCA-001 evidence.
* **No hard-coding inherited by argument.** The fact that legacy also hard-coded `PERMISSIONS` (`reference-code/backend/security/auth.js` identical literal) is *not* a justification for keeping it; §08.4 INV-3 fails on its own terms and §09 proposes the configuration key.
* **No legacy code copied into proposed solutions.** Every required modification in §10 specifies the target architecture, not a legacy file to reinstate — including where the legacy behaviour was correct (e.g. REC-009 ports the *intent* of step-up recovery into the new API client, not `AdminReauthPrompt.jsx`).
* **No legacy as acceptance oracle.** Where the new system diverges deliberately and defensibly (§07 DIV-001, DIV-008, DIV-011), divergence is approved; where it diverges silently and badly (DIV-004), it is rejected.

---

## 3. Analysis techniques

| Technique | Applied to | Output |
|---|---|---|
| **Static route inventory (parser)** | All of `backend/routes/**` + inline `app.<verb>` routes in `backend/index.js`; mount prefixes resolved from `app.use(...)` | 401 route registrations app-wide; **149 admin/platform registrations → 145 distinct method+path; 4 duplicates** at runtime. The file:line table in Appendix A.1 resolves **134 registrations → 130 distinct** by static parsing; the 15-route difference is sub-mounted routers and multi-line argument lists that only the runtime walk sees (reconciliation stated in A.1) |
| **Middleware-chain attribution** | Each admin route classified as *route-level guard* / *inline handler check* / *policy-table only* | 61 / 24 / 60 (A.1; the static extractor additionally shows **64 guarded registrations = 60 distinct guarded routes**, consistent with 61 once one alias is counted twice) |
| **Permission-vocabulary census** | `PERMISSIONS` literal × `requirePermission()` / `.has()` / policy strings | **8 required-but-ungranted**; **5 granted-but-unrequired** in the platform plane, plus the enterprise vocabulary enforced by `tenantPolicy.js` (Appendix A.2; an earlier working figure of 24 is corrected and explained there) |
| **Live HTTP probes against the real Express app** | Five synthetic identities × 55 endpoint/verb combinations | 275 observations; probes 1–3 (Appendix A.3, A.4) |
| **Frontend→backend contract diff** | Every `get/post/patch/put/del()` string in `frontend/src/components/admin/**` and `frontend/src/pages/admin/**` mapped to the parser's route table | 10 unresolvable calls (Appendix A.5) |
| **Fixture-provenance audit** | Every `useState<…>(FIXTURE)` and every loader's `if (len>0)`/`catch` pair | 12 tabs affected (RCA-001) |
| **Configuration surface census** | `MODULE_DEFINITIONS`, quota constants, `FLAG_DEFINITIONS`, `TENANT_ROLES`, env-only knobs, policy tables | 34 CFG entries (Appendix §09) |
| **Dead-switch detection** | Grep each module key / feature flag / permission across backend+frontend consumers | 14 of 18 module toggles with no consumer (RCA-011) |
| **Test-coverage mapping** | `backend/test/*`, `backend/enterprise-test/*`, `frontend/tests/*` vs admin surfaces | 14 of 15 tabs uncovered; 1 authorisation-negative test file (Appendix A.6) |
| **Behavioural legacy comparison** | Legacy screen → its API calls → new screen → its API calls | §04 matrix, §07 divergence register |

### 3.1 Why the probes matter (methodological justification)

Static reading of `backend/index.js` initially suggested that **no** route under `/api/admin` or `/api/platform` was authorised, because the inline handlers carry no middleware. That conclusion was **wrong**, and it was disproved by probing: `[PROBE-001]` shows `USER` receives `403 FORBIDDEN` on all 23 sampled admin endpoints. The authoriser is a path-string table (`backend/security/policy.js:106-146`) mounted at `backend/index.js:499-508`, which no single-file read makes obvious.

The correction is recorded rather than hidden, because it is itself a finding: **an authorisation layer that a competent static reader cannot locate within one file is an authorisation layer that will be mis-modified.** It is the mechanism behind RCA-004 and RCA-008. Every subsequent authorisation statement in this document is grounded in a probe rather than in a reading.

---

## 4. Reproducibility

### 4.1 Environment

```
Node v22.22.3 / npm 10.9.8 (workspace default)
backend deps: npm ci --omit=optional + npm install sharp   (package-lock respected)
No MySQL, no Firebase project, no outbound network used by the probe.
```

### 4.2 Harness (Appendix A.3 carries the source)

```js
process.env.NODE_ENV = 'test';
const { setTokenVerifierForTests } = require('backend/security/auth');   // auth.js:290
setTokenVerifierForTests(async token => ({ /* USER | SUPPORT | AUDITOR | ADMIN | SUPER_ADMIN */ }));
const app = require('backend/index');                                    // full middleware stack
await require('supertest')(app).get('/api/admin/audit-logs')
  .set({ Authorization: 'Bearer auditor' });
```

### 4.3 Interpretation rule (declared before results were read)

| Observed status | Meaning |
|---|---|
| `403 FORBIDDEN` / `SUPER_ADMIN_MFA_REQUIRED` / `RECENT_AUTH_REQUIRED` | Authorisation denied — control works |
| `400` validation, `404` not found, `409` conflict, `500` provider error, `503` unavailable (any code incl. `ECONNREFUSED`) | **Authorisation passed**; the request reached business logic. A 404 therefore proves a *missing route*, not a denied one. |
| `200` | Authorisation passed and data returned |

This rule is what converts a DB-less environment into a usable authorisation oracle.

---

## 5. Limitations and how each was handled

| Limitation | Effect on conclusions | Mitigation |
|---|---|---|
| No MySQL/MariaDB instance | Data-dependent behaviour (revision conflicts, transaction audit) could not be executed | Authorisation conclusions unaffected (rule §4.3). Persistence claims cite the SQL and are marked C2. |
| No Firebase project | Identity-side effects (MFA enrolment, token revocation) could not be executed | Handlers return `500 app/invalid-credential` **after** passing authorisation; cited as proof of authorisation only, never as proof of function. |
| No production secrets | Could not verify secret redaction end-to-end | Redaction claims limited to the projection code (`publicAdminSettings`, `publicPaymentSettings`) and marked C2. |
| `reference-code/` is a *snapshot*, not a git history | Could not diff legacy against its own ancestors to date defects | Diffed snapshot against the new tree only (Appendix A.4). Where legacy defect age matters, it is stated as *present in the snapshot*, never as *introduced at commit X*. |
| No browser execution of the new console | Fixture/optimistic-UI claims are static (C2 for the exact rendered string, C3 for the code path) | Every claim cites the line that renders the message and the line that swallows the error, so a reviewer can confirm without a browser. |
| One branch, one commit (`35180d8`) | No attribution to authors or to individual changes | Defects attributed to *code location*, never to a person or a commit message. |

---

## 6. Confidence ledger

| Claim family | Confidence | Basis |
|---|---|---|
| Backend == legacy + patches | **C3** | Byte diffs (Appendix A.4) |
| Route inventory, guard classification, duplicate routes | **C3** | Deterministic parse + manual verification of every duplicate |
| Authorisation decisions per role (probes 1–3) | **C3** | Executed |
| Permission-vocabulary drift (8 / 5) | **C3** | Deterministic parse; each of the 8 verified by grep for a grant, each of the 5 verified absent from every code path |
| Fixture-backed console tabs | **C3** for the code path (citations); **C2** for what a user sees (no browser run) | Cited lines; no headless-browser run in this review |
| False-success messages | **C3** for the string and the swallow; **C3** for the target route's 404 (probe) | 14 call sites; `[PROBE-003]` |
| No role/permission tables | **C3** | Exhaustive `CREATE TABLE` grep across 27 migrations |
| Module toggles inert | **C3** | Per-key consumer census (Appendix A.7) |
| Consumer-product backend behaviour (out of scope) | **C1** | Not analysed; referenced only as dependency |
| Legacy *intent* behind each capability | **C1** | Inferred from screen + API + comment; inference basis stated per row in §03 |

---

## 7. Threats to the validity of this review (self-check)

1. **Severity inflation risk.** A control plane that lies is worse than no control plane, so CF-1/CF-2 are rated Critical. A reader who disagrees should note that the *individual* defects (a `.catch(() => {})`) are trivial; the rating is for the *class*, which is systemic across 12 files. §06 gives each instance its own line so the reader can re-rate.
2. **Backend-fairness risk.** The backend was rated on what it *does*, not on what it inherited. Two legacy behaviours that look like defects were assessed as **correct** and left alone: the `system.config.write` default for admin mutations (defensible), and the refusal to allow `SUPER_ADMIN` provisioning through the API (defensible, incompletely implemented).
3. **Coverage-optimism risk.** A 46 % "missing" figure could be inflated by counting legacy screens nobody uses. Each missing capability in §04 names the legacy callers and the data it reads/writes, so any row can be challenged on its own merits; RR-005 records the residual uncertainty about legacy usage frequency.
4. **Probe-artefact risk.** `NODE_ENV=test` enables test artefacts (e.g. `platform.js:1306-1315` returns a mock operator directory in test mode). Every probe result that could be affected by test-only behaviour is marked, and the mock path is named rather than silently used.
