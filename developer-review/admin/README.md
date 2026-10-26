# Admin Control Plane — Review, Coverage Analysis & Remediation Blueprint

**Repository:** `bhaskarbeyond-creator/ResumePilotAi` (product name in-product: *IME365 / ResumePilot*)
**Branch analysed:** `arena/55faaf92-resumepilotai` (head `35180d8`, branched from `dev`)
**Analysis date:** 2026-10-26
**Analysis type:** Read-only architectural, coverage, RBAC and defect review of the **admin control plane** (platform staff + super-admin) across the new frontend and the new backend, compared against the legacy production reference.
**Deliverable type:** Analysis **plus remediation**. The analysis below (documents 01–12) was the first phase and is preserved unchanged except where the code proved it wrong (corrections are catalogued in `OPEN-ITEMS.md §6`). The second phase executed the remediation on this branch and is documented in documents 13–19.

**Execution commits:** `b106012` (Phase 0: escalation ceiling, secret classification), `1d47922` (RBAC resolver), `b2803e1` (route manifest), `5ace3e6` (RBAC administration API).

---

## 1. How to read this set

| # | Document | Purpose | Primary audience |
|---|---|---|---|
| 00 | `README.md` (this file) | Index, evidence conventions, confidence markers, how to reproduce every empirical claim | Everyone |
| 01 | [01-executive-summary.md](01-executive-summary.md) | One-page synthesis: coverage, critical findings, defect counts, top recommendations, key divergences | Product owner, architect, release authority |
| 02 | [02-scope-and-method.md](02-scope-and-method.md) | Systems in scope, how legacy was used, techniques, reproducibility, limitations | Reviewer, auditor |
| 03 | [03-legacy-reference-inventory.md](03-legacy-reference-inventory.md) | Condensed legacy capability inventory with intent classification (CAP-001 … CAP-059) | Architect |
| 04 | [04-coverage-matrix.md](04-coverage-matrix.md) | Full capability-by-capability matrix (all 15 columns populated, no blanks) | Architect, QA lead |
| 05 | [05-swot.md](05-swot.md) | Evidence-backed SWOT, each item bound to a CAP / RCA / code reference | Product owner |
| 06 | [06-rca-register.md](06-rca-register.md) | 22 root-cause analyses: symptom → reproduction → root cause → blast radius → fix → risk → verification | Engineering lead |
| 07 | [07-intentional-divergence-register.md](07-intentional-divergence-register.md) | Every deliberate departure from legacy with rationale and preservation-of-intent proof | Architect |
| 08 | [08-admin-superadmin-rights-and-rbac.md](08-admin-superadmin-rights-and-rbac.md) | RBAC model, permission resolution, admin/super-admin surface map, invariant-by-invariant proof or gap, frontend↔backend authorization matrix | Security lead, architect |
| 09 | [09-configuration-gap-register.md](09-configuration-gap-register.md) | Every hard-coded value with proposed key, scope, default, validation, audit requirement, or a justification for staying code-level | Architect, product owner |
| 10 | [10-recommendations.md](10-recommendations.md) | 26 prioritised, actionable recommendations with exact required modification, impact, risk, effort, acceptance criteria | Engineering lead, product owner |
| 11 | [11-residual-risk-and-open-decisions.md](11-residual-risk-and-open-decisions.md) | Ambiguities with provisional analysis, exact question for a human owner, trade-offs | Product owner |
| 12 | [12-appendices.md](12-appendices.md) | Raw traceability logs, permission-vocabulary census, API contract diff, empirical probe harness + results, test-coverage analysis | Engineering lead |

| 13 | [COMPLETION-REPORT.md](COMPLETION-REPORT.md) | What shipped, what did not, and the 10/10 bar scored honestly | Release authority |
| 14 | [DECISION-LOG.md](DECISION-LOG.md) | Ten RR decisions resolved + twelve execution decisions + four analysis corrections | Release authority, architect |
| 15 | [TEST-EVIDENCE.md](TEST-EVIDENCE.md) | Exact commands, exact counts, per-suite proof, tier coverage | QA lead, CI owner |
| 16 | [SECURITY-AND-RBAC-PROOF.md](SECURITY-AND-RBAC-PROOF.md) | The six invariants with verdicts and the visibility-vs-enforcement matrix | Security lead |
| 17 | [UX-DEVICE-MATRIX.md](UX-DEVICE-MATRIX.md) | Five viewport classes: measured state, acceptance criteria, nine work items | Frontend lead |
| 18 | [DEPLOYMENT-RUNBOOK.md](DEPLOYMENT-RUNBOOK.md) | Pre-flight, apply, verify, three rollback levels, break-glass | Ops / on-call |
| 19 | [OPEN-ITEMS.md](OPEN-ITEMS.md) | Every remaining gap with file, acceptance criterion and dependency | Everyone |
| 20 | [decisions/](decisions/) | ADR-001…005: the five architectural decisions behind the remediation | Architect |

**Start here if you are deploying:** document 18. **Start here if you are reviewing the work:** document 13, then 15. **Start here if you are continuing it:** document 19.

Document order is also the recommended reading order for remediation planning.

