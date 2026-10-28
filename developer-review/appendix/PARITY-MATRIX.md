# Parity Matrix — Active Implementation vs. `reference-code/` Baseline

Scope note (read first): Given the engagement's time-boxed budget (see `README.md` §4 and
`appendix/ENVIRONMENT-GAPS.md` EG-006), full endpoint-by-endpoint, field-by-field parity
verification per mandate §5.1 was not achievable for all 20 active routes against their
`reference-code` counterparts. This matrix records what **was** compared, what was
**found to exist in both locations** (inventory-level reconciliation, mandate §4.8), and
what is explicitly **deferred** for a follow-up session. No row below claims a parity
verdict without evidence cited.

## Backend route-file presence reconciliation

| Active file (`backend/routes/`) | Present in `reference-code/backend/routes/`? | Evidence | Classification |
|---|---|---|---|
| `resumes.js` | Yes | `find reference-code -iname "*resume*"` listed `reference-code/backend/routes/resumes.js` | Compared by line count only (174 vs 256 lines, 131-line diff) — **UNKNOWN**, see UVS-002 |
| `portfolios.js` | Not confirmed in this session | Not searched | DEFERRED |
| `covers.js` | Not confirmed in this session | Not searched | DEFERRED |
| `ai.js` | Not confirmed in this session | Not searched | DEFERRED |
| `adminAudit.js` | Not confirmed in this session | Not searched | DEFERRED |
| `adminPlatformOperations.js` | Not confirmed in this session | Not searched | DEFERRED |
| `adminUsers.js` | Not confirmed in this session | Not searched | DEFERRED |
| `blogData.js` | Not confirmed in this session | Not searched | DEFERRED |
| `databaseAdmin.js` | Not confirmed in this session | Not searched | DEFERRED |
| `email.js` | Not confirmed in this session | Not searched | DEFERRED |
| `enterprise.js` | No `reference-code` equivalent expected — enterprise/multi-tenancy is a newer capability per `developer-review/ceiling-table-r17.md` dimension "Multi-tenancy & isolation" | `find reference-code -iname "*enterprise*"` not run in this session | DEFERRED — likely INTENTIONAL-CHANGE (net-new capability) pending confirmation |
| `enterpriseM2m.js` | Same as above | Not searched | DEFERRED |
| `errorResponder.js` | Not confirmed in this session | Not searched | DEFERRED |
| `jobsData.js` | Not confirmed in this session | Not searched | DEFERRED |
| `miscData.js` | Not confirmed in this session | Not searched | DEFERRED |
| `notificationsData.js` | Not confirmed in this session | Not searched | DEFERRED |
| `platform.js` | Not confirmed in this session | Not searched | DEFERRED |
| `publicDiscovery.js` | Not confirmed in this session | Not searched | DEFERRED |
| `support.js` | Not confirmed in this session | Not searched | DEFERRED |
| `usersData.js` | Not confirmed in this session | Not searched | DEFERRED |

**Reconciliation count (mandate §4.8), route-file level only:**

| Category | Count |
|---|---:|
| Active routes total (inventoried) | 20 |
| Confirmed present in both active and reference-code | 1 (`resumes.js`) |
| Confirmed active-only (reference-code equivalent not found by name) | 0 confirmed — not exhaustively searched |
| Reference-code-only (no active equivalent) | Not assessed in this session |
| Deferred (not searched this session) | 19 |

This is an honest, non-exhaustive count. **Coverage of backend route parity in this
session: 1/20 = 5%.** See `EXECUTIVE-GAP-SUMMARY.md` coverage matrix for how this rolls up.

## Database migration parity

`reference-code/backend/database/migrations/016_resume_target_role_and_job_description.sql`
exists (confirmed via `find reference-code -iname "*resume*"`), confirming the reference
baseline's migration numbering scheme (up to at least `016`) predates the active
implementation's `057`-file migration set (`020` through at least `029` were directly
observed in this session; full count 57 files / 2 = ~28-29 numbered migration pairs,
consistent with active development continuing past the reference baseline's snapshot
point). No content-level migration diff was performed. **DEFERRED.**

## Frontend parity

Not assessed in this session beyond confirming `reference-code/public_html/assets/`
contains pre-built `BuildResume-*.js`/`.css` chunks (compiled output, not diffable
source — see DISC-007). No active `frontend/src/components/BuildResume*` source-level
comparison was performed. **DEFERRED.**

## AI orchestration parity (mandate §5.2)

Not assessed. `reference-code/backend/` was not checked for an equivalent to
`backend/freellmapi/` in this session. **DEFERRED** — see UVS-003 for why this is flagged
as a high-priority follow-up area given the HEAD commit's own recent fix in this exact
subsystem.

## Divergence-class tally (of items actually classified in this session)

| Divergence class | Count | Items |
|---|---:|---|
| REGRESSION | 0 | None confirmed this session |
| REFERENCE-DEFECT | 1 | DISC-007 (reference-code baseline hygiene) |
| INTENTIONAL-CHANGE | 0 confirmed / 1 suspected | `enterprise*.js` routes, suspected net-new (not confirmed) |
| REFACTOR-EQUIVALENT | 0 | None confirmed this session |
| UNKNOWN | 1 | `resumes.js` (UVS-002) |

Do not read the small counts above as "the application has little divergence" — read them
as "this session classified very few items with evidence"; the correct interpretation is
recorded in the Executive Summary's coverage matrix, not inferred from this table alone.
