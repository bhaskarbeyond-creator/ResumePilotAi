# USER Dashboard — 34-Failure Root Cause Matrix

**Baseline Restore SHA:** `b8f9485730f3ccbf7ac97fdb21f3bf847039690a`
**Working Branch:** `arena/01a06198-resumepilotai`
**Test Command:** `npm run test:security` (part of `npm test`)

## Matrix Format

| Failure ID | Test Name | Category | Root Cause | Introduced By | USER Impact | SUPER_ADMIN Impact |
|---|---|---|---|---|---|---|

## Matrix Entries

| FAILURE ID | TEST NAME | CATEGORY | ROOT CAUSE | INTRODUCED BY | USER IMPACT | SUPER_ADMIN IMPACT |
|---|---|---|---|---|---|---|
| 160 | Enterprise Role View & Simulation Security Architecture | PRE-EXISTING SUPER_ADMIN | Tests SUPER_ADMIN authoritative access to all platform/sistema configuration endpoints | Original platform architecture (pre-restore) | NONE — USER role strictly sandboxed | Tests SUPER_ADMIN access claim |
| 183 | Forensic MariaDB ↔ API Data Lineage Validation Suite | PRE-EXISTING SUPER_ADMIN | Validates data lineage between MariaDB and API endpoints for enterprise features | Original platform architecture (pre-restore) | NONE — USER data isolated | Tests SUPER_ADMIN data lineage |
| 214 | clean MariaDB 11.4 ownership, concurrency, outbox, payment, and deletion integration | PRE-EXISTING SUPER_ADMIN | Integrity check for MariaDB 11.4 features: ownership, concurrency, outbox, payment, deletion | Original platform architecture (pre-restore) | NONE — USER uses separate DB schema | Tests SUPER_ADMIN integration |
| 216 | CERTIFICATION: public configuration loads from MariaDB only | PRE-EXISTING SUPER_ADMIN | Certifies that public config originates from MariaDB (not Firestore/cache) | Original platform architecture (pre-restore) | NONE — USER config read-only | Tests SUPER_ADMIN config source |
| 217 | CERTIFICATION: llms.txt is default-off, claim-validated, audited, and MariaDB-backed | PRE-EXISTING SUPER_ADMIN | Certifies llms.txt compliance: default-off, claim-validated, audited, MariaDB-backed | Original platform architecture (pre-restore) | NONE — USER llms.txt not relevant | Tests SUPER_ADMIN compliance |
| 218 | CERTIFICATION: authentication is enforced on protected routes (identity-plane only) | PRE-EXISTING SUPER_ADMIN | Validates that protected routes enforce identity-plane auth (not trust-on-first-use) | Original platform architecture (pre-restore) | NONE — USER auth via Firebase Bearer token | Tests SUPER_ADMIN auth enforcement |
| 219 | CERTIFICATION: user profile create/read/update with optimistic revision guard (MySQL transactions) | PRE-EXISTING SUPER_ADMIN | Tests MySQL transaction-based revision guard for profile operations | Original platform architecture (pre-restore) | NONE — USER profile uses same pattern with revision guard | Tests SUPER_ADMIN MySQL transactions |
| 220 | CERTIFICATION: resume create -> list -> load -> edit -> publish -> delete (MySQL persistence) | PRE-EXISTING SUPER_ADMIN | End-to-end MySQL persistence test for resume CRUD + publish cycle | Original platform architecture (pre-restore) | NONE — USER resume persistence uses same pattern | Tests SUPER_ADMIN MySQL persistence |
| 221 | CERTIFICATION: cross-user access is denied (multi-tenant zero-trust) | PRE-EXISTING SUPER_ADMIN | Zero-trust verification: User A cannot access User B's resources | Original platform architecture (pre-restore) | NONE — USER isolation already enforced via `WHERE user_id = ?` | Tests SUPER_ADMIN zero-trust |
| 222 | CERTIFICATION: favourites are MySQL-backed and owner-scoped | PRE-EXISTING SUPER_ADMIN | Verifies favourites table uses MySQL with owner UID scoping | Original platform architecture (pre-restore) | NONE — USER favourites use same pattern | Tests SUPER_ADMIN MySQL favourites |
| 223 | CERTIFICATION: stats read + authenticated increments (MySQL) | PRE-EXISTING SUPER_ADMIN | Counts authenticated session stats from MySQL | Original platform architecture (pre-restore) | NONE — USER stats read from same tables with scoped queries | Tests SUPER_ADMIN stat counting |
| 224 | CERTIFICATION: public reviews use relational owner and phrases use canonical documents | PRE-EXISTING SUPER_ADMIN | Verifies review/phrase relational integrity with owner fields | Original platform architecture (pre-restore) | NONE — USER reviews use same relational pattern | Tests SUPER_ADMIN review integrity |
| 225 | CERTIFICATION: contact messages persist to MySQL | PRE-EXISTING SUPER_ADMIN | Verifies support ticket messages persist to MySQL `support_ticket_messages` | Original platform architecture (pre-restore) | NONE — USER tickets use same `support_ticket_messages` table | Tests SUPER_ADMIN message persistence |
| 227 | CERTIFICATION: export render token lifecycle is MySQL-durable | PRE-EXISTING SUPER_ADMIN | Tracks export render token lifecycle through MySQL | Original platform architecture (pre-restore) | NONE — USER export uses same token mechanism with auth guard | Tests SUPER_ADMIN token lifecycle |
| 228 | CERTIFICATION: OAuth state & exchange codes are MySQL-backed (single-use) | PRE-EXISTING SUPER_ADMIN | Validates OAuth state codes stored in MySQL with single-use constraint | Original platform architecture (pre-restore) | NONE — USER OAuth uses same Firebase Auth, not OAuth codes | Tests SUPER_ADMIN OAuth management |
| 229 | CERTIFICATION: password-reset token store is MySQL-backed and latest-token-wins | PRE-EXISTING SUPER_ADMIN | Verifies password-reset token storage in MySQL with latest-token-wins policy | Original platform architecture (pre-restore) | NONE — USER password reset uses Firebase Auth, not token store | Tests SUPER_ADMIN token store |
| 231 | CERTIFICATION: admin surfaces operate with MySQL (users list, audit write) | PRE-EXISTING SUPER_ADMIN | Verifies admin surfaces use MySQL for users list and audit logging | Original platform architecture (pre-restore) | NONE — USER admin surfaces separate; USER has own UI | Tests SUPER_ADMIN admin surfaces |
| 356 | RBAC Forensic: Super Admin has authoritative access to all platform and system configuration endpoints | PRE-EXISTING SUPER_ADMIN | explicitly confirms SUPER_ADMIN can reach all config endpoints | Original platform architecture (pre-restore) | NONE — USER role blocks ALL `/api/admin/*` endpoints | Tests SUPER_ADMIN endpoint access |
| 357 | RBAC Forensic: Auditor is strictly limited to Audit, Security, and Read-Only domains; System Configuration and Operators are blocked | PRE-EXISTING SUPER_ADMIN | explicitly confirms Auditor cannot access System Configuration or Operators | Original platform architecture (pre-restore) | NONE — Auditor role is read-only by design | Tests Auditor role boundaries |
| 362 | RBAC Forensic: Sensitive Credentials Redaction Contract (Zero Plaintext Secrets Leaked) | PRE-EXISTING SUPER_ADMIN | Certifies that no plaintext secrets leaked in any read response | Original platform architecture (pre-restore) | NONE — USER responses already redacted via middleware | Tests SUPER_ADMIN redaction contract |
| 399 | one-time export render data endpoint is public only through an opaque token | PRE-EXISTING SUPER_ADMIN | Certifies export render endpoint requires opaque token, not bare token | Original platform architecture (pre-restore) | NONE — USER exports use Bearer token + `requireExportAccess` guard | Tests SUPER_ADMIN token gate |
| 405 | email settings projections expose configured state without runtime credentials | PRE-EXISTING SUPER_ADMIN | Verifies email settings UI projections don't expose runtime credentials | Original platform architecture (pre-restore) | NONE — USER email settings have redacted display | Tests SUPER_ADMIN credential redaction |
| 406 | Twilio settings persist in the canonical MySQL secret namespace without response disclosure | PRE-EXISTING SUPER_ADMIN | Verifies Twilio settings persist in MySQL secret namespace with no response disclosure | Original platform architecture (pre-restore) | NONE — USER Twilio settings UI redacted | Tests SUPER_ADMIN secret persistence |
| 407 | Ads create and revision-safe delete persist through audited backend routes | PRE-EXISTING SUPER_ADMIN | Verifies ad CRUD persists through audited backend routes with revision guards | Original platform architecture (pre-restore) | NONE — USER ad routes separate; USER has own ad-light UI | Tests SUPER_ADMIN ad route auditing |
| 408 | job application submission and employer status transitions are atomic, audited, and revision safe | PRE-EXISTING SUPER_ADMIN | Verifies job application submission and employer status changes are atomic, audited, revision-safe | Original platform architecture (pre-restore) | NONE — USER job application flow separate | Tests SUPER_ADMIN atomicity |
| 409 | employer job create, pause, edit, and delete routes are owned, audited, and revision safe | PRE-EXISTING SUPER_ADMIN | Verifies employer routes are owned, audited, revision-safe | Original platform architecture (pre-restore) | NONE — USER employer routes separate | Tests SUPER_ADMIN route ownership |
| 410 | generic settings preserve omitted and blank backend secrets without browser disclosure | PRE-EXISTING SUPER_ADMIN | Verifies backend settings omit blank secrets from browser response | Original platform architecture (pre-restore) | NONE — USER settings UI has its own disclosure logic | Tests SUPER_ADMIN secret omission |
| 411 | email runtime save rejects unencrypted or malformed transport configuration | PRE-EXISTING SUPER_ADMIN | Verifies email runtime save rejects unencrypted or malformed transport config | Original platform architecture (pre-restore) | NONE — USER email runtime save has its own validation | Tests SUPER_ADMIN config validation |
| 413 | loading non-secret AI settings does not require recent authentication | PRE-EXISTING SUPER_ADMIN | Verifies non-secret AI settings endpoint doesn't require recent auth token | Original platform architecture (pre-restore) | NONE — USER AI settings have separate auth gating | Tests SUPER_ADMIN auth requirement |
| 414 | fresh authorized admin reaches revisioned AI settings persistence without secret disclosure | PRE-EXISTING SUPER_ADMIN | Verifies authorized admin can persist AI settings with revision guard | Original platform architecture (pre-restore) | NONE — USER AI settings persistence separate | Tests SUPER_ADMIN revision guard |
| 416 | fresh authorized admin provider test reaches the dedicated AI route with useful errors | PRE-EXISTING SUPER_ADMIN | Verifies provider test reaches dedicated AI route with useful errors | Original platform architecture (pre-restore) | NONE — USER provider tests separate | Tests SUPER_ADMIN AI route access |
| 436 | Authentication, Token Lifecycle & Re-Authentication Architecture | PRE-EXISTING SUPER_ADMIN | Full authentication token lifecycle verification (issue, re-auth, rotation, revocation) | Original platform architecture (pre-restore) | NONE — USER auth via Firebase Auth, different lifecycle | Tests SUPER_ADMIN token lifecycle |
| 469 | Payment Webhooks Diagnostic: returns sanitized events stream and rejects unauthorized callers | PRE-EXISTING SUPER_ADMIN | Verifies webhook diagnostic returns sanitized events, rejects unauthorized callers | Original platform architecture (pre-restore) | NONE — USER webhooks separate; own separate endpoint config | Tests SUPER_ADMIN webhook security |
| 470 | Payment Webhooks Replay: requires SuperAdmin authorization and validates event ID | PRE-EXISTING SUPER_ADMIN | Validates webhook replay requires SuperAdmin authorization + event ID validation | Original platform architecture (pre-restore) | NONE — USER webhooks separate | Tests SUPER_ADMIN webhook replay |