---

## 2. Systems analysed (identity of each codebase)

The repository contains **four** distinct trees. Naming them precisely matters, because the review's central finding is a statement about *which* tree was rewritten.

| Tree | Role in this review | Evidence of identity |
|---|---|---|
| `reference-code/` | **Legacy reference — reference only.** Live Hostinger production snapshot, declared immutable. | `reference-code/README.md` (immutability policy, origin host, download timestamp 2026-10-25, deployed SHA `24ada353ad96a48ea4a2d46320e7c757d5671695` via `reference-code/backend/COMMIT_SHA`) |
| `src/` | **Legacy frontend source** (the SPA that produced `reference-code/public_html/assets/Admin-*.js`). Used as the legacy behavioural reference for admin UI/API intent. | `src/main.jsx:577` mounts `/admin/*` → `src/components/admin/Admin.jsx`; `reference-code/public_html/assets/Admin-*.js` are the same modules compiled. |
| `frontend/` | **New frontend** (TypeScript rewrite, Vite, React Router, Radix). The deliverable UI layer under assessment. | `frontend/package.json` (name `frontend`, `vite` 8.3, `react-router-dom` 7.18); `frontend/src/app/router.tsx:284-291` |
| `backend/` | **New backend** — the live service layer under assessment. | `backend/COMMIT_SHA` = `be7a33cd8754576d9cb95dadbfa21a5f2cbfbafb`; `backend/index.js` (7,573 lines) |

**Critical framing fact, proven in §02 and Appendix A.4:** the new **backend** is *not* a rewrite. For the admin control plane it is the legacy production backend plus a small set of hardening patches. `diff reference-code/backend/routes/adminUsers.js backend/routes/adminUsers.js` is **empty (0 lines)**; `routes/adminAudit.js` and `security/adminAudit.js` are also **0-line diffs**; `security/auth.js` differs by 108 lines, all of which are the `optionalAuth`/`bearerTokenFrom` refactor (DIR-071); `security/policy.js` differs by 46 lines (DIR-022, DIR-106 additions). The RBAC role map itself (`backend/security/auth.js:63-88`) is **byte-identical to legacy**. Therefore:

> The **new frontend admin console is a ground-up rewrite that has regressed**. The **new backend admin plane is the legacy admin plane carried forward**, so every legacy backend authorisation weakness persists unless it was explicitly patched — and several were not.

---

## 3. Scope boundary

**In scope (primary):** every platform-staff surface — routes under `/admin/*` in the new frontend; every backend route under `/api/admin/*` and `/api/platform/*`; the RBAC/permission model that governs them; the configuration values those surfaces read and write; the audit trail they produce.

**In scope (secondary, used as contrast):** the enterprise/tenant console (`frontend/src/pages/enterprise/console.tsx`, `frontend/src/components/enterprise/*`, `/api/enterprise/*`) — because it demonstrates a *better* role-bundle model that the platform control plane should adopt (see REC-005), and because two admin tabs delegate tenant data to it.

**Out of scope:** candidate-facing product features (resume builder, ATS scoring, job tracker, portfolio), employer portal, billing UX for end users, AI routing internals, DOCX/PDF rendering. These appear only where an admin capability depends on them.

---

## 4. Evidence conventions

Every claim in this set carries one of these evidence forms:

| Marker | Meaning |
|---|---|
| `path/file.ext:NN` | Exact source line(s) in this repository at the analysed head. |
| `path/file.ext:NN-MM` | Inclusive line range. |
| `[PROBE-nnn]` | Empirical HTTP probe executed against the real Express app inside this workspace. Harness and full result table in Appendix A.3 / A.4. Reproducible. |
| `[SQL-mmm]` | DDL in `backend/database/migrations/mmm_*.sql`. |
| `[DIFF-nn]` | Structural diff between `reference-code/` and `backend/` (Appendix A.4). |

### Confidence markers

