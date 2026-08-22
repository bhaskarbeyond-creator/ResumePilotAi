# Super Admin `/adm` SWOT — Evidence-Based

**Assessment date:** 2026-08-22 UTC. This is not a certification document; it records verified strengths and unresolved conditions.

## Strengths

| Strength | Evidence | Status |
|---|---|---|
| Server-side Firebase token validation and revoked-token check | `backend/security/auth.js` uses `verifyIdToken(token, true)` | PASS local |
| Clear SUPER_ADMIN route primitive | `requireSuperAdmin` in `backend/security/auth.js` | PASS local |
| Tenant registry decoupled from feature-gated Enterprise URLs | `backend/routes/platform.js`; `PlatformTenants.jsx` uses `/api/platform/tenants` | PASS local |
| Destructive platform controls require typed confirmation | tenant lifecycle and queue replay routes + `AdminDialog` | PASS local |
| Generic SUPER_ADMIN target protection | `/api/admin/users/:uid` and `/api/admin/delete-user` return `SUPER_ADMIN_TARGET_PROTECTED` | PASS local |
| Audit-value redaction | `backend/security/adminAudit.js` redacts key/token/password/card-like fields | PASS local |
| Queue telemetry avoids synthetic health | platform health/queue routes return unavailable states rather than zeroes | PASS local |
| Existing consumer/enterprise regression baseline | `npm run test:product`, `npm --prefix backend test`, `npm run test:enterprise`, `npm run test:security` | PASS local |

## Weaknesses

| ID | Evidence | Severity | RCA | Mitigation | Status |
|---|---|---:|---|---|---|
| W-01 | Public external probe on 2026-08-22 returned HTTP 500 for `/`, `/adm`, `/enterprise`, and `/index.html`; API health/readiness still answered JSON | P0 | Static SPA artifact/docroot/rewrite deployment drift; exact remote filesystem could not be inspected because configured SSH alias was unavailable | Restore/verify static `index.html`, assets and deployed `.htaccess`; run authenticated `/adm` smoke before any certification | FAIL live |
| W-02 | No accessible authenticated production Super Admin credential/session in this workspace | P0 verification gate | Live auth, CRUD, audit, MFA and role-denial flows cannot be ethically or technically simulated with production data | Use approved disposable QA identities and the production runbook | UNVERIFIED |
| W-03 | Playwright Chromium download failed in this sandbox; no system browser binary exists | P1 verification gate | Sandbox network/browser runtime limitation | Run `npx playwright install chromium` or set the documented executable path in a browser-capable CI runner | UNVERIFIED |
| W-04 | Users manager retains legacy all-record client load and lacks a complete server-paginated/filter contract | P2 | Legacy consumer-admin implementation predates platform scale architecture | Add a server-side user directory/query API and prove cursor pagination | UNVERIFIED |
| W-05 | Admin audit UI currently has client filtering/client CSV; full cursor deep-link proof is absent | P2 | Audit API supports cursor but UI has not been end-to-end browser-certified for it | Implement server-backed cursor controls/deep links and browser tests | UNVERIFIED |
| W-06 | Production readiness reports encryption `none`, scheduler disabled, notification outbox disabled, PDF renderer requires isolated worker | P1 | Runtime configuration/operational deployment posture, not a local code assertion | Configure and independently verify required runtime services according to operations runbook | FAIL/UNVERIFIED live |
| W-07 | The static production probe cannot access deployment SSH target (`airesume` host alias unresolved) | P1 deployment gate | Sandbox has no configured deployment connection/hostname alias | Reconnect deployment target in Arena; never attempt blind deployment | UNVERIFIED |

## Opportunities

| Opportunity | Basis | Recommended next action | Status |
|---|---|---|---|
| Server-paginated global user directory | Existing user role/suspension/membership API is field-safe but list is legacy Firestore read | Build `/api/admin/users` cursor/search/filter contract and move roster UI to it | UNVERIFIED |
| Audit investigation UX | Audit schema has actor/action/category/outcome and request ID fields | Add server-backed cursor, deep-link query state, saved filters, and export audit | UNVERIFIED |
| Deployment integrity verification | API health exists but frontend static route failure was observed | Release script should validate `/`, `/adm`, SPA asset manifest, backend SHA and rollback artifact | UNVERIFIED |
| Accessible unified modal migration | `AdminDialog` is now available | Migrate remaining legacy dialogs to shared focus-trapped primitive | UNVERIFIED |

## Threats

| ID | Threat | Severity | Evidence/RCA | Mitigation | Status |
|---|---|---:|---|---|---|
| T-01 | Static frontend outage leaves API healthy but `/adm` inaccessible | P0 | Live probe split-brain: health APIs 200, SPA HTTP 500 | Treat static route health as a release gate; rollback broken static deployment | FAIL live |
| T-02 | Privilege escalation through generic user controls | P0 avoided locally | Generic mutation now checks target `SUPER_ADMIN`; role mutation requires wildcard server permission | Maintain integration tests for USER/SUPPORT/ADMIN/SUPER_ADMIN matrix | PASS local; live UNVERIFIED |
| T-03 | Accidental replay of active queue work | P1 avoided locally | Replay endpoint previously accepted existing non-DLQ jobs; now validates DLQ state, typed confirmation, recent auth | Keep replay API integration test and audit review | PASS local; live UNVERIFIED |
| T-04 | Route drift between `/adm` and enterprise rollout flag | P1 avoided locally | Tenant UI formerly called feature-gated `/api/enterprise/platform/tenants` | Keep `test:admin:contract` and route-matrix review | PASS local; live UNVERIFIED |
| T-05 | Browser-only proof omitted due tool constraints | P1 | Chromium unavailable; no screenshots inspected in this sandbox | Run browser suite in a capable environment; inspect generated screenshots manually | UNVERIFIED |

## Conclusion

The local implementation has reduced several material risks, but W-01/W-02/W-03/W-07 prevent production certification. The correct final state today is **NO-GO**, not a qualified 10/10 claim.