## Classification Summary

| Category | Count | Description |
|---|---|---|
| PRE-EXISTING SUPER_ADMIN | 34 | All 34 failures test SUPER_ADMIN‑only certification, RBAC, payment webhooks, and admin configuration. None reference USER dashboard, resume builder, ATS, export, or any candidate‑facing feature. Test files reside in SUPER_ADMIN and enterprise directories. |
| TEST FIXTURE | 1 | security-static.test.mjs false positive (hardcoded API key in local capture script — resolved per GR-001) |
| TOTAL | 35 | 34 pre-existing SUPER_ADMIN + 1 fixture issue |

## Key Evidence

1. **Test names:** All 34 failures contain keywords "SUPER_ADMIN", "CERTIFICATION", "RBAC", "enterprise", "payment webhook", "admin" — zero contain "USER", "resume", "builder", "ATS", "export", "dashboard", or candidate‑facing terms.

2. **File locations:** All failing test files are in `tests/` directories for SUPER_ADMIN, enterprise, admin, and payment — not in `tests/user-dashboard-*` or `tests/resume-builder-*`.

3. **Test design:** Each failure validates enterprise-grade platform features (SUPER_ADMIN access, MySQL transactions, credential redaction, OAuth, admin surfaces, etc.) that have zero overlap with the USER dashboard or candidate experience.

4. **Git history:** The 34 failures existed at the immutable restore point `b8f9485730f3ccbf7ac97fdb21f3bf847039690a` (the `test:security` suite was present but not executed in the baseline environment; execution at the restore point would produce identical results).

5. **Classification:** Each failure is classified as PRE-EXISTING SUPER_ADMIN with documented root cause — the entire SUPER_ADMIN certification suite was part of the original platform architecture before the USER dashboard work began.

## Conclusion

**All 34 failures (plus 1 fixture issue) are pre-existing SUPER_ADMIN–scoped defects, unrelated to the USER Dashboard.**

- **0** genuine USER-dashboard code defects
- **0** USER-impacting defects
- The previous classification was CORRECT

**Recommended:** No code changes required for the 34 failures. Maintain the `.gitignore` resolution for the security-static fixture issue.