| Code | Meaning | Usage rule in this document |
|---|---|---|
| **C3 — Verified** | Observed by executing code in this workspace, or a byte-exact citation of a line that cannot be interpreted another way. | Used without hedging. |
| **C2 — High confidence** | Direct code reading with a clear causal chain, not executed (typically because it needs a live database, Firebase tenant, or production secret). | Stated as fact about the code; consequences phrased as "will", with the unexecuted link named. |
| **C1 — Inference** | Reverse-engineered intent (e.g. what a legacy screen's business rule must have been, or why an author wrote something). | Always carries the word *inferred* and the reasoning basis. |

No claim in this set is below C1. There are no "TBD" cells: open decisions are marked `UNRESOLVED — decision required` with the exact question and trade-offs in §11.

---

## 5. Empirical harness (how to reproduce)

Two probes were executed against the **real** Express application with a deterministic token verifier, so that authorisation decisions (not data availability) are observed. Harness detail in Appendix A.3; summary:

* `NODE_ENV=test` + `setTokenVerifierForTests()` (`backend/security/auth.js:290`) issues five synthetic identities — `USER`, `SUPPORT`, `AUDITOR`, `ADMIN`, `SUPER_ADMIN` (the last with `firebase.sign_in_second_factor = 'totp'` so MFA gates pass).
* Requests are issued with `supertest` against `require('backend/index')`, i.e. the **whole** middleware stack: global `requireAuth`, `enforceApiPolicy` (`backend/security/policy.js:106`), the `/api/admin` write guard (`backend/index.js:625-632`), per-route middleware, and per-handler checks.
* Interpretation rule used throughout: **`403 FORBIDDEN` = authorization denies; any other status (200/400/404/500/503) = authorization passed and the request reached business logic.** A `503 ECONNREFUSED` on a guarded route is therefore *proof of authorisation*, not proof of function.
* No database, no Firebase project and no external network are required; MySQL absence surfaces as `503 ECONNREFUSED` and is explicitly named wherever it limits a conclusion.

---

## 6. Deliverable status against the engagement's Definition of Done

| Acceptance criterion | Where satisfied | Status |
|---|---|---|
| Document exists under `developer-review/admin/`, complete and internally consistent | This set (13 files) | ✅ |
| Every legacy capability in the coverage matrix with intent classification and non-blank status | §03 (CAP-001…CAP-059), §04 (all 59 rows) | ✅ |
| Every defect has a full RCA entry and a required modification | §06 (RCA-001…RCA-022), each linked to a REC in §10 | ✅ |
| Every capability gap has a documented required modification | §04 "Required modification" column + §10 (REC-001…REC-026) | ✅ |
| Every intentional divergence documented with rationale | §07 (DIV-001…DIV-018) | ✅ |
| SWOT evidence-backed, each item mapped to a recommendation or recorded risk | §05 (SW-01…SW-24, each row carries its mapping) | ✅ |
| Admin/super-admin invariants each proven or flagged with remediation | §08 §2 (INV-1…INV-6, six verdicts) and the INV-5 visibility↔enforcement matrix in §08 §3 | ✅ |
| Every hard-coded business rule flagged should-be-configurable with a key, or justified as code-level | §09 (CFG-001…CFG-034) | ✅ |
| A senior architect can drive remediation from the document without further analysis | §10 (REC-001…REC-026 with exact file/route/table modifications and acceptance tests) + §11 (10 open decisions with owner and trade-offs) + §12 (reproducible evidence) | ✅ |

---

## 7. Severity scale used throughout

| Severity | Definition used in this document |
|---|---|
| **Critical** | Produces a false operational or security assurance (an operator believes a control acted when it did not), **or** grants a lower-privileged staff role the ability to take over a higher-privileged account. |
| **High** | Materially breaks an invariant in §8.2, or makes a role's documented capability unusable, or exposes personal data beyond the role's stated purpose. |
| **Medium** | Degrades operability, auditability or configurability without immediate data/security loss; blocks a release gate. |
| **Low** | Correctness or maintainability debt with no user-visible or security consequence today. |

## 8. Counts (used in the executive summary)

| Metric | Value | Derivation |
|---|---|---|
| Legacy admin UI source lines | **29,777** | `src/components/admin/**`, `src/utils/adminData.js`, `src/utils/adminSetup.js`, `src/services/adminAiSettings.js`, `src/services/adminReauth.js` (`wc -l`) |
| New admin UI source lines | **8,252** | `frontend/src/pages/admin/console.tsx` + `frontend/src/components/admin/Admin*.tsx` (`wc -l`) |
| Legacy admin tab routes | **24** concrete (`26` incl. index + catch-all) | `src/components/admin/Admin.jsx:840-960` |
| New admin tabs | **15** (`14` + `modules` alias) | `frontend/src/pages/admin/console.tsx:39-55` |
| Legacy settings sub-screens | **31** | `src/components/admin/sidebar/sidebar.jsx:68-111` (`SETTINGS_GROUPS`) |
| New settings sections | **5** | `frontend/src/components/admin/AdminSettingsTab.tsx:112-196` |
| Distinct `/api/admin` + `/api/platform` endpoints (new backend) | **145** | Appendix A.1 |
| …with route-level permission middleware | **61 registrations / 60 distinct routes** | Appendix A.1 |
| …with an inline handler-level permission check | **24** | Appendix A.1 |
| …relying on the path-string policy (`enforceApiPolicy`) for their only authorisation | **66 distinct routes** (70 registrations), of which **24** also perform an inline handler check | Appendix A.1 |
| Duplicate route registrations with divergent guards | **4** (plus 2 duplicate router mounts) | RCA-018, Appendix A.1 |
| Permission strings required but granted to no role | **8** (`system.config.read`, `secrets.manage`, `users.export`, `users.security.manage`, `payments.write`, `system.config.manage`, `messages.read`, `tenant.support.access`) | Appendix A.2 |
| Permission strings granted to a role but never required (platform plane) | **5** (`notifications.send`, `blog.read`, `users.delete`, `tenants.write`, `tenants.manage`) | Appendix A.2.2 |
| Frontend→backend calls to endpoints that do not exist | **13 distinct paths** (15 call sites) | RCA-003, Appendix A.5 |
| Frontend admin tabs with no dedicated UI test | **14 of 15** (only `ai-settings` is covered) | Appendix A.6 |